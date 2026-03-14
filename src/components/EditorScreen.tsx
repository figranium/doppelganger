import { useState, useEffect, useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import MaterialIcon from './MaterialIcon';
import { Task, Action, Results, ConfirmRequest, ViewMode } from '../types';
import ActionPalette from './editor/ActionPalette';
import TaskSettingsCabinet from './editor/TaskSettingsCabinet';

// Hooks
import { useEditorCanvas } from '../hooks/useEditorCanvas';
import { useEditorHistory } from '../hooks/useEditorHistory';
import { useEditorActions } from '../hooks/useEditorActions';
import { useEditorVersions } from '../hooks/useEditorVersions';
import { useEditorHeadful, useEditorProxies } from '../hooks/useEditorHeadful';

// Components
import EditorTopBar from './editor/EditorTopBar';
import BottomActionBar from './editor/BottomActionBar';
import ResultsDrawer from './editor/ResultsDrawer';
import VersionPreviewModal from './editor/VersionPreviewModal';
import HeadfulModal from './editor/HeadfulModal';
import CanvasView from './editor/CanvasView';

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

const EditorScreen: React.FC<EditorScreenProps> = ({
    currentTask,
    setCurrentTask,
    tasks = [],
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
    // Hooks
    const canvas = useEditorCanvas();
    useEditorHistory(currentTask, (t) => setCurrentTask(t), (t, v) => onSave(t, v));
    const actions = useEditorActions(currentTask, setCurrentTask as any, (t, v) => onSave(t, v));
    const versioning = useEditorVersions(currentTask, onNotify, onConfirm, (t) => setCurrentTask(t));
    const headful = useEditorHeadful(currentTask, isHeadfulOpen, actions.updateAction, onNotify, onStopHeadful);
    const { proxyList, proxyListLoaded } = useEditorProxies();

    // Local State
    const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
    const [, setActionClipboard] = useState<Action | null>(null);
    const [actionPaletteOpen, setActionPaletteOpen] = useState(false);
    const [isCabinetOpen, setIsCabinetOpen] = useState(false);
    const [cabinetTab, setCabinetTab] = useState<'mode' | 'variables' | 'behavior' | 'extraction' | 'api' | 'schedule' | 'history'>('mode');
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const [actionPaletteQuery, setActionPaletteQuery] = useState('');
    const [actionPaletteTargetId, setActionPaletteTargetId] = useState<string | null>(null);
    const [actionPaletteInsertIndex, setActionPaletteInsertIndex] = useState<number | null>(null);
    const [actionStatusById, setActionStatusById] = useState<Record<string, 'running' | 'success' | 'error' | 'skipped'>>({});
    const [isResultsOpen, setIsResultsOpen] = useState(false);
    const [triggerExpanded, setTriggerExpanded] = useState(false);

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
            } catch { }
        };
        return () => source.close();
    }, [runId, currentTask.mode]);

    // Handlers
    const handleAutoSave = useCallback((task?: Task) => {
        onSave(task || currentTask, false);
    }, [onSave, currentTask]);

    const handleOpenCabinet = (tab: typeof cabinetTab = 'mode') => {
        setCabinetTab(tab);
        if (tab === 'history') versioning.loadVersions();
        setIsCabinetOpen(true);
    };

    const openActionPalette = useCallback((targetId?: string, insertIndex?: number) => {
        setActionPaletteOpen(true);
        setActionPaletteQuery('');
        setActionPaletteTargetId(targetId || null);
        setActionPaletteInsertIndex(insertIndex !== undefined ? insertIndex : null);
    }, []);

    const isInteractiveTarget = (el: HTMLElement) => {
        const tagName = el.tagName.toLowerCase();
        return tagName === 'input' || tagName === 'textarea' || el.isContentEditable || el.closest('[data-interactive-target="true"]');
    };

    // Keyboard Hotkeys
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isInteractiveTarget(e.target as HTMLElement)) return;
            if (e.key === 'Backspace' || e.key === 'Delete') {
                if (actions.selectedActionIds.size > 0) {
                    e.preventDefault();
                    let nextActions = [...currentTask.actions];
                    actions.selectedActionIds.forEach(id => {
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
                    actions.setSelectedActionIds(new Set());
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                actions.setSelectedActionIds(new Set(currentTask.actions.map(a => a.id)));
            } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (!actionPaletteOpen) openActionPalette();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [actions, currentTask, handleAutoSave, actionPaletteOpen, openActionPalette, setCurrentTask]);

    const openContextMenu = useCallback((e: React.MouseEvent, id: string) => {
        e.preventDefault();
        const padding = 8;
        const width = 200;
        const height = 190;
        const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - width - padding);
        const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - height - padding);
        setContextMenu({ id, x, y });
    }, []);

    const createActionClone = (action: Action) => ({
        ...action,
        id: "act_" + Date.now() + "_" + Math.floor(Math.random() * 1000)
    });

    const addActionByType = (type: Action['type']) => {
        const base: Action = { id: "act_" + Date.now(), type, selector: '', value: '' };
        if (type === 'set' || type === 'merge') base.varName = '';
        if (type === 'start') base.value = '';
        if (type === 'type') base.typeMode = 'replace';
        if (type === 'if' || type === 'while') {
            base.conditionVar = '';
            base.conditionVarType = 'string';
            base.conditionOp = 'equals';
            base.conditionValue = '';
            const endAction: Action = { id: 'act_' + Date.now() + '_end', type: 'end', selector: '', value: '' };
            const next = { ...currentTask, actions: [...currentTask.actions, base, endAction] };
            setCurrentTask(next);
            handleAutoSave(next);
        } else {
            if (type === 'wait_downloads') base.value = '30';
            const next = { ...currentTask, actions: [...currentTask.actions, base] };
            setCurrentTask(next);
            handleAutoSave(next);
        }
    };

    const availableTasks = useMemo(() => tasks.filter((task) => String(task.id || '') !== String(currentTask.id || '')), [tasks, currentTask.id]);

    return (
        <div className="flex-1 flex overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 bg-black relative">
            <EditorTopBar
                currentTask={currentTask}
                onUpdateTaskName={(name) => setCurrentTask({ ...currentTask, name })}
                onAutoSave={handleAutoSave}
                onOpenHistory={() => handleOpenCabinet('history')}
            />

            <CanvasView
                currentTask={currentTask}
                setCurrentTask={setCurrentTask as any}
                canvasOffset={canvas.canvasOffset as any}
                canvasScale={canvas.canvasScale}
                canvasViewportRef={canvas.canvasViewportRef as any}
                triggerExpanded={triggerExpanded}
                setTriggerExpanded={setTriggerExpanded}
                onOpenCabinet={handleOpenCabinet}
                handleAutoSave={handleAutoSave}
                dragState={actions.dragState}
                dragOverIndex={actions.dragOverIndex}
                selectedActionIds={actions.selectedActionIds}
                setSelectedActionIds={actions.setSelectedActionIds}
                actionStatusById={actionStatusById}
                availableTasks={availableTasks}
                selectorOptionsById={headful.selectorOptionsById}
                updateAction={actions.updateAction}
                openActionPalette={openActionPalette}
                openContextMenu={openContextMenu}
                handleActionPointerDown={actions.handleActionPointerDown}
                onOpenHeadful={(url, id) => {
                    headful.setActiveInspectActionId(id || null);
                    onOpenHeadful?.(url, id, currentTask, currentTask.variables);
                }}
                isHeadfulOpen={isHeadfulOpen}
                onPointerDown={(e) => {
                    if (e.button === 1 || (e.button === 0 && canvas.spaceHeldRef.current)) {
                        canvas.startPanning(e);
                    } else if (e.button === 0 && !isInteractiveTarget(e.target as HTMLElement)) {
                        if ((e.target as HTMLElement).closest('[data-action-id]')) return;
                        setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
                        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) actions.setSelectedActionIds(new Set());
                        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                    }
                }}
                onPointerMove={(e) => {
                    if (canvas.isPanning.current) {
                        canvas.handlePanning(e.nativeEvent);
                    } else if (selectionBox) {
                        setSelectionBox(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : null);
                        const boxRect = {
                            left: Math.min(selectionBox.startX, e.clientX),
                            right: Math.max(selectionBox.startX, e.clientX),
                            top: Math.min(selectionBox.startY, e.clientY),
                            bottom: Math.max(selectionBox.startY, e.clientY)
                        };
                        const elements = document.querySelectorAll('[data-action-id]');
                        const newSelected = new Set(e.shiftKey || e.ctrlKey || e.metaKey ? Array.from(actions.selectedActionIds) : []);
                        elements.forEach(el => {
                            const rect = el.getBoundingClientRect();
                            const overlap = !(rect.right < boxRect.left || rect.left > boxRect.right || rect.bottom < boxRect.top || rect.top > boxRect.bottom);
                            if (overlap) newSelected.add(el.getAttribute('data-action-id')!);
                        });
                        actions.setSelectedActionIds(newSelected);
                    }
                }}
                onPointerUp={() => { canvas.stopPanning(); setSelectionBox(null); }}
                onPointerCancel={() => { canvas.stopPanning(); setSelectionBox(null); }}
                selectionBox={selectionBox}
            />

            {/* Zoom Controls */}
            <div
                className="absolute bottom-24 left-6 z-30 flex flex-col gap-1 bg-[#111] border border-white/10 rounded-xl p-1 shadow-xl"
                role="group"
                aria-label="Zoom controls"
            >
                <button
                    onClick={() => canvas.setCanvasScale(Math.min(2, canvas.canvasScale * 1.2))}
                    className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Zoom in"
                    title="Zoom in"
                >
                    +
                </button>
                <div
                    className="text-[8px] text-center text-gray-500 font-bold select-none"
                    aria-live="polite"
                >
                    {Math.round(canvas.canvasScale * 100)}%
                </div>
                <button
                    onClick={() => canvas.setCanvasScale(Math.max(0.25, canvas.canvasScale * 0.8))}
                    className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Zoom out"
                    title="Zoom out"
                >
                    −
                </button>
                <button
                    onClick={() => {
                        canvas.setCanvasScale(1);
                        const vp = canvas.canvasViewportRef.current;
                        canvas.setCanvasOffset({ x: ((vp ? vp.clientWidth : 1000) - 400) / 2, y: 20 });
                    }}
                    className="w-8 h-8 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Reset zoom and center"
                    title="Reset zoom and center"
                >
                    <MaterialIcon name="fit_screen" className="text-sm" />
                </button>
            </div>

            {contextMenu && (() => {
                const targetIndex = currentTask.actions.findIndex(a => a.id === contextMenu.id);
                const target = currentTask.actions[targetIndex];
                if (!target) return null;
                const isTargetSelected = actions.selectedActionIds.has(target.id) && actions.selectedActionIds.size > 1;
                const affectedIds = isTargetSelected ? Array.from(actions.selectedActionIds) : [target.id];

                return (
                    <div className="action-context-menu fixed z-50 w-[200px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-[10px] font-bold uppercase tracking-widest text-white/80" style={{ left: contextMenu.x, top: contextMenu.y }}>
                        <button onClick={() => {
                            const nextState = !target.disabled;
                            const nextActions = currentTask.actions.map(a => affectedIds.includes(a.id) ? { ...a, disabled: nextState } : a);
                            const next = { ...currentTask, actions: nextActions };
                            setCurrentTask(next);
                            handleAutoSave(next);
                            setContextMenu(null);
                        }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">{target.disabled ? 'Enable' : 'Disable'} {isTargetSelected ? 'All' : ''}</button>
                        <button onClick={() => {
                            const nextActions = currentTask.actions.filter(a => !affectedIds.includes(a.id));
                            const next = { ...currentTask, actions: nextActions };
                            setCurrentTask(next);
                            handleAutoSave(next);
                            setContextMenu(null);
                            actions.setSelectedActionIds(new Set());
                        }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-red-400">Delete {isTargetSelected ? 'All' : ''}</button>
                        <button onClick={() => { setActionClipboard(createActionClone(target)); actions.removeAction(target.id); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">Cut</button>
                        <button onClick={() => { setActionClipboard(createActionClone(target)); setContextMenu(null); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">Copy</button>
                        <button onClick={() => {
                            const affectedActions = currentTask.actions.filter(a => affectedIds.includes(a.id));
                            const clones = affectedActions.map(a => createActionClone(a));
                            const next = [...currentTask.actions];
                            next.splice(targetIndex + 1, 0, ...clones);
                            const nextTask = { ...currentTask, actions: next };
                            setCurrentTask(nextTask);
                            handleAutoSave(nextTask);
                            setContextMenu(null);
                        }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">Duplicate {isTargetSelected ? 'All' : ''}</button>
                    </div>
                );
            })()}

            <ActionPalette
                open={actionPaletteOpen}
                query={actionPaletteQuery}
                onQueryChange={setActionPaletteQuery}
                onClose={() => setActionPaletteOpen(false)}
                onSelect={(type) => {
                    if (actionPaletteTargetId) {
                        actions.updateAction(actionPaletteTargetId, { type }, true);
                    } else if (actionPaletteInsertIndex !== null) {
                        const base: Action = { id: 'act_' + Date.now(), type, selector: '', value: '' };
                        if (type === 'set' || type === 'merge') base.varName = '';
                        if (type === 'start') base.value = '';
                        if (type === 'type') base.typeMode = 'replace';
                        if (type === 'if' || type === 'while') {
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

            <ResultsDrawer
                isOpen={isResultsOpen}
                onToggle={() => setIsResultsOpen(!isResultsOpen)}
                results={results}
                pinnedResults={pinnedResults}
                isExecuting={isExecuting}
                isHeadfulOpen={isHeadfulOpen || false}
                runId={runId}
                onConfirm={onConfirm}
                onNotify={onNotify}
                onPinResults={onPinResults}
                onUnpinResults={onUnpinResults}
                useNovnc={useNovnc}
            />

            <VersionPreviewModal
                versionPreview={versioning.versionPreview}
                onClose={() => versioning.setVersionPreview(null)}
                onRunSnapshot={onRunSnapshot!}
            />

            <HeadfulModal
                isHeadfulOpen={isHeadfulOpen || false}
                isInspectMode={headful.isInspectMode}
                isInspectLoading={headful.isInspectLoading}
                isExecuting={isExecuting}
                useNovnc={useNovnc}
                onToggleInspect={headful.handleToggleInspect}
                onStopHeadful={() => onStopHeadful?.()}
            />

            <BottomActionBar
                isExecuting={isExecuting}
                isHeadfulOpen={isHeadfulOpen || false}
                onRun={() => { setIsResultsOpen(true); onRun(); }}
                onStop={onStop}
                onOpenHeadful={() => onOpenHeadful?.(currentTask.url || 'https://www.google.com', undefined, currentTask, currentTask.variables)}
                onStopHeadful={onStopHeadful}
            />

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
                versions={versioning.versions as any}
                versionsLoading={versioning.versionsLoading}
                onRollback={versioning.rollbackToVersion}
                onPreview={versioning.openVersionPreview}
            />
        </div>
    );
};

export default EditorScreen;
