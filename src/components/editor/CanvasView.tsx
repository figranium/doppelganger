import React, { useState, useCallback } from 'react';
import MaterialIcon from '../MaterialIcon';
import RichInput from '../RichInput';
import ActionItem from './ActionItem';
import StickyNote from './StickyNote';
import { Task, Action, StickyNote as StickyNoteType } from '../../types';

interface CanvasViewProps {
    currentTask: Task;
    setCurrentTask: (task: Task) => void;
    canvasOffset: { x: number; y: number };
    canvasScale: number;
    canvasViewportRef: React.RefObject<HTMLDivElement>;
    triggerExpanded: boolean;
    setTriggerExpanded: (val: boolean) => void;
    onOpenCabinet: (tab?: any) => void;
    handleAutoSave: (task?: Task) => void;
    dragState: any;
    dragOverIndex: number | null;
    selectedActionIds: Set<string>;
    setSelectedActionIds?: (ids: Set<string>) => void;
    actionStatusById: Record<string, string>;
    availableTasks: Task[];
    selectorOptionsById: Record<string, string[]>;
    updateAction: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    openActionPalette: (targetId?: string, insertIndex?: number) => void;
    openContextMenu: (e: React.MouseEvent, id: string) => void;
    handleActionPointerDown: (e: React.PointerEvent, id: string, index: number) => void;
    onOpenHeadful: (url: string, targetActionId?: string, taskSnapshot?: Task, variables?: any) => void;
    isHeadfulOpen?: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    selectionBox: any;
    onAddStickyNote: (x: number, y: number) => void;
    onUpdateStickyNote: (id: string, updates: Partial<StickyNoteType>) => void;
    onDeleteStickyNote: (id: string) => void;
    onDuplicateStickyNote: (note: StickyNoteType) => void;
    selectedNoteIds: Set<string>;
}

const CanvasView: React.FC<CanvasViewProps> = ({
    currentTask,
    setCurrentTask,
    canvasOffset,
    canvasScale,
    canvasViewportRef,
    triggerExpanded,
    setTriggerExpanded,
    onOpenCabinet,
    handleAutoSave,
    dragState,
    dragOverIndex,
    selectedActionIds,
    actionStatusById,
    availableTasks,
    selectorOptionsById,
    updateAction,
    openActionPalette,
    openContextMenu,
    handleActionPointerDown,
    onOpenHeadful,
    isHeadfulOpen,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    selectionBox,
    onAddStickyNote,
    onUpdateStickyNote,
    onDeleteStickyNote,
    onDuplicateStickyNote,
    selectedNoteIds,
}) => {
    const onStartInspect = useCallback((id: string) => {
        if (!isHeadfulOpen) {
            onOpenHeadful?.(currentTask.url || 'https://www.google.com', id, currentTask, currentTask.variables);
        }
    }, [isHeadfulOpen, onOpenHeadful, currentTask.url, currentTask.variables]);

    const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);

    const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
        // Only trigger on the canvas background, not on blocks or sticky notes
        const target = e.target as HTMLElement;
        if (target.closest('[data-action-id]') || target.closest('[data-sticky-note-id]') || target.closest('[data-interactive-target="true"]')) return;
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const worldX = Math.round((e.clientX - rect.left - canvasOffset.x) / canvasScale);
        const worldY = Math.round((e.clientY - rect.top - canvasOffset.y) / canvasScale);
        const padding = 8;
        const menuW = 180;
        const menuH = 48;
        const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - menuW - padding);
        const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - menuH - padding);
        setCanvasContextMenu({ x, y, worldX, worldY });
    }, [canvasOffset, canvasScale]);

    const buildAst = (startIndex: number, endIndex: number, _depth: number = 0): React.ReactNode[] => {
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
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                            />
                        </div>
                        <div className="flex gap-16 mt-4 relative">
                            <div className="flex flex-col items-center min-w-[200px]">
                                <div className="text-[8px] font-bold text-white/60 uppercase tracking-widest mb-2">
                                    {action.type === 'while' ? 'Loop' : 'True'}
                                </div>
                                <div className="w-px h-6 bg-white/25" />
                                <div className="flex flex-col items-center gap-3">
                                    {buildAst(trueStart, trueEnd, _depth + 1)}
                                </div>
                                <div className="mt-2 flex flex-col items-center">
                                    <div className="w-px h-4 bg-white/20" />
                                    <button
                                        onClick={() => openActionPalette(undefined, trueEnd)}
                                        className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label="Add action"
                                        title="Add action"
                                    >
                                        <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                    </button>
                                </div>
                            </div>
                            {action.type === 'if' && (
                                <div className="flex flex-col items-center min-w-[200px]">
                                    <div className="text-[8px] font-bold text-white/60 uppercase tracking-widest mb-2">Otherwise</div>
                                    <div className="w-px h-6 bg-white/25" />
                                    <div className="flex flex-col items-center gap-3">
                                        {falseStart !== -1 ? buildAst(falseStart, falseEnd, _depth + 1) : null}
                                    </div>
                                    <div className="mt-2 flex flex-col items-center">
                                        <div className="w-px h-4 bg-white/20" />
                                        <button
                                            onClick={() => {
                                                if (falseStart !== -1) {
                                                    openActionPalette(undefined, falseEnd);
                                                } else {
                                                    const elseAction: Action = { id: 'act_' + Date.now() + '_else', type: 'else', selector: '', value: '' };
                                                    const newActions = [...currentTask.actions];
                                                    newActions.splice(blockEnd, 0, elseAction);
                                                    setCurrentTask({ ...currentTask, actions: newActions });
                                                    handleAutoSave({ ...currentTask, actions: newActions });
                                                    setTimeout(() => openActionPalette(undefined, blockEnd + 1), 50);
                                                }
                                            }}
                                            className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Add action"
                                            title="Add action"
                                        >
                                            <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex flex-col items-center mt-3">
                            <div className="w-px h-2 bg-white/25" />
                            <button
                                onClick={() => openActionPalette(undefined, blockEnd + 1)}
                                className="w-8 h-8 border border-dashed border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Add action"
                                title="Add action"
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
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                            />
                        </div>
                        {i < endIndex - 1 && currentTask.actions[i + 1]?.type !== 'end' && (
                            <div className="flex flex-col items-center my-1">
                                <div className="w-px h-2 bg-white/25" />
                                <button
                                    onClick={() => openActionPalette(undefined, currentIndex + 1)}
                                    className="w-8 h-8 border border-dashed border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label="Add action"
                                    title="Add action"
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

    return (
        <div
            ref={canvasViewportRef}
            className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={handleCanvasContextMenu}
        >
            {/* Dot grid — viewport space so backgroundPosition tracks canvas offset directly,
                preventing the repeating pattern from aliasing on exact-multiple wheel deltas */}
            <div
                className="absolute inset-0 pointer-events-none z-0"
                style={{
                    backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.3) 0.8px, transparent 0)`,
                    backgroundSize: `${22 * canvasScale}px ${22 * canvasScale}px`,
                    backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
                }}
            />

            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
                }}
            >
                {/* Sticky notes layer — below blocks (z-5 vs z-10) */}
                {(currentTask.stickyNotes || []).map((note) => (
                    <StickyNote
                        key={note.id}
                        note={note}
                        canvasScale={canvasScale}
                        isSelected={selectedNoteIds.has(note.id)}
                        onUpdate={onUpdateStickyNote}
                        onDelete={onDeleteStickyNote}
                        onDuplicate={onDuplicateStickyNote}
                    />
                ))}

                <div className="relative z-10 flex flex-col items-center pointer-events-none" style={{ paddingTop: '60px', minWidth: '500px' }}>
                    <div className="w-[360px] bg-black border border-white/15 p-5 rounded-2xl shadow-2xl shadow-black/50 select-text cursor-auto relative z-10 pointer-events-auto">
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                aria-expanded={triggerExpanded}
                                aria-label={triggerExpanded ? "Collapse trigger settings" : "Expand trigger settings"}
                                title={triggerExpanded ? "Collapse" : "Expand"}
                                onClick={() => setTriggerExpanded(!triggerExpanded)}
                                className="flex items-center gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg pr-2 transition-all"
                            >
                                <MaterialIcon name="bolt" className="text-white/40 text-base" />
                                <h3 className="text-white/60 font-bold tracking-widest uppercase text-[10px]">On Execution</h3>
                                <MaterialIcon name={triggerExpanded ? 'expand_less' : 'expand_more'} className="text-xs text-gray-600" />
                            </button>
                            <button
                                onClick={() => onOpenCabinet('mode')}
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
                    {currentTask.mode === 'agent' && <div className="w-px h-10 bg-white/25" />}
                    {currentTask.mode === 'agent' && (
                        <div className="flex flex-col items-center w-full select-text cursor-auto pointer-events-none">
                            <div className="space-y-6 w-full flex flex-col items-center relative">
                                {buildAst(0, currentTask.actions.length)}
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

            {canvasContextMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setCanvasContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCanvasContextMenu(null); }} />
                    <div
                        className="fixed z-50 w-[180px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-[10px] font-bold uppercase tracking-widest text-white/80"
                        style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
                    >
                        <button
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
                            onClick={() => {
                                onAddStickyNote(canvasContextMenu.worldX, canvasContextMenu.worldY);
                                setCanvasContextMenu(null);
                            }}
                        >
                            <span className="material-symbols-outlined text-white/50" style={{ fontSize: '14px' }}>sticky_note_2</span>
                            Add sticky note
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default CanvasView;
