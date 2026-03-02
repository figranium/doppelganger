import { useState, useEffect, useRef, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import MaterialIcon from './MaterialIcon';
import { Task, TaskMode, ViewMode, VarType, Action, Results, ConfirmRequest } from '../types';
import RichInput from './RichInput';
import CodeEditor from './CodeEditor';
import ActionPalette from './editor/ActionPalette';
import JsonEditorPane from './editor/JsonEditorPane';
import ResultsPane from './editor/ResultsPane';
import ActionItem from './editor/ActionItem';

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
    onOpenHeadful?: (url: string) => void;
    onStopHeadful?: () => void;
}

const VariableRow: React.FC<{
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
    setEditorView,
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
}) => {
    const [copied, setCopied] = useState<string | null>(null);
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
    const [versions, setVersions] = useState<{ id: string; timestamp: number; name: string; mode: TaskMode }[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
    const [actionPaletteQuery, setActionPaletteQuery] = useState('');
    const [actionPaletteTargetId, setActionPaletteTargetId] = useState<string | null>(null);
    const [versionPreview, setVersionPreview] = useState<{ id: string; timestamp: number; snapshot: Task } | null>(null);
    const [versionPreviewLoading, setVersionPreviewLoading] = useState(false);
    const [actionStatusById, setActionStatusById] = useState<Record<string, 'running' | 'success' | 'error' | 'skipped'>>({});
    const [proxyList, setProxyList] = useState<{ id: string }[]>([]);
    const [proxyListLoaded, setProxyListLoaded] = useState(false);

    const historyRef = useRef<Task[]>([]);
    const historyPointerRef = useRef<number>(-1);
    const isUndoRedoActionRef = useRef<boolean>(false);
    const lastSavedSnapshotRef = useRef<string>('');

    const currentTaskRef = useRef(currentTask);
    useEffect(() => { currentTaskRef.current = currentTask; }, [currentTask]);

    const isHeadfulOpenRef = useRef(isHeadfulOpen);
    useEffect(() => { isHeadfulOpenRef.current = isHeadfulOpen; }, [isHeadfulOpen]);

    useEffect(() => {
        return () => {
            if (isHeadfulOpenRef.current) {
                onStopHeadful?.();
            }
        };
    }, [onStopHeadful]);

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

    const handleCopy = async (text: string, id: string, options?: { skipSizeConfirm?: boolean; truncatedNotice?: boolean }) => {
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

    const blockStartTypes = new Set(['if', 'while', 'repeat', 'foreach', 'on_error']);

    const getBlockDepths = (actions: Action[]) => {
        let depth = 0;
        return actions.map((action) => {
            if (action.type === 'else' || action.type === 'end') {
                depth = Math.max(0, depth - 1);
            }
            const currentDepth = depth;
            if (action.type === 'else' || blockStartTypes.has(action.type)) {
                depth += 1;
            }
            return currentDepth;
        });
    };

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
        const next = { ...currentTask, actions: [...currentTask.actions, base] };
        setCurrentTask(next);
        handleAutoSave(next);
    };

    const openActionPalette = useCallback((targetId?: string) => {
        setActionPaletteOpen(true);
        setActionPaletteQuery('');
        setActionPaletteTargetId(targetId || null);
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

    const handleGenerateSelector = async (actionId: string, prompt: string) => {
        const actionIndex = currentTask.actions.findIndex(a => a.id === actionId);
        if (actionIndex === -1) return;
        try {
            const res = await fetch('/api/tasks/generate-selector', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    task: currentTask,
                    actionIndex,
                    prompt
                })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to generate selector');
            }
            const data = await res.json();
            if (data.selector) {
                updateAction(actionId, { selector: data.selector }, true);
                onNotify('Selector generated by AI', 'success');
            }
        } catch (err: any) {
            onNotify(err.message || 'Failed to generate selector', 'error');
            throw err;
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

    const addVariable = () => {
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


    const removeVariable = (name: string) => {
        const nextVars = { ...currentTask.variables };
        delete nextVars[name];
        const next = { ...currentTask, variables: nextVars };
        setCurrentTask(next);
        handleAutoSave(next);
    };

    const updateVariable = (oldName: string, name: string, type: VarType, value: any) => {
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

    const rollbackToVersion = async (versionId: string) => {
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

    const openVersionPreview = async (versionId: string) => {
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

    return (
        <div className="flex-1 flex overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
            <aside className="glass border-r border-white/10 flex flex-col shrink-0 overflow-hidden" style={{ width: editorWidth }}>
                <div className="p-8 border-b border-white/10 space-y-6 shrink-0">
                    <div className="flex items-center justify-between">
                        <input
                            type="text"
                            value={currentTask.name}
                            onChange={(e) => setCurrentTask({ ...currentTask, name: e.target.value })}
                            onBlur={() => handleAutoSave()}
                            placeholder="Task Name..."
                            aria-label="Task Name"
                            className="bg-transparent text-xl font-bold tracking-tight text-white focus:outline-none border-none p-0 w-full placeholder:text-white/10"
                        />
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setEditorView('history')}
                                className="w-8 h-8 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center"
                                title="Task History"
                                aria-label="Task History"
                            >
                                <MaterialIcon name="history" className="text-sm" />
                            </button>
                            {editorView === 'history' && (
                                <button
                                    onClick={async () => {
                                        await onSave(currentTask, true);
                                        loadVersions();
                                    }}
                                    className="h-8 px-4 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-white/90 transition-all flex items-center gap-2"
                                >
                                    <MaterialIcon name="save" className="text-[12px] text-black" />
                                    <span>Save Version</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-white/5 p-1 rounded-xl flex gap-1 border border-white/5">
                        {(['scrape', 'agent'] as TaskMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => {
                                    const next = { ...currentTask, mode: m };
                                    setCurrentTask(next);
                                    handleAutoSave(next);
                                }}
                                className={`flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all ${currentTask.mode === m ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                                aria-pressed={currentTask.mode === m}
                            >
                                {m === 'scrape' ? 'Scraper' : 'Agent'}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center justify-between px-2">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Interface Mode</span>
                        <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/5">
                            {(['visual', 'json', 'api'] as ViewMode[]).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setEditorView(v)}
                                    className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${editorView === v ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                                    aria-pressed={editorView === v}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div
                    className={`flex-1 p-8 min-h-0 relative ${editorView === 'json' ? 'overflow-hidden' : 'overflow-y-auto custom-scrollbar'} ${editorView === 'visual' ? 'space-y-8' : ''}`}
                >
                    {editorView === 'visual' && (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Target URL</label>
                                <div className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm focus-within:border-white/30 transition-all">
                                    <RichInput
                                        value={currentTask.url}
                                        onChange={(val) => setCurrentTask({ ...currentTask, url: val })}
                                        onBlur={() => handleAutoSave()}
                                        variables={currentTask.variables}
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Wait (Sec)</label>
                                    <input
                                        type="number"
                                        value={currentTask.wait}
                                        onChange={(e) => setCurrentTask({ ...currentTask, wait: parseFloat(e.target.value) || 0 })}
                                        onBlur={() => handleAutoSave()}
                                        className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-white/30 transition-all text-white"
                                    />
                                </div>
                            </div>

                            {currentTask.mode === 'agent' && (
                                <div className="space-y-6 order-1">
                                    <div className="space-y-3" ref={actionsListRef}>
                                        {(() => {
                                            const blockDepths = getBlockDepths(currentTask.actions);
                                            return currentTask.actions.map((action, idx) => {
                                                const isDragging = dragState?.id === action.id;
                                                const isBetween =
                                                    dragState &&
                                                    dragOverIndex !== null &&
                                                    dragState.index !== dragOverIndex &&
                                                    action.id !== dragState.id &&
                                                    ((dragState.index < dragOverIndex && idx > dragState.index && idx <= dragOverIndex) ||
                                                        (dragState.index > dragOverIndex && idx < dragState.index && idx >= dragOverIndex));
                                                const translateY = isBetween ? (dragState?.height || 0) * (dragState.index < (dragOverIndex ?? 0) ? -1 : 1) : 0;
                                                // Calculate transform for the dragged item here to prevent passing the changing dragState object to all children.
                                                // This allows ActionItem to be memoized effectively.
                                                const dragTransformY = (isDragging && dragState) ? (dragState.currentY - dragState.pointerOffset - dragState.originTop) : undefined;
                                                const depth = blockDepths[idx] || 0;
                                                const status = action.disabled ? 'skipped' : actionStatusById[action.id]; return (
                                                    <ActionItem
                                                        action={action}
                                                        index={idx}
                                                        depth={depth}
                                                        status={status}
                                                        isDragging={isDragging}
                                                        isDragOver={dragOverIndex === idx}
                                                        translateY={translateY}
                                                        variables={currentTask.variables}
                                                        availableTasks={availableTasks}
                                                        onUpdate={updateAction}
                                                        onRemove={removeAction}
                                                        onAutoSave={handleAutoSave}
                                                        onOpenPalette={openActionPalette}
                                                        onOpenContextMenu={openContextMenu}
                                                        onPointerDown={handlePointerDown}
                                                        dragTransformY={dragTransformY}
                                                        onGenerateSelector={handleGenerateSelector}
                                                    />

                                                );
                                            });
                                        })()}
                                        {contextMenu && (() => {
                                            const targetIndex = currentTask.actions.findIndex(a => a.id === contextMenu.id);
                                            const target = currentTask.actions[targetIndex];
                                            if (!target) return null;
                                            return (
                                                <div
                                                    className="action-context-menu fixed z-50 w-[200px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-[10px] font-bold uppercase tracking-widest text-white/80"
                                                    style={{ left: contextMenu.x, top: contextMenu.y }}
                                                >
                                                    <button
                                                        onClick={() => {
                                                            updateAction(target.id, { disabled: !target.disabled }, true);
                                                            closeContextMenu();
                                                        }}
                                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                                                    >
                                                        {target.disabled ? 'Enable' : 'Disable'}
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            removeAction(target.id);
                                                            closeContextMenu();
                                                        }}
                                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-red-400"
                                                    >
                                                        Delete
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
                                                            const clone = createActionClone(target);
                                                            const next = [...currentTask.actions];
                                                            next.splice(targetIndex + 1, 0, clone);
                                                            setCurrentTask({ ...currentTask, actions: next });
                                                            closeContextMenu();
                                                        }}
                                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                                                    >
                                                        Duplicate
                                                    </button>
                                                </div>
                                            );
                                        })()}
                                        <button
                                            onClick={() => openActionPalette()}
                                            className="w-full py-3 border border-dashed border-white/20 rounded-xl text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-all bg-white/[0.02] flex items-center justify-center gap-2"
                                        >
                                            <span>+ Append Action Seq</span>
                                        </button>
                                    </div>

                                    <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-4">
                                        <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest border-b border-white/5 pb-2">Behavior Config</h4>
                                        <div className="grid grid-cols-2 gap-3">
                                            {Object.entries(currentTask.stealth).map(([key, val]) => (
                                                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={val}
                                                        onChange={(e) => {
                                                            const next = {
                                                                ...currentTask,
                                                                stealth: { ...currentTask.stealth, [key]: e.target.checked },
                                                                humanTyping: key === 'naturalTyping' ? e.target.checked : currentTask.humanTyping
                                                            };
                                                            setCurrentTask(next);
                                                            handleAutoSave(next);
                                                        }}
                                                        className="w-3 h-3 rounded bg-transparent border-white/20"
                                                    />
                                                    <span className="text-[9px] font-bold text-gray-500 group-hover:text-white transition-all">
                                                        {key.replace(/([A-Z])/g, ' $1').toUpperCase()}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <details className="border-t border-white/10 pt-6 font-sans">
                                <summary className="cursor-pointer text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] hover:text-gray-400 transition-all">
                                    Variables (Injectable)
                                </summary>
                                <div className="space-y-3 mt-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[8px] text-gray-600">Dynamic Params</p>
                                        <button onClick={addVariable} className="px-3 py-1 bg-white/5 border border-white/10 text-white text-[8px] font-bold rounded-lg uppercase tracking-widest hover:bg-white/10 transition-all">+ Add</button>
                                    </div>
                                    <div className="space-y-2">
                                        {Object.entries(currentTask.variables).map(([name, def]) => (
                                            <VariableRow
                                                key={name}
                                                name={name}
                                                def={def}
                                                updateVariable={updateVariable}
                                                removeVariable={removeVariable}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </details>

                            <details className="border-t border-white/10 pt-6 font-sans">
                                <summary className="cursor-pointer text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] hover:text-gray-400 transition-all">
                                    Extraction Script
                                </summary>
                                <div className="space-y-3 mt-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[8px] text-gray-600 uppercase tracking-widest">Output format</span>
                                        <select
                                            value={currentTask.extractionFormat || 'json'}
                                            onChange={(e) => {
                                                const next = { ...currentTask, extractionFormat: e.target.value as 'json' | 'csv' };
                                                setCurrentTask(next);
                                                handleAutoSave(next);
                                            }}
                                            className="custom-select bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-[8px] font-bold uppercase text-white/60"
                                        >
                                            <option value="json">JSON</option>
                                            <option value="csv">CSV</option>
                                        </select>
                                    </div>
                                    <p className="text-[8px] text-gray-600">Process scraped HTML with JavaScript. Use <code className="text-blue-400 bg-white/5 px-1 py-0.5 rounded">$$data.html()</code> to access the raw HTML.</p>
                                    <div className="w-full bg-[#050505] border border-white/10 rounded-xl p-4 font-mono text-xs text-green-300 focus-within:border-white/30 resize-none custom-scrollbar leading-relaxed min-h-[200px] whitespace-pre-wrap">
                                        <RichInput
                                            value={currentTask.extractionScript || ''}
                                            onChange={(val) => setCurrentTask({ ...currentTask, extractionScript: val })}
                                            onBlur={() => handleAutoSave()}
                                            variables={currentTask.variables}
                                            syntax="javascript"
                                            placeholder={`// Example: Extract all links
const html = $$data.html();
const parser = new DOMParser();
const doc = parser.parseFromString(html, 'text/html');
const links = Array.from(doc.querySelectorAll('a')).map(a => a.href);
return JSON.stringify(links, null, 2);`}
                                        />
                                    </div>
                                </div>
                            </details>

                            {currentTask.mode === 'scrape' && (
                                <div className="space-y-2">
                                    <label className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Selector Filter</label>
                                    <div className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-sm focus-within:border-white/30 transition-all">
                                        <RichInput
                                            value={currentTask.selector || ''}
                                            onChange={(val) => setCurrentTask({ ...currentTask, selector: val })}
                                            onBlur={() => handleAutoSave()}
                                            variables={currentTask.variables}
                                            placeholder=".main-content"
                                        />
                                    </div>
                                </div>
                            )
                            }

                            <div className="pt-4 border-t border-white/10 space-y-3">
                                <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={currentTask.rotateUserAgents}
                                        onChange={(e) => {
                                            const next = { ...currentTask, rotateUserAgents: e.target.checked };
                                            setCurrentTask(next);
                                            handleAutoSave(next);
                                        }}
                                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                                    />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Rotate UA</span>
                                </label>
                                <label
                                    className={`flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 transition-all ${rotateProxiesDisabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/[0.05] cursor-pointer group'}`}
                                    title={rotateProxiesDisabled ? 'Configure proxies in Settings → Proxies to enable rotation.' : 'Rotate proxies per task.'}
                                >
                                    <input
                                        type="checkbox"
                                        checked={currentTask.rotateProxies}
                                        onChange={(e) => {
                                            const next = { ...currentTask, rotateProxies: e.target.checked };
                                            setCurrentTask(next);
                                            handleAutoSave(next);
                                        }}
                                        disabled={rotateProxiesDisabled}
                                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                                    />
                                    <span className={`text-[10px] font-bold text-gray-500 uppercase tracking-widest ${rotateProxiesDisabled ? '' : 'group-hover:text-white'}`}>Rotate Proxies</span>
                                </label>
                                <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={currentTask.rotateViewport}
                                        onChange={(e) => {
                                            const next = { ...currentTask, rotateViewport: e.target.checked };
                                            setCurrentTask(next);
                                            handleAutoSave(next);
                                        }}
                                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                                    />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Rotate Viewport</span>
                                </label>
                                <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={currentTask.includeShadowDom !== false}
                                        onChange={(e) => {
                                            const next = { ...currentTask, includeShadowDom: e.target.checked };
                                            setCurrentTask(next);
                                            handleAutoSave(next);
                                        }}
                                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                                    />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Include Shadow DOM in HTML</span>
                                </label>
                                <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={!!currentTask.disableRecording}
                                        onChange={(e) => {
                                            const next = { ...currentTask, disableRecording: e.target.checked };
                                            setCurrentTask(next);
                                            handleAutoSave(next);
                                        }}
                                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                                    />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Disable automated recording</span>
                                </label>
                                <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={!!currentTask.statelessExecution}
                                        onChange={(e) => {
                                            const next = { ...currentTask, statelessExecution: e.target.checked };
                                            setCurrentTask(next);
                                            handleAutoSave(next);
                                        }}
                                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                                    />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Stateless execution</span>
                                </label>
                            </div>
                        </div>
                    )}

                    {editorView === 'json' && (
                        <JsonEditorPane
                            task={currentTask}
                            onChange={setCurrentTask}
                            onCopy={(text, id) => { void handleCopy(text, id); }}
                            copiedId={copied}
                        />
                    )}

                    {
                        editorView === 'api' && (
                            <div className="h-full flex flex-col">
                                <div className="space-y-6 flex-1 flex flex-col min-h-0">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Deployment Endpoint</label>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="text"
                                                readOnly
                                                value={currentTask.id ? `${window.location.origin}/tasks/${currentTask.id}/api` : 'Save task to view endpoint'}
                                                className="flex-1 bg-[#050505] border border-white/10 rounded-xl px-4 py-2 font-mono text-xs text-green-300 focus:outline-none"
                                            />
                                            <button
                                                onClick={() => {
                                                    const url = currentTask.id ? `${window.location.origin}/tasks/${currentTask.id}/api` : '';
                                                    if (url) void handleCopy(url, 'endpoint');
                                                }}
                                                className={`px-4 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 ${copied === 'endpoint' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                            >
                                                {copied === 'endpoint' ? <MaterialIcon name="check" className="text-sm" /> : <MaterialIcon name="content_copy" className="text-sm" />}
                                                {copied === 'endpoint' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex-1 flex flex-col min-h-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Override Variables (JSON)</label>
                                            <button onClick={() => {
                                                const cleanVars: Record<string, any> = {};
                                                Object.entries(currentTask.variables).forEach(([n, d]) => cleanVars[n] = d.value);
                                                void handleCopy(JSON.stringify({ variables: cleanVars }, null, 2), 'vars');
                                            }} className={`px-4 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 ${copied === 'vars' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                                                {copied === 'vars' ? <MaterialIcon name="check" className="text-sm" /> : <MaterialIcon name="content_copy" className="text-sm" />}
                                                {copied === 'vars' ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <CodeEditor
                                            readOnly
                                            value={(() => {
                                                const cleanVars: Record<string, any> = {};
                                                Object.entries(currentTask.variables).forEach(([n, d]) => cleanVars[n] = d.value);
                                                return JSON.stringify({ variables: cleanVars }, null, 2);
                                            })()}
                                            language="json"
                                            className="flex-1"
                                        />
                                    </div>
                                </div>
                                <p className="text-[8px] text-gray-600 mt-4 font-mono uppercase tracking-widest leading-loose">Automate via HTTP POST to the above endpoint with your API key in the headers.</p>
                            </div>
                        )
                    }
                    {editorView === 'history' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Task Versions</span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={loadVersions}
                                        className="px-4 py-2 border border-white/10 text-[9px] font-bold rounded-xl uppercase tracking-widest text-white hover:bg-white/5 transition-all"
                                    >
                                        Refresh
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!currentTask.id) return;
                                            const confirmed = await onConfirm('Clear all task versions?');
                                            if (!confirmed) return;
                                            const res = await fetch(`/api/tasks/${currentTask.id}/versions/clear`, { method: 'POST' });
                                            if (res.ok) {
                                                onNotify('Version history cleared.', 'success');
                                                loadVersions();
                                            } else {
                                                onNotify('Clear failed.', 'error');
                                            }
                                        }}
                                        className="px-4 py-2 border border-red-500/20 text-[9px] font-bold rounded-xl uppercase tracking-widest text-red-300 hover:bg-red-500/10 transition-all"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                            {versionsLoading && (
                                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Loading versions...</div>
                            )}
                            {!versionsLoading && versions.length === 0 && (
                                <div className="text-[9px] text-gray-600 uppercase tracking-widest">No versions yet. Save changes to create history.</div>
                            )}
                            <div className="space-y-3">
                                {versions.map((version) => (
                                    <div key={version.id} className="glass-card p-4 rounded-2xl flex items-center justify-between">
                                        <div className="space-y-1">
                                            <div className="text-[10px] font-bold text-white uppercase tracking-widest">{version.name}</div>
                                            <div className="text-[8px] text-gray-500 uppercase tracking-[0.2em]">
                                                {new Date(version.timestamp).toLocaleString()} | {version.mode}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openVersionPreview(version.id)}
                                                disabled={versionPreviewLoading}
                                                className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {versionPreviewLoading ? 'Loading...' : 'View'}
                                            </button>
                                            <button
                                                onClick={() => rollbackToVersion(version.id)}
                                                className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                                            >
                                                Rollback
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div >
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
                        } else {
                            addActionByType(type);
                        }
                        setActionPaletteOpen(false);
                    }}
                />

                <div className="p-8 border-t border-white/10 backdrop-blur-xl shrink-0">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onRun}
                            disabled={isExecuting || isHeadfulOpen}
                            className="shine-effect flex-1 bg-white text-black py-4 rounded-2xl font-bold text-[10px] tracking-[0.3em] uppercase transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    onOpenHeadful?.(currentTask.url || 'https://www.google.com');
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
                </div>
            </aside >
            <div
                className="w-2 cursor-col-resize bg-white/5 hover:bg-white/10 transition-colors"
                onPointerDown={(event) => {
                    event.preventDefault();
                    resizingRef.current = true;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                }}
            />

            <main className="flex-1 overflow-y-auto custom-scrollbar bg-[#020202] p-12 relative">
                <div className="absolute inset-0 opacity-[0.02] pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

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
                    fullWidth={isHeadfulOpen}
                />
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
            </main>
        </div >
    );
};

export default EditorScreen;
