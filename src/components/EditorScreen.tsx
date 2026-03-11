import { useState, useEffect, useRef, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import MaterialIcon from './MaterialIcon';
import { Task, TaskMode, ViewMode, VarType, Action, Results, ConfirmRequest } from '../types';
import RichInput from './RichInput';
import CodeEditor from './CodeEditor';
import ActionPalette from './editor/ActionPalette';
// import JsonEditorPane from './editor/JsonEditorPane';
import ResultsPane from './editor/ResultsPane';
import ActionItem from './editor/ActionItem';
import TaskSettingsCabinet from './editor/TaskSettingsCabinet';

const blockStartTypes = new Set(['if', 'while', 'repeat', 'foreach', 'on_error']);

interface EditorScreenProps {
    currentTask: Task;
    setCurrentTask: Dispatch<SetStateAction<Task | null>>;
    tasks?: Task[];
    editorView: ViewMode;
    setEditorView: (view: ViewMode) => void;
    isExecuting: boolean;
    onSave: (task?: Task, createVersion?: boolean) => Promise<void>;
    onRun: () => void;
    results: Results | null;
    pinnedResults?: Results | null;
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
    onPinResults?: (results: Results) => void;
    onUnpinResults?: () => void;
    onRunSnapshot?: (task: Task) => void;
    runId?: string | null;
    onStop?: () => void;
    isHeadfulOpen?: boolean;
    onOpenHeadful?: (url: string, targetActionId?: string, taskSnapshot?: Task, variables?: any) => void;
    onStopHeadful?: () => void;
    useNovnc?: boolean | null;
}

const _VariableRow: React.FC<{
    name: string;
    def: any;
    updateVariable: (oldName: string, name: string, type: VarType, value: any) => void;
    removeVariable: (name: string) => void;
}> = ({ name, def, updateVariable, removeVariable }) => {
    const [localName, setLocalName] = useState(name);

    useEffect(() => {
        setLocalName(name);
    }, [name]);

    return (
        <div className="flex gap-2 items-center">
            <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={() => {
                    if (localName !== name) updateVariable(name, localName, def.type, def.value);
                }}
                placeholder="Variable name"
                aria-label="Variable name"
                className="var-name flex-1 bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white"
            />
            <select
                value={def.type}
                onChange={(e) => updateVariable(name, name, e.target.value as VarType, def.value)}
                aria-label="Variable type"
                className="custom-select var-type bg-white/[0.05] border border-white/10 rounded-xl px-2 py-2 text-[8px] font-bold uppercase text-white/40"
            >
                <option value="string">STR</option>
                <option value="number">NUM</option>
                <option value="boolean">BOOL</option>
            </select>
            <div className="flex-1">
                {def.type === 'boolean' ? (
                    <select
                        value={String(def.value)}
                        onChange={(e) => updateVariable(name, name, def.type, e.target.value)}
                        aria-label="Variable value"
                        className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white"
                    >
                        <option value="true">True</option>
                        <option value="false">False</option>
                    </select>
                ) : (
                    <input
                        type={def.type === 'number' ? 'number' : 'text'}
                        value={def.value}
                        onChange={(e) => updateVariable(name, name, def.type, e.target.value)}
                        aria-label="Variable value"
                        className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white"
                    />
                )}
            </div>
            <button
                onClick={() => removeVariable(name)}
                className="p-2 text-red-500 hover:text-red-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                aria-label={`Remove variable ${name}`}
                title="Remove variable"
            >×</button>
        </div>
    );
};

const EditorScreen: React.FC<EditorScreenProps> = ({
    currentTask,
    setCurrentTask,
    tasks = [],
    editorView,
    setEditorView: _setEditorView,
    isExecuting,
    onSave,
    onRun,
    results,
    pinnedResults,
    onConfirm,
    onNotify,
    onPinResults,
    onUnpinResults,
    onRunSnapshot,
    runId,
    onStop,
    isHeadfulOpen,
    onOpenHeadful,
    onStopHeadful,
    useNovnc,
}) => {
    const [_copied, setCopied] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
    const dragPointerIdRef = useRef<number | null>(null);
    const actionsListRef = useRef<HTMLDivElement | null>(null);
    const [, setActionClipboard] = useState<Action | null>(null);
    const [dragState, setDragState] = useState<{
        id: string;
        startY: number;
        currentY: number;
        height: number;
        index: number;
        originTop: number;
        pointerOffset: number;
    } | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [_versions, setVersions] = useState<{ id: string; timestamp: number; name: string; mode: TaskMode }[]>([]);
    const [_versionsLoading, setVersionsLoading] = useState(false);
    const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
    const [isCabinetOpen, setIsCabinetOpen] = useState(false);
    const [cabinetTab, setCabinetTab] = useState<'mode' | 'variables' | 'behavior' | 'extraction' | 'api' | 'history'>('mode');

    const handleOpenCabinet = (tab: typeof cabinetTab = 'mode') => {
        setCabinetTab(tab);
        if (tab === 'history') loadVersions();
        setIsCabinetOpen(true);
    };

    const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const [actionPaletteQuery, setActionPaletteQuery] = useState('');
    const [actionPaletteTargetId, setActionPaletteTargetId] = useState<string | null>(null);
    const [actionPaletteInsertIndex, setActionPaletteInsertIndex] = useState<number | null>(null);
    const [versionPreview, setVersionPreview] = useState<{ id: string; timestamp: number; snapshot: Task } | null>(null);
    const [_versionPreviewLoading, setVersionPreviewLoading] = useState(false);
    const [actionStatusById, setActionStatusById] = useState<Record<string, 'running' | 'success' | 'error' | 'skipped'>>({});
    const [proxyList, setProxyList] = useState<{ id: string }[]>([]);
    const [proxyListLoaded, setProxyListLoaded] = useState(false);
    const [isResultsOpen, setIsResultsOpen] = useState(false);
    const [isInspectMode, setIsInspectMode] = useState(true);
    const [isInspectLoading, setIsInspectLoading] = useState(false);
    const [activeInspectActionId, setActiveInspectActionId] = useState<string | null>(null);
    const activeInspectActionIdRef = useRef<string | null>(null);
    useEffect(() => { activeInspectActionIdRef.current = activeInspectActionId; }, [activeInspectActionId]);
    const [selectorOptionsById, setSelectorOptionsById] = useState<Record<string, string[]>>({});
    const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
    const [canvasScale, setCanvasScale] = useState(1);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
    const spaceHeldRef = useRef(false);
    const canvasViewportRef = useRef<HTMLDivElement | null>(null);
    const hasInitializedCanvas = useRef(false);
    const [triggerExpanded, setTriggerExpanded] = useState(false);
    const headfulFrameRef = useRef<HTMLDivElement | null>(null);
    const canvasScaleRef = useRef(canvasScale);
    useEffect(() => { canvasScaleRef.current = canvasScale; }, [canvasScale]);

    const historyRef = useRef<Task[]>([]);
    const historyPointerRef = useRef<number>(-1);
    const isUndoRedoActionRef = useRef<boolean>(false);
    const lastSavedSnapshotRef = useRef<string>('');

    const currentTaskRef = useRef(currentTask);
    useEffect(() => { currentTaskRef.current = currentTask; }, [currentTask]);

    const isHeadfulOpenRef = useRef(isHeadfulOpen);
    useEffect(() => {
        isHeadfulOpenRef.current = isHeadfulOpen;
        if (!isHeadfulOpen) {
            setIsInspectMode(false);
            setIsInspectLoading(false);
        }
    }, [isHeadfulOpen]);

    const onStopHeadfulRef = useRef(onStopHeadful);
    useEffect(() => { onStopHeadfulRef.current = onStopHeadful; }, [onStopHeadful]);

    useEffect(() => {
        let eventSource: EventSource | null = null;
        if (isHeadfulOpen) {
            setIsInspectMode(true);
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

                        // Optionally disable inspect mode after picking:
                        // setIsInspectMode(false);
                        // fetch('/api/headful/inspect', {
                        //    method: 'POST',
                        //    headers: { 'Content-Type': 'application/json' },
                        //    body: JSON.stringify({ enabled: false })
                        // });
                    }
                } catch (err) { }
            };
        }
        return () => {
            if (eventSource) {
                eventSource.close();
            }
            if (isHeadfulOpenRef.current) {
                onStopHeadfulRef.current?.();
            }
        };
    }, [isHeadfulOpen, activeInspectActionId]);

    const handleAutoSave = useCallback((task?: Task) => {
        onSave(task || currentTaskRef.current, false);
    }, [onSave]);

    const getStoredSplitPercent = () => {
        try {
            const stored = localStorage.getItem('doppelganger.layout.leftWidthPct');
            if (!stored) return 0.3;
            const value = parseFloat(stored);
            if (Number.isNaN(value)) return 0.3;
            return Math.min(0.75, Math.max(0.25, value));
        } catch {
            return 0.3;
        }
    };

    const clampEditorWidth = (value: number) => {
        const minWidth = 320;
        const maxWidth = Math.floor(window.innerWidth * 0.8);
        return Math.max(minWidth, Math.min(maxWidth, value));
    };

    const [editorWidth, setEditorWidth] = useState(() => {
        if (typeof window === 'undefined') return 360;
        const pct = getStoredSplitPercent();
        return clampEditorWidth(Math.round(window.innerWidth * pct));
    });
    const resizingRef = useRef(false);
    const availableTasks = useMemo(() => tasks.filter((task) => String(task.id || '') !== String(currentTask.id || '')), [tasks, currentTask.id]);
    const rotateProxiesDisabled = proxyListLoaded && proxyList.length === 1 && proxyList[0]?.id === 'host';

    const MAX_COPY_CHARS = 1000000;

    const formatSize = (chars: number) => `${(chars / (1024 * 1024)).toFixed(2)} MB`;

    const _handleCopy = async (text: string, id: string, options?: { skipSizeConfirm?: boolean; truncatedNotice?: boolean }) => {
        if (!text) {
            onNotify('Nothing to copy.', 'error');
            return;
        }
        let copyText = text;
        if (!options?.skipSizeConfirm && text.length > MAX_COPY_CHARS) {
            const confirmed = await onConfirm({
                message: `Copying ${formatSize(text.length)} may freeze your browser.`,
                confirmLabel: 'Copy full',
                cancelLabel: 'Copy segment'
            });
            if (!confirmed) {
                copyText = text.slice(0, MAX_COPY_CHARS);
            }
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(copyText);
            } else {
                // Fallback to execCommand
                const textArea = document.createElement("textarea");
                textArea.value = copyText;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                textArea.style.top = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
            if (options?.truncatedNotice) {
                onNotify('Copied truncated data.', 'success');
            } else if (copyText.length !== text.length) {
                onNotify('Copied a truncated preview.', 'success');
            }
        } catch (err) {
            console.error('Copy failed:', err);
            onNotify('Copy failed.', 'error');
        }
    };

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
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (rotateProxiesDisabled && currentTask.rotateProxies) {
            const next = { ...currentTask, rotateProxies: false };
            setCurrentTask(next);
            handleAutoSave(next);
        }
    }, [rotateProxiesDisabled, currentTask]);

    // History tracking effect
    useEffect(() => {
        // Prevent adding to history if this update was caused by an undo/redo action
        if (isUndoRedoActionRef.current) {
            isUndoRedoActionRef.current = false;
            return;
        }

        // Only add to history if the task has actually changed in a meaningful way
        const snapshot = JSON.stringify(currentTask);
        if (snapshot === lastSavedSnapshotRef.current) {
            return;
        }

        // Debounce history additions to avoid pushing every single keystroke if they somehow bypass text-input checks
        const timeout = setTimeout(() => {
            lastSavedSnapshotRef.current = snapshot;

            // If we've undone something and then made a new change, truncate future history
            if (historyPointerRef.current < historyRef.current.length - 1) {
                historyRef.current = historyRef.current.slice(0, historyPointerRef.current + 1);
            }

            historyRef.current.push(JSON.parse(snapshot));
            historyPointerRef.current = historyRef.current.length - 1;

            // Optional: limit history size to prevent memory leaks
            if (historyRef.current.length > 50) {
                historyRef.current.shift();
                historyPointerRef.current -= 1;
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [currentTask]);

    // ⚡ Bolt: Memoize block depth array to prevent O(N) array mapping on every re-render (e.g., during drag operations)
    const blockDepths = useMemo(() => {
        let depth = 0;
        return currentTask.actions.map((action) => {
            if (action.type === 'else' || action.type === 'end') {
                depth = Math.max(0, depth - 1);
            }
            const currentDepth = depth;
            if (action.type === 'else' || blockStartTypes.has(action.type)) {
                depth += 1;
            }
            return currentDepth;
        });
    }, [currentTask.actions]);

    const addActionByType = (type: Action['type']) => {
        const base: Action = {
            id: "act_" + Date.now(),
            type,
            selector: '',
            value: ''
        };
        if (type === 'set') base.varName = '';
        if (type === 'merge') base.varName = '';
        if (type === 'start') base.value = '';
        if (type === 'type') base.typeMode = 'replace';
        if (type === 'if') {
            base.conditionVar = '';
            base.conditionVarType = 'string';
            base.conditionOp = 'equals';
            base.conditionValue = '';
        }
        if (type === 'while') {
            base.conditionVar = '';
            base.conditionVarType = 'string';
            base.conditionOp = 'equals';
            base.conditionValue = '';
        }
        if (type === 'wait_downloads') base.value = '30';
        // Auto-create matching 'end' for if/while blocks
        if (type === 'if' || type === 'while') {
            const endAction: Action = { id: 'act_' + Date.now() + '_end', type: 'end', selector: '', value: '' };
            const next = { ...currentTask, actions: [...currentTask.actions, base, endAction] };
            setCurrentTask(next);
            handleAutoSave(next);
        } else {
            const next = { ...currentTask, actions: [...currentTask.actions, base] };
            setCurrentTask(next);
            handleAutoSave(next);
        }
    };

    const openActionPalette = useCallback((targetId?: string, insertIndex?: number) => {
        setActionPaletteOpen(true);
        setActionPaletteQuery('');
        setActionPaletteTargetId(targetId || null);
        setActionPaletteInsertIndex(insertIndex !== undefined ? insertIndex : null);
    }, []);

    const removeAction = useCallback((id: string) => {
        const prev = currentTaskRef.current;
        if (!prev) return;
        const next = { ...prev, actions: prev.actions.filter(a => a.id !== id) };
        setCurrentTask(next);
        onSave(next, false);
    }, [setCurrentTask, onSave]);

    const updateAction = useCallback((id: string, updates: Partial<Action>, saveImmediately: boolean = false) => {
        if (saveImmediately) {
            const prev = currentTaskRef.current;
            if (!prev) return;
            const next = { ...prev, actions: prev.actions.map(a => a.id === id ? { ...a, ...updates } : a) };
            setCurrentTask(next);
            onSave(next, false);
        } else {
            setCurrentTask((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    actions: prev.actions.map(a => a.id === id ? { ...a, ...updates } : a)
                };
            });
        }
    }, [setCurrentTask, onSave]);

    const moveAction = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        const actions = [...currentTask.actions];
        const fromIndex = actions.findIndex((a) => a.id === fromId);
        const toIndex = actions.findIndex((a) => a.id === toId);
        if (fromIndex === -1 || toIndex === -1) return;
        const [moved] = actions.splice(fromIndex, 1);
        actions.splice(toIndex, 0, moved);
        const next = { ...currentTask, actions };
        setCurrentTask(next);
        handleAutoSave(next);
    };

    const handleToggleInspect = async () => {
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
    };

    const getDragIndexFromY = (pointerY: number, activeId: string, snapIndex?: number, snapCenter?: number) => {
        if (snapIndex !== undefined && snapCenter !== undefined) {
            if (Math.abs(pointerY - snapCenter) < 14) {
                return snapIndex;
            }
        }
        const actions = currentTask.actions;
        let nextIndex = actions.length - 1;
        for (let i = 0; i < actions.length; i++) {
            if (actions[i].id === activeId) continue;
            const el = document.getElementById(`action-${actions[i].id}`);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const midpoint = rect.top + rect.height * 0.4;
            if (pointerY < midpoint) {
                nextIndex = i;
                break;
            }
        }
        return nextIndex;
    };

    const finalizeDrag = () => {
        if (!dragState) return;
        if (dragOverIndex !== null && dragOverIndex !== dragState.index) {
            const targetId = currentTask.actions[dragOverIndex]?.id;
            if (targetId) moveAction(dragState.id, targetId);
        }
        setDragState(null);
        setDragOverIndex(null);
        dragPointerIdRef.current = null;
    };

    useEffect(() => {
        if (!dragState) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
            if (actionsListRef.current) {
                const rect = actionsListRef.current.getBoundingClientRect();
                if (e.clientY < rect.top + 28) actionsListRef.current.scrollTop -= 14;
                if (e.clientY > rect.bottom - 28) actionsListRef.current.scrollTop += 14;
            }
            const originCenter = dragState.originTop + dragState.height / 2;
            const nextIndex = getDragIndexFromY(e.clientY, dragState.id, dragState.index, originCenter);
            setDragState((prev) => prev ? { ...prev, currentY: e.clientY } : prev);
            setDragOverIndex(nextIndex);
        };

        const handlePointerUp = (e: PointerEvent) => {
            if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
            finalizeDrag();
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [dragState, dragOverIndex, currentTask.actions]);

    const _addVariable = () => {
        const name = "var_" + Date.now().toString().slice(-4);
        const next: Task = { ...currentTask, variables: { ...currentTask.variables, [name]: { type: 'string', value: '' } } };
        setCurrentTask(next);
        handleAutoSave(next);
    };

    const createActionClone = (action: Action) => ({
        ...action,
        id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000)
    });

    const openContextMenu = useCallback((e: React.MouseEvent, id: string) => {
        e.preventDefault();
        const padding = 8;
        const width = 200;
        const height = 190;
        const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - width - padding);
        const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - height - padding);
        setContextMenu({ id, x, y });
    }, []);

    const closeContextMenu = () => setContextMenu(null);

    const handleActionPointerDown = useCallback((e: React.PointerEvent, id: string, index: number) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            setSelectedActionIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            });
            return;
        }
        setSelectedActionIds(new Set([id]));
        const el = document.getElementById(`action-${id}`);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragPointerIdRef.current = e.pointerId;
        setDragState({
            id,
            startY: e.clientY,
            currentY: e.clientY,
            height: rect.height,
            index,
            originTop: rect.top,
            pointerOffset: e.clientY - rect.top
        });
        setDragOverIndex(index);
    }, []);

    useEffect(() => {
        if (!contextMenu) return;
        const handleClick = (e: Event) => {
            if ((e.target as HTMLElement)?.closest('.action-context-menu')) return;
            setContextMenu(null);
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setContextMenu(null);
        };
        window.addEventListener('mousedown', handleClick);
        window.addEventListener('keydown', handleKey);
        window.addEventListener('scroll', handleClick, true);
        return () => {
            window.removeEventListener('mousedown', handleClick);
            window.removeEventListener('keydown', handleKey);
            window.removeEventListener('scroll', handleClick, true);
        };
    }, [contextMenu]);

    useEffect(() => {
        if (!runId || currentTask.mode !== 'agent') return;
        setActionStatusById({});
        const source = new EventSource(`/api/executions/stream?runId=${encodeURIComponent(runId)}`, { withCredentials: true });
        source.onmessage = (event) => {
            if (!event.data) return;
            try {
                const payload = JSON.parse(event.data);
                if (payload && payload.actionId && payload.status) {
                    setActionStatusById((prev) => ({ ...prev, [payload.actionId]: payload.status }));
                }
            } catch {
                // ignore
            }
        };
        source.addEventListener('ready', () => {
            // stream is alive
        });
        source.onopen = () => {
            // connected
        };
        source.onerror = () => {
            // avoid keeping a dead connection open
            source.close();
        };
        return () => {
            source.close();
        };
    }, [runId, currentTask.mode]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const pct = getStoredSplitPercent();
        setEditorWidth(clampEditorWidth(Math.round(window.innerWidth * pct)));
    }, []);

    const isInteractiveTarget = (el: HTMLElement) => {
        const tagName = el.tagName.toLowerCase();
        return tagName === 'input' || tagName === 'textarea' || el.isContentEditable || el.closest('[data-interactive-target="true"]');
    };

    // Keyboard navigation handlers (delete, select all)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInteractiveTarget(e.target as HTMLElement)) return;
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (selectedActionIds.size > 0) {
                    e.preventDefault();
                    let nextActions = [...currentTask.actions];
                    selectedActionIds.forEach(id => {
                        const idx = nextActions.findIndex(a => a.id === id);
                        if (idx !== -1) {
                            const action = nextActions[idx];
                            if (action.type === 'if' || action.type === 'while') {
                                let nestCount = 1;
                                for (let i = idx + 1; i < nextActions.length; i++) {
                                    if (nextActions[i].type === 'if' || nextActions[i].type === 'while') nestCount++;
                                    if (nextActions[i].type === 'end') nestCount--;
                                    if (nestCount === 0) {
                                        nextActions.splice(i, 1);
                                        break;
                                    }
                                }
                            }
                            nextActions.splice(idx, 1);
                        }
                    });
                    const next = { ...currentTask, actions: nextActions };
                    setCurrentTask(next);
                    handleAutoSave(next);
                    setSelectedActionIds(new Set());
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                setSelectedActionIds(new Set(currentTask.actions.map(a => a.id)));
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedActionIds, currentTask, handleAutoSave]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (!actionPaletteOpen) {
                    openActionPalette();
                }
            }

            // Undo / Redo handling
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                // Ignore if the user is focused on an input element to allow native text undo
                const activeEl = document.activeElement;
                if (activeEl) {
                    const tagName = activeEl.tagName.toLowerCase();
                    const isEditable = activeEl.getAttribute('contenteditable') === 'true';
                    if (tagName === 'input' || tagName === 'textarea' || isEditable) {
                        return;
                    }
                }

                e.preventDefault();

                if (e.shiftKey) {
                    // Redo
                    if (historyPointerRef.current < historyRef.current.length - 1) {
                        historyPointerRef.current += 1;
                        const nextTask = historyRef.current[historyPointerRef.current];
                        isUndoRedoActionRef.current = true;
                        lastSavedSnapshotRef.current = JSON.stringify(nextTask);
                        setCurrentTask(nextTask);
                        handleAutoSave(nextTask);
                    }
                } else {
                    // Undo
                    if (historyPointerRef.current > 0) {
                        historyPointerRef.current -= 1;
                        const prevTask = historyRef.current[historyPointerRef.current];
                        isUndoRedoActionRef.current = true;
                        lastSavedSnapshotRef.current = JSON.stringify(prevTask);
                        setCurrentTask(prevTask);
                        handleAutoSave(prevTask);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [actionPaletteOpen, openActionPalette, setCurrentTask, handleAutoSave]);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (!resizingRef.current) return;
            const next = clampEditorWidth(event.clientX);
            setEditorWidth(next);
        };

        const handlePointerUp = () => {
            resizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, []);


    const _removeVariable = (name: string) => {
        const nextVars = { ...currentTask.variables };
        delete nextVars[name];
        const next = { ...currentTask, variables: nextVars };
        setCurrentTask(next);
        handleAutoSave(next);
    };

    const _updateVariable = (oldName: string, name: string, type: VarType, value: any) => {
        const nextVars = { ...currentTask.variables };
        delete nextVars[oldName];
        let processedValue = value;
        if (type === 'number') processedValue = parseFloat(value) || 0;
        if (type === 'boolean') processedValue = value === 'true' || value === true;
        nextVars[name] = { type, value: processedValue };
        const next = { ...currentTask, variables: nextVars };
        setCurrentTask(next);
        handleAutoSave(next);
    };

    const loadVersions = async () => {
        if (!currentTask.id) return;
        setVersionsLoading(true);
        try {
            const res = await fetch(`/api/tasks/${currentTask.id}/versions`);
            if (!res.ok) throw new Error('Failed to load versions');
            const data = await res.json();
            setVersions(Array.isArray(data.versions) ? data.versions : []);
        } catch (e) {
            setVersions([]);
        } finally {
            setVersionsLoading(false);
        }
    };

    const _rollbackToVersion = async (versionId: string) => {
        if (!currentTask.id) return;
        const confirmed = await onConfirm('Rollback to this version? Current changes will be saved as a new version.');
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/tasks/${currentTask.id}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId })
            });
            if (!res.ok) throw new Error('Rollback failed');
            const restored = await res.json();
            setCurrentTask(restored);
            onNotify('Rolled back to selected version.', 'success');
            loadVersions();
        } catch (e) {
            onNotify('Rollback failed.', 'error');
        }
    };

    const _openVersionPreview = async (versionId: string) => {
        if (!currentTask.id) return;
        setVersionPreviewLoading(true);
        try {
            const res = await fetch(`/api/tasks/${currentTask.id}/versions/${versionId}`);
            if (!res.ok) throw new Error('Failed to load version');
            const data = await res.json();
            if (!data?.snapshot) throw new Error('Missing snapshot');
            setVersionPreview({
                id: data.metadata?.id || versionId,
                timestamp: data.metadata?.timestamp || Date.now(),
                snapshot: data.snapshot
            });
        } catch {
            onNotify('Failed to load version snapshot.', 'error');
        } finally {
            setVersionPreviewLoading(false);
        }
    };

    useEffect(() => {
        if (editorView === 'history') loadVersions();
    }, [editorView, currentTask.id]);

    // Center canvas content in viewport on mount
    useEffect(() => {
        if (hasInitializedCanvas.current) return;
        hasInitializedCanvas.current = true;
        const vp = canvasViewportRef.current;
        if (!vp) return;
        const vpWidth = vp.clientWidth;
        // Center the node graph (which starts at x=0) in the viewport
        setCanvasOffset({ x: (vpWidth - 400) / 2, y: 20 });
    }, []);

    // Native wheel listener for ctrl+scroll zoom (React onWheel is passive and can't preventDefault)
    useEffect(() => {
        const vp = canvasViewportRef.current;
        if (!vp) return;
        const handleWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const rect = vp.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const curScale = canvasScaleRef.current;
                const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
                const newScale = Math.min(2, Math.max(0.25, curScale * zoomFactor));
                const scaleRatio = newScale / curScale;
                setCanvasOffset(prev => ({
                    x: mouseX - scaleRatio * (mouseX - prev.x),
                    y: mouseY - scaleRatio * (mouseY - prev.y),
                }));
                setCanvasScale(newScale);
            } else {
                // Normal scroll → pan
                setCanvasOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
            }
        };
        vp.addEventListener('wheel', handleWheel, { passive: false });
        return () => vp.removeEventListener('wheel', handleWheel);
    }, []);

    const handlePointerDown = useCallback((e: React.PointerEvent, id: string, index: number) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const pointerOffset = e.clientY - rect.top;
        dragPointerIdRef.current = e.pointerId;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        setDragState({
            id: id,
            startY: e.clientY,
            currentY: e.clientY,
            height: rect.height,
            index: index,
            originTop: rect.top,
            pointerOffset
        });
        setDragOverIndex(index);
    }, []);

    // Suppress unused variable errors for features temporarily removed from canvas
    void _VariableRow; void _handleCopy; void _addVariable; void _removeVariable;
    void _updateVariable; void _rollbackToVersion; void _openVersionPreview; void blockDepths;
    void handlePointerDown; void dragState; void dragOverIndex; void finalizeDrag; void getDragIndexFromY;

    return (
        <div className="flex-1 flex overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 bg-black relative" data-editor-width={editorWidth}>

            {/* Infinite Canvas Viewport */}
            {/* Top Bar - Thin & Full Width */}
            <div className="fixed top-0 left-0 right-0 z-40 w-full pointer-events-none">
                <div className="glass-card flex items-center justify-between p-1 px-6 border-b border-white/10 backdrop-blur-xl pointer-events-auto">
                    <div className="flex-1 overflow-hidden flex justify-center">
                        <input
                            type="text"
                            value={currentTask.name || ''}
                            onChange={(e) => setCurrentTask({ ...currentTask, name: e.target.value })}
                            onBlur={() => handleAutoSave()}
                            placeholder="Task name"
                            className="bg-transparent border-none text-[11px] font-bold text-white uppercase tracking-[0.25em] focus:outline-none w-full max-w-[400px] text-center placeholder:text-white/20 py-1"
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => handleOpenCabinet('history')}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            title="Version History"
                            aria-label="Version History"
                        >
                            <MaterialIcon name="history" className="text-base" />
                        </button>
                    </div>
                </div>
            </div>

            <div
                ref={canvasViewportRef}
                className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => {
                    // Pan on middle-click, or left-click when space is held
                    if (e.button === 1 || (e.button === 0 && spaceHeldRef.current)) {
                        e.preventDefault();
                        isPanningRef.current = true;
                        panStartRef.current = { x: e.clientX, y: e.clientY, offsetX: canvasOffset.x, offsetY: canvasOffset.y };
                        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    } else if (e.button === 0 && !isInteractiveTarget(e.target as HTMLElement)) {
                        // Don't start selection box if clicking inside an action block (drag will handle it)
                        if ((e.target as HTMLElement).closest('[data-action-id]')) return;
                        setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
                        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
                            setSelectedActionIds(new Set());
                        }
                        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    }
                }}
                onPointerMove={(e) => {
                    if (isPanningRef.current) {
                        const dx = e.clientX - panStartRef.current.x;
                        const dy = e.clientY - panStartRef.current.y;
                        setCanvasOffset({ x: panStartRef.current.offsetX + dx, y: panStartRef.current.offsetY + dy });
                    } else if (selectionBox) {
                        setSelectionBox(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
                        if (!selectionBox) return; // For TS
                        const boxRect = {
                            left: Math.min(selectionBox.startX, e.clientX),
                            right: Math.max(selectionBox.startX, e.clientX),
                            top: Math.min(selectionBox.startY, e.clientY),
                            bottom: Math.max(selectionBox.startY, e.clientY)
                        };
                        const elements = document.querySelectorAll('[data-action-id]');
                        const newSelected = new Set(e.shiftKey || e.ctrlKey || e.metaKey ? Array.from(selectedActionIds) : []);
                        elements.forEach(el => {
                            const rect = el.getBoundingClientRect();
                            const overlap = !(rect.right < boxRect.left || rect.left > boxRect.right || rect.bottom < boxRect.top || rect.top > boxRect.bottom);
                            if (overlap) {
                                newSelected.add(el.getAttribute('data-action-id')!);
                            }
                        });
                        setSelectedActionIds(newSelected);
                    }
                }}
                onPointerUp={() => { isPanningRef.current = false; setSelectionBox(null); }}
                onPointerCancel={() => { isPanningRef.current = false; setSelectionBox(null); }}
            >
                {/* Canvas Layer — transforms with pan/zoom */}
                <div
                    className="absolute origin-top-left"
                    style={{
                        transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
                    }}
                >
                    {/* Synchronized Dot Grid */}
                    <div
                        className="absolute pointer-events-none z-0"
                        style={{
                            inset: '-1000vw -1000vh',
                            backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.3) ${0.8 / canvasScale}px, transparent 0)`,
                            backgroundSize: '20px 20px'
                        }}
                    />
                    {/* Node graph container */}
                    <div className="flex flex-col items-center" style={{ paddingTop: '60px', minWidth: '500px' }}>
                        {/* Trigger Node */}
                        <div className="w-[360px] bg-black border border-white/15 p-5 rounded-2xl shadow-2xl shadow-black/50 select-text cursor-auto relative z-10">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 cursor-pointer" onClick={() => setTriggerExpanded(!triggerExpanded)}>
                                    <MaterialIcon name="bolt" className="text-white/40 text-base" />
                                    <h3 className="text-white/60 font-bold tracking-widest uppercase text-[10px]">On Execution</h3>
                                    <MaterialIcon name={triggerExpanded ? 'expand_less' : 'expand_more'} className="text-xs text-gray-600" />
                                </div>
                                <button
                                    onClick={() => handleOpenCabinet('mode')}
                                    className="p-2 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    title="Task Settings"
                                    aria-label="Task Settings"
                                >
                                    <MaterialIcon name="settings" className="text-lg" />
                                </button>
                            </div>
                            {triggerExpanded && (
                                <div className="space-y-4 mt-4 pt-3 border-t border-white/10">
                                    <div className="space-y-1.5">
                                        <label className="text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em]">URL</label>
                                        <div className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm focus-within:border-white/30 transition-all">
                                            <RichInput
                                                value={currentTask.url}
                                                onChange={(val) => setCurrentTask({ ...currentTask, url: val })}
                                                onBlur={() => handleAutoSave()}
                                                variables={currentTask.variables}
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[8px] font-bold text-gray-500 uppercase tracking-[0.2em]">Wait (sec)</label>
                                        <input
                                            type="number"
                                            value={currentTask.wait}
                                            onChange={(e) => setCurrentTask({ ...currentTask, wait: parseFloat(e.target.value) || 0 })}
                                            onBlur={() => handleAutoSave()}
                                            className="w-full bg-[#111] border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30 transition-all text-white"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Connector line from trigger to actions */}
                        {currentTask.mode === 'agent' && (
                            <div className="w-px h-10 bg-white/25" />
                        )}

                        {/* Action Nodes */}
                        {currentTask.mode === 'agent' && (
                            <div className="flex flex-col items-center w-full select-text cursor-auto">
                                <div className="space-y-6 w-full flex flex-col items-center relative" ref={actionsListRef}>
                                    {(() => {

                                        const buildAst = (startIndex: number, endIndex: number, depth: number = 0): React.ReactNode[] => {
                                            const nodes: React.ReactNode[] = [];
                                            let i = startIndex;
                                            while (i < endIndex) {
                                                const currentIndex = i;
                                                const action = currentTask.actions[currentIndex];
                                                if (!action) { i++; continue; }

                                                if (action.type === 'if' || action.type === 'while') {
                                                    const blockStart = i;
                                                    let nestLevel = 1;
                                                    let j = i + 1;
                                                    let elseIndex = -1;
                                                    while (j < endIndex && nestLevel > 0) {
                                                        const a = currentTask.actions[j];
                                                        if (a.type === 'if' || a.type === 'while') nestLevel++;
                                                        if (a.type === 'end') {
                                                            nestLevel--;
                                                            if (nestLevel === 0) break;
                                                        }
                                                        if (a.type === 'else' && nestLevel === 1 && action.type === 'if') {
                                                            elseIndex = j;
                                                        }
                                                        j++;
                                                    }
                                                    const blockEnd = j;

                                                    const trueStart = blockStart + 1;
                                                    const trueEnd = elseIndex !== -1 ? elseIndex : blockEnd;
                                                    const falseStart = elseIndex !== -1 ? elseIndex + 1 : -1;
                                                    const falseEnd = elseIndex !== -1 ? blockEnd : -1;

                                                    nodes.push(
                                                        <div key={action.id} className="flex flex-col items-center w-full">
                                                            <div className="w-[360px]">
                                                                <ActionItem
                                                                    action={action}
                                                                    index={currentIndex}
                                                                    isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                                                    isDragging={dragState?.id === action.id}
                                                                    dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                                                    isSelected={selectedActionIds.has(action.id)}
                                                                    status={actionStatusById[action.id]}
                                                                    translateY={0}
                                                                    variables={currentTask.variables}
                                                                    availableTasks={availableTasks}
                                                                    selectorOptions={selectorOptionsById[action.id]}
                                                                    onUpdate={(id, updates, save) => updateAction(id, updates, save)}
                                                                    onAutoSave={handleAutoSave}
                                                                    onOpenPalette={openActionPalette}
                                                                    onOpenContextMenu={openContextMenu}
                                                                    onPointerDown={handleActionPointerDown}
                                                                    onStartInspect={(id: string) => {
                                                                        setActiveInspectActionId(id);
                                                                        if (!isHeadfulOpen) {
                                                                            onOpenHeadful?.(currentTask.url || 'https://www.google.com', id, currentTask, currentTask.variables);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            {/* Branch layout */}
                                                            <div className="flex gap-16 mt-4 relative">
                                                                {/* True branch */}
                                                                <div className="flex flex-col items-center min-w-[200px]">
                                                                    <div className="text-[8px] font-bold text-white/60 uppercase tracking-widest mb-2">
                                                                        {action.type === 'while' ? 'Loop' : 'True'}
                                                                    </div>
                                                                    <div className="w-px h-6 bg-white/25" />
                                                                    <div className="flex flex-col items-center gap-3">
                                                                        {buildAst(trueStart, trueEnd, depth + 1)}
                                                                    </div>
                                                                    {/* Branch + button */}
                                                                    <div className="mt-2 flex flex-col items-center">
                                                                        <div className="w-px h-4 bg-white/20" />
                                                                        <button
                                                                            onClick={() => openActionPalette(undefined, trueEnd)}
                                                                            className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                                            aria-label="Add action"
                                                                        >
                                                                            <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {/* False branch (if only) */}
                                                                {action.type === 'if' && (
                                                                    <div className="flex flex-col items-center min-w-[200px]">
                                                                        <div className="text-[8px] font-bold text-white/60 uppercase tracking-widest mb-2">Otherwise</div>
                                                                        <div className="w-px h-6 bg-white/25" />
                                                                        <div className="flex flex-col items-center gap-3">
                                                                            {falseStart !== -1 ? buildAst(falseStart, falseEnd, depth + 1) : null}
                                                                        </div>
                                                                        {/* Branch + button */}
                                                                        <div className="mt-2 flex flex-col items-center">
                                                                            <div className="w-px h-4 bg-white/20" />
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (falseStart !== -1) {
                                                                                        openActionPalette(undefined, falseEnd);
                                                                                    } else {
                                                                                        // Need to insert an 'else' first, then add action after it
                                                                                        const elseAction: Action = { id: 'act_' + Date.now() + '_else', type: 'else', selector: '', value: '' };
                                                                                        const newActions = [...currentTask.actions];
                                                                                        newActions.splice(blockEnd, 0, elseAction);
                                                                                        const next = { ...currentTask, actions: newActions };
                                                                                        setCurrentTask(next);
                                                                                        handleAutoSave(next);
                                                                                        // Open palette to insert after the else
                                                                                        setTimeout(() => openActionPalette(undefined, blockEnd + 1), 50);
                                                                                    }
                                                                                }}
                                                                                className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                                                aria-label="Add action"
                                                                            >
                                                                                <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {/* + button after if/while block — inserts OUTSIDE the block */}
                                                            <div className="flex flex-col items-center mt-3">
                                                                <div className="w-px h-2 bg-white/25" />
                                                                <button
                                                                    onClick={() => openActionPalette(undefined, blockEnd + 1)}
                                                                    className="w-8 h-8 border border-dashed border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                                    aria-label="Add action"
                                                                >
                                                                    <MaterialIcon name="add" className="text-sm text-gray-600 group-hover:text-white transition-colors" />
                                                                </button>
                                                                <div className="w-px h-2 bg-white/25" />
                                                            </div>
                                                        </div>
                                                    );
                                                    i = blockEnd + 1;
                                                } else if (action.type === 'end' || action.type === 'else') {
                                                    i++;
                                                } else {
                                                    nodes.push(
                                                        <div key={action.id} className="flex flex-col items-center">
                                                            <div className="w-[360px]">
                                                                <ActionItem
                                                                    action={action}
                                                                    index={currentIndex}
                                                                    isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                                                    isDragging={dragState?.id === action.id}
                                                                    dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                                                    isSelected={selectedActionIds.has(action.id)}
                                                                    status={actionStatusById[action.id]}
                                                                    translateY={0}
                                                                    variables={currentTask.variables}
                                                                    availableTasks={availableTasks}
                                                                    selectorOptions={selectorOptionsById[action.id]}
                                                                    onUpdate={(id, updates, save) => updateAction(id, updates, save)}
                                                                    onAutoSave={handleAutoSave}
                                                                    onOpenPalette={openActionPalette}
                                                                    onOpenContextMenu={openContextMenu}
                                                                    onPointerDown={handleActionPointerDown}
                                                                    onStartInspect={(id) => {
                                                                        setActiveInspectActionId(id);
                                                                        if (!isHeadfulOpen) {
                                                                            onOpenHeadful?.(currentTask.url || 'https://www.google.com', id, currentTask, currentTask.variables);
                                                                        }
                                                                    }}
                                                                />
                                                            </div>
                                                            {/* + button between blocks */}
                                                            {i < endIndex - 1 && currentTask.actions[i + 1]?.type !== 'end' && (
                                                                <div className="flex flex-col items-center my-1">
                                                                    <div className="w-px h-2 bg-white/25" />
                                                                    <button
                                                                        onClick={() => openActionPalette(undefined, currentIndex + 1)}
                                                                        className="w-8 h-8 border border-dashed border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                                        aria-label="Add action"
                                                                    >
                                                                        <MaterialIcon name="add" className="text-sm text-gray-600 group-hover:text-white transition-colors" />
                                                                    </button>
                                                                    <div className="w-px h-2 bg-white/25" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                    i++;
                                                }
                                            }
                                            return nodes;
                                        };

                                        return buildAst(0, currentTask.actions.length);
                                    })()}
                                    {/* Add Action Block — always visible, block-shaped */}
                                    <div className="pt-2 flex flex-col items-center">
                                        <div className="w-px h-6 bg-white/10" />
                                        <button
                                            onClick={() => openActionPalette()}
                                            className="w-[360px] bg-[#0a0a0a] border border-dashed border-white/15 rounded-2xl p-6 hover:border-white/30 hover:bg-white/[0.03] transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-white/10 transition-all flex items-center justify-center">
                                                <MaterialIcon name="add" className="text-2xl text-gray-500 group-hover:text-white transition-colors" />
                                            </div>
                                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-gray-300 transition-colors">Add Action</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Zoom Controls — bottom-left overlay */}
            <div className="absolute bottom-24 left-6 z-30 flex flex-col gap-1 bg-[#111] border border-white/10 rounded-xl p-1 shadow-xl">
                <button
                    onClick={() => {
                        const newScale = Math.min(2, canvasScale * 1.2);
                        setCanvasScale(newScale);
                    }}
                    className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="Zoom In"
                    aria-label="Zoom In"
                >+</button>
                <div className="text-[8px] text-center text-gray-500 font-bold select-none">{Math.round(canvasScale * 100)}%</div>
                <button
                    onClick={() => {
                        const newScale = Math.max(0.25, canvasScale * 0.8);
                        setCanvasScale(newScale);
                    }}
                    className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="Zoom Out"
                    aria-label="Zoom Out"
                >−</button>
                <button
                    onClick={() => {
                        setCanvasScale(1);
                        const vp = canvasViewportRef.current;
                        const vpWidth = vp ? vp.clientWidth : 1000;
                        setCanvasOffset({ x: (vpWidth - 400) / 2, y: 20 });
                    }}
                    className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="Reset View"
                    aria-label="Reset View"
                >
                    <MaterialIcon name="fit_screen" className="text-sm" />
                </button>
            </div>

            {/* Selection Box Render */}
            {selectionBox && (
                <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
                    <div
                        className="absolute bg-blue-500/10 border border-blue-400"
                        style={{
                            left: Math.min(selectionBox.startX, selectionBox.currentX),
                            top: Math.min(selectionBox.startY, selectionBox.currentY),
                            width: Math.abs(selectionBox.currentX - selectionBox.startX),
                            height: Math.abs(selectionBox.currentY - selectionBox.startY)
                        }}
                    />
                </div>
            )}

            {/* Context Menu Overlay */}
            {contextMenu && (() => {
                const targetIndex = currentTask.actions.findIndex(a => a.id === contextMenu.id);
                const target = currentTask.actions[targetIndex];
                if (!target) return null;

                const isTargetSelected = selectedActionIds.has(target.id) && selectedActionIds.size > 1;
                const affectedIds = isTargetSelected ? Array.from(selectedActionIds) : [target.id];

                return (
                    <div
                        className="action-context-menu fixed z-50 w-[200px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-[10px] font-bold uppercase tracking-widest text-white/80"
                        style={{ left: contextMenu.x, top: contextMenu.y }}
                    >
                        <button
                            onClick={() => {
                                const nextState = !target.disabled;
                                const nextActions = currentTask.actions.map(a =>
                                    affectedIds.includes(a.id) ? { ...a, disabled: nextState } : a
                                );
                                setCurrentTask({ ...currentTask, actions: nextActions });
                                handleAutoSave({ ...currentTask, actions: nextActions });
                                closeContextMenu();
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            {target.disabled ? 'Enable' : 'Disable'} {isTargetSelected ? 'All' : ''}
                        </button>
                        <button
                            onClick={() => {
                                const nextActions = currentTask.actions.filter(a => !affectedIds.includes(a.id));
                                setCurrentTask({ ...currentTask, actions: nextActions });
                                handleAutoSave({ ...currentTask, actions: nextActions });
                                closeContextMenu();
                                setSelectedActionIds(new Set());
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-red-400"
                        >
                            Delete {isTargetSelected ? 'All' : ''}
                        </button>
                        <button
                            onClick={() => {
                                setActionClipboard(createActionClone(target));
                                removeAction(target.id);
                                closeContextMenu();
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            Cut
                        </button>
                        <button
                            onClick={() => {
                                setActionClipboard(createActionClone(target));
                                closeContextMenu();
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            Copy
                        </button>
                        <button
                            onClick={() => {
                                const affectedActions = currentTask.actions.filter(a => affectedIds.includes(a.id));
                                const clones = affectedActions.map(a => createActionClone(a));
                                const next = [...currentTask.actions];
                                next.splice(targetIndex + 1, 0, ...clones);
                                setCurrentTask({ ...currentTask, actions: next });
                                handleAutoSave({ ...currentTask, actions: next });
                                closeContextMenu();
                            }}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                            Duplicate {isTargetSelected ? 'All' : ''}
                        </button>
                    </div>
                );
            })()}

            {/* Action Palette Overlay */}
            <ActionPalette
                open={actionPaletteOpen}
                query={actionPaletteQuery}
                onQueryChange={setActionPaletteQuery}
                onClose={() => setActionPaletteOpen(false)}
                onSelect={(type) => {
                    if (actionPaletteTargetId) {
                        if (type === 'if') {
                            updateAction(actionPaletteTargetId, {
                                type,
                                conditionVar: '',
                                conditionVarType: 'string',
                                conditionOp: 'equals',
                                conditionValue: ''
                            }, true);
                        } else if (type === 'while') {
                            updateAction(actionPaletteTargetId, {
                                type,
                                conditionVar: '',
                                conditionVarType: 'string',
                                conditionOp: 'equals',
                                conditionValue: ''
                            }, true);
                        } else {
                            updateAction(actionPaletteTargetId, { type }, true);
                        }
                    } else if (actionPaletteInsertIndex !== null) {
                        // Insert at specific index (for branch + buttons)
                        const base: Action = {
                            id: 'act_' + Date.now(),
                            type,
                            selector: '',
                            value: ''
                        };
                        if (type === 'set') base.varName = '';
                        if (type === 'merge') base.varName = '';
                        if (type === 'start') base.value = '';
                        if (type === 'type') base.typeMode = 'replace';
                        if (type === 'if') {
                            base.conditionVar = '';
                            base.conditionVarType = 'string';
                            base.conditionOp = 'equals';
                            base.conditionValue = '';
                        }
                        if (type === 'while') {
                            base.conditionVar = '';
                            base.conditionVarType = 'string';
                            base.conditionOp = 'equals';
                            base.conditionValue = '';
                        }
                        if (type === 'wait_downloads') base.value = '30';
                        const newActions = [...currentTask.actions];
                        if (type === 'if' || type === 'while') {
                            const endAction: Action = { id: 'act_' + Date.now() + '_end', type: 'end', selector: '', value: '' };
                            newActions.splice(actionPaletteInsertIndex, 0, base, endAction);
                        } else {
                            newActions.splice(actionPaletteInsertIndex, 0, base);
                        }
                        const next = { ...currentTask, actions: newActions };
                        setCurrentTask(next);
                        handleAutoSave(next);
                    } else {
                        addActionByType(type);
                    }
                    setActionPaletteOpen(false);
                    setActionPaletteInsertIndex(null);
                }}
            />

            {/* Results Drawer */}
            <div
                className={`fixed top-0 right-0 h-full w-[600px] max-w-[90vw] bg-[#080808] border-l border-white/10 shadow-2xl transition-transform duration-500 ease-in-out z-40 transform ${isResultsOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                <button
                    onClick={() => setIsResultsOpen(!isResultsOpen)}
                    className={`absolute top-1/2 -left-8 -translate-y-1/2 w-8 h-24 bg-[#111] border border-r-0 border-white/10 rounded-l-xl flex items-center justify-center cursor-pointer shadow-[-8px_0_15px_rgba(0,0,0,0.5)] transition-all hover:bg-white/5 hover:w-10 hover:-left-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
                    aria-label={isResultsOpen ? "Close Results Drawer" : "Open Results Drawer"}
                    title={isResultsOpen ? "Close Results Drawer" : "Open Results Drawer"}
                >
                    <MaterialIcon name="drag_indicator" className={`text-white/30 text-xl transition-transform duration-500 ${isResultsOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className="h-full w-full overflow-y-auto custom-scrollbar p-6">
                    <ResultsPane
                        results={results}
                        pinnedResults={pinnedResults}
                        isExecuting={isExecuting}
                        isHeadful={isHeadfulOpen}
                        runId={runId}
                        onConfirm={onConfirm}
                        onNotify={onNotify}
                        onPin={onPinResults}
                        onUnpin={onUnpinResults}
                        fullWidth={true}
                        useNovnc={useNovnc}
                    />
                </div>
            </div>

            {/* Version Preview Modal */}
            {versionPreview && (
                <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
                    <div className="glass-card w-full max-w-6xl rounded-[32px] border border-white/10 p-8 shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                            <div className="space-y-1">
                                <div className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.3em]">Task Snapshot</div>
                                <div className="text-lg font-bold text-white">{versionPreview.snapshot.name}</div>
                                <div className="text-[8px] text-gray-500 uppercase tracking-[0.2em]">
                                    {new Date(versionPreview.timestamp).toLocaleString()} | {versionPreview.snapshot.mode}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setVersionPreview(null)}
                                    className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                                >
                                    Close
                                </button>
                                <button
                                    onClick={() => {
                                        if (onRunSnapshot) onRunSnapshot(versionPreview.snapshot);
                                        setVersionPreview(null);
                                    }}
                                    className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-white text-black hover:bg-white/90 transition-all"
                                >
                                    Run Version
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0">
                            <div className="space-y-2">
                                <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Snapshot JSON</div>
                                <CodeEditor
                                    readOnly
                                    value={JSON.stringify(versionPreview.snapshot, null, 2)}
                                    language="json"
                                    className="min-h-[320px]"
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Output</div>
                                <div className="glass-card rounded-2xl p-6 border border-white/10 text-[10px] text-gray-500">
                                    No output captured for this snapshot yet. Run this version to see results.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Headful Browser Modal */}
            {isHeadfulOpen && (() => {
                const { origin, hostname } = window.location;
                // Currently defaults to 'websockify' if not using unified headfulViewer state,
                // but let's implement the standard viewer
                const headfulUrl = `${origin}/novnc.html?host=${hostname}&path=websockify`;

                const requestFullscreen = () => {
                    const target = headfulFrameRef.current;
                    if (!target) return;
                    if (document.fullscreenElement) {
                        document.exitFullscreen().catch(() => { });
                        return;
                    }
                    target.requestFullscreen?.().catch(() => { });
                };

                return (
                    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-8 pointer-events-auto">
                        <div className="w-full h-full max-w-6xl max-h-[800px] bg-black/60 backdrop-blur-3xl border border-white/20 rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
                            {/* Header bar */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 gap-4">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-white">Active Browser Session</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={handleToggleInspect}
                                        disabled={isInspectLoading || isExecuting}
                                        className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${isInspectMode
                                            ? 'border-green-500/30 bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                            : 'border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}
                                        title={isInspectMode ? 'Stop inspecting elements' : 'Highlight elements on hover'}
                                    >
                                        {isInspectLoading ? (
                                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <MaterialIcon name={isInspectMode ? 'visibility_off' : 'center_focus_strong'} className="text-[14px]" />
                                        )}
                                        {isInspectMode ? 'Stop Inspect' : 'Inspect UI'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={requestFullscreen}
                                        className="p-2 text-white/60 hover:text-white transition-colors"
                                        title="Toggle fullscreen"
                                    >
                                        <MaterialIcon name="fullscreen" className="text-[16px]" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onStopHeadful?.()}
                                        className="p-2 text-white/60 hover:text-white transition-colors"
                                        title="Close Browser"
                                    >
                                        <MaterialIcon name="close" className="text-[16px]" />
                                    </button>
                                </div>
                            </div>
                            {/* Browser specific container */}
                            <div ref={headfulFrameRef} className="flex-1 relative bg-black flex items-center justify-center">
                                {useNovnc === false ? (
                                    <div className="text-center p-8">
                                        <MaterialIcon name="open_in_new" className="text-6xl text-white/20 mb-4 block" />
                                        <h3 className="text-white text-lg font-bold mb-2">Browser Opened Natively</h3>
                                        <p className="text-white/60 text-sm max-w-md mx-auto leading-relaxed mb-6">
                                            The headful browser has been launched in a separate window on your desktop. 
                                            Use that window to pick selectors. It will automatically sync back here.
                                        </p>
                                        <div className="text-[11px] text-amber-500/80 max-w-md mx-auto bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-left">
                                            <div className="flex items-center gap-2 mb-2 font-bold uppercase tracking-widest text-amber-500">
                                                <MaterialIcon name="warning" className="text-base" />
                                                <span>Disclaimer</span>
                                            </div>
                                            Figranium is not optimized for native browser windows. On <strong>Wayland displays</strong>, you <strong>HAVE TO use Docker</strong>, or you will have to deal with the problems of a physical browser losing focus or failing to capture clicks.<br /><br />
                                            For maximum stability, please install the proper tools (Xvfb, x11vnc, websockify) or use the official Docker image.
                                        </div>
                                    </div>
                                ) : (
                                    <iframe
                                        src={headfulUrl}
                                        className="absolute inset-0 w-full h-full border-0"
                                        title="Headful Browser"
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Bottom Action Bar */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#111] border border-white/10 p-2 rounded-3xl shadow-2xl backdrop-blur-xl">
                <button
                    onClick={() => {
                        setIsResultsOpen(true);
                        onRun();
                    }}
                    disabled={isExecuting || isHeadfulOpen}
                    className="shine-effect bg-white text-black px-8 py-4 rounded-2xl font-bold text-[10px] tracking-[0.3em] uppercase transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px]"
                >
                    {isExecuting ? (
                        <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                    ) : <MaterialIcon name="play_arrow" className="text-sm text-black" />}
                    <span>
                        {isExecuting ? 'Running...' : 'Run Task'}
                    </span>
                </button>
                {isExecuting && (
                    <button
                        onClick={() => onStop?.()}
                        className="w-12 h-12 rounded-2xl border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                        title="Stop task"
                        aria-label="Stop task"
                    >
                        <MaterialIcon name="stop" className="text-base" />
                    </button>
                )}
                <button
                    onClick={() => {
                        if (isHeadfulOpen) {
                            onStopHeadful?.();
                        } else {
                            onOpenHeadful?.(currentTask.url || 'https://www.google.com', undefined, currentTask, currentTask.variables);
                        }
                    }}
                    disabled={isExecuting}
                    className={`px-4 h-12 rounded-2xl border text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${isHeadfulOpen
                        ? 'border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                        : 'border-white/10 text-white/80 hover:text-white hover:bg-white/10'
                        }`}
                    title={isHeadfulOpen ? 'Stop headful browser' : 'Open browser to log in'}
                >
                    <MaterialIcon name={isHeadfulOpen ? 'stop' : 'open_in_browser'} className="text-base" />
                    {isHeadfulOpen ? 'Close Browser' : 'Open Browser'}
                </button>
            </div>

            <TaskSettingsCabinet
                isOpen={isCabinetOpen}
                onClose={() => setIsCabinetOpen(false)}
                currentTask={currentTask}
                onUpdateTask={(updates) => {
                    const next = { ...currentTask, ...updates };
                    setCurrentTask(next);
                    handleAutoSave(next);
                }}
                proxyListLoaded={proxyListLoaded}
                proxyList={proxyList}
                initialTab={cabinetTab}
                versions={_versions}
                versionsLoading={_versionsLoading}
                onRollback={_rollbackToVersion}
                onPreview={_openVersionPreview}
            />
        </div >
    );
};

export default EditorScreen;

