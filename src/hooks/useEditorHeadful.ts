import { useState, useEffect, useCallback, useRef } from 'react';
import { Task, Action } from '../types';

export const useEditorHeadful = (
    _currentTask: Task,
    isHeadfulOpen: boolean | undefined,
    updateAction: (id: string, updates: Partial<Action>, saveImmediately: boolean) => void,
    onNotify: (msg: string, tone?: 'success' | 'error') => void,
    onStopHeadful?: () => void
) => {
    const [isInspectMode, setIsInspectMode] = useState(false);
    const [isInspectLoading, setIsInspectLoading] = useState(false);
    const [activeInspectActionId, setActiveInspectActionId] = useState<string | null>(null);
    const [selectorOptionsById, setSelectorOptionsById] = useState<Record<string, string[]>>({});

    const activeInspectActionIdRef = useRef<string | null>(null);
    useEffect(() => { activeInspectActionIdRef.current = activeInspectActionId; }, [activeInspectActionId]);

    const onStopHeadfulRef = useRef(onStopHeadful);
    useEffect(() => { onStopHeadfulRef.current = onStopHeadful; }, [onStopHeadful]);

    useEffect(() => {
        if (!isHeadfulOpen) {
            setIsInspectMode(false);
            setIsInspectLoading(false);
        }
    }, [isHeadfulOpen]);

    useEffect(() => {
        let eventSource: EventSource | null = null;
        if (isHeadfulOpen) {
            eventSource = new EventSource('/api/headful/selector_stream');
            eventSource.onmessage = (e) => {
                try {
                    const data = JSON.parse(e.data);
                    const inspectId = activeInspectActionIdRef.current;
                    if (data.selector && inspectId) {
                        try {
                            const parsed = JSON.parse(data.selector);
                            if (Array.isArray(parsed) && parsed.length > 0) {
                                setSelectorOptionsById(prev => ({ ...prev, [inspectId]: parsed }));
                                updateAction(inspectId, { selector: parsed[0] }, true);
                            } else {
                                updateAction(inspectId, { selector: data.selector }, true);
                            }
                        } catch {
                            updateAction(inspectId, { selector: data.selector }, true);
                        }
                        setActiveInspectActionId(null);
                        onStopHeadfulRef.current?.();
                    }
                } catch (err) { }
            };
        }
        return () => {
            if (eventSource) eventSource.close();
        };
    }, [isHeadfulOpen, updateAction]);

    const handleToggleInspect = useCallback(async () => {
        const nextState = !isInspectMode;
        setIsInspectLoading(true);
        try {
            const res = await fetch('/api/headful/inspect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: nextState })
            });
            if (!res.ok) throw new Error('Failed to toggle inspect mode');
            setIsInspectMode(nextState);
            onNotify(`Inspect mode ${nextState ? 'enabled' : 'disabled'}`, 'success');
        } catch (e) {
            onNotify('Failed to toggle inspect mode', 'error');
        } finally {
            setIsInspectLoading(false);
        }
    }, [isInspectMode, onNotify]);

    return {
        isInspectMode,
        isInspectLoading,
        activeInspectActionId,
        setActiveInspectActionId,
        selectorOptionsById,
        handleToggleInspect
    };
};

export const useEditorProxies = () => {
    const [proxyList, setProxyList] = useState<{ id: string }[]>([]);
    const [proxyListLoaded, setProxyListLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const loadProxies = async () => {
            try {
                const res = await fetch('/api/settings/proxies', { credentials: 'include' });
                if (!res.ok) throw new Error('Failed to load proxies');
                const data = await res.json();
                if (cancelled) return;
                setProxyList(Array.isArray(data.proxies) ? data.proxies : []);
            } catch {
                if (!cancelled) setProxyList([]);
            } finally {
                if (!cancelled) setProxyListLoaded(true);
            }
        };
        loadProxies();
        return () => { cancelled = true; };
    }, []);

    return { proxyList, proxyListLoaded };
};
