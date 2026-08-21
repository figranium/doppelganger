import React, { useEffect, useState, useRef } from 'react';
import { Action, Task, Variable } from '../../types';
import MaterialIcon from '../MaterialIcon';
import { ACTION_CATALOG } from './actionCatalog';
import ActionConfigModal from './ActionConfigModal';

const getActionSummary = (action: Action) => {
    let summary = '';
    if (action.type === 'click' || action.type === 'hover' || action.type === 'scroll' || action.type === 'wait_selector') {
        summary = action.selector || '';
    } else if (action.type === 'type' || action.type === 'navigate' || action.type === 'wait' || action.type === 'javascript' || action.type === 'repeat' || action.type === 'start' || action.type === 'screenshot' || action.type === 'wait_downloads' || action.type === 'stop') {
        summary = action.value || '';
    } else if (action.type === 'set' || action.type === 'foreach' || action.type === 'merge') {
        summary = action.varName || '';
    } else if (action.type === 'press') {
        summary = action.key || '';
    } else if (action.type === 'if' || action.type === 'while') {
        summary = action.conditionVar || '';
    } else if (action.type === 'http_request') {
        const m = action.method || 'GET';
        summary = action.value ? `[${m}] ${action.value}` : m;
    } else if (action.type === 'get_content') {
        summary = action.varName ? `→ ${action.varName}` : action.selector || '';
    }
    return summary.trim();
};

const renderBlockMarker = (type: Action['type']) => {
    const iconClass = "text-[12px]";
    if (type === 'if' || type === 'else') return <MaterialIcon name="call_split" className={`${iconClass} text-white`} />;
    if (type === 'end') return <MaterialIcon name="subdirectory_arrow_right" className={`${iconClass} text-gray-500`} />;
    if (type === 'while' || type === 'repeat') return <MaterialIcon name="repeat" className={`${iconClass} text-white`} />;
    if (type === 'foreach') return <MaterialIcon name="list" className={`${iconClass} text-white`} />;
    if (type === 'on_error') return <MaterialIcon name="warning" className={`${iconClass} text-red-400`} />;
    if (type === 'set') return <MaterialIcon name="data_object" className={`${iconClass} text-white`} />;
    if (type === 'stop') return <MaterialIcon name="stop" className={`${iconClass} text-white`} />;
    if (type === 'click') return <MaterialIcon name="ads_click" className={`${iconClass} text-white`} />;
    if (type === 'type') return <MaterialIcon name="text_format" className={`${iconClass} text-white`} />;
    if (type === 'hover') return <MaterialIcon name="my_location" className={`${iconClass} text-white`} />;
    if (type === 'press') return <MaterialIcon name="keyboard" className={`${iconClass} text-white`} />;
    if (type === 'wait') return <MaterialIcon name="schedule" className={`${iconClass} text-white`} />;
    if (type === 'wait_selector') return <MaterialIcon name="schedule" className={`${iconClass} text-white`} />;
    if (type === 'scroll') return <MaterialIcon name="swap_vert" className={`${iconClass} text-white`} />;
    if (type === 'javascript') return <MaterialIcon name="code" className={`${iconClass} text-white`} />;
    if (type === 'csv') return <MaterialIcon name="table_chart" className={`${iconClass} text-white`} />;
    if (type === 'merge') return <MaterialIcon name="layers" className={`${iconClass} text-white`} />;
    if (type === 'screenshot') return <MaterialIcon name="photo_camera" className={`${iconClass} text-white`} />;
    if (type === 'start') return <MaterialIcon name="play_circle" className={`${iconClass} text-white`} />;
    if (type === 'navigate') return <MaterialIcon name="navigation" className={`${iconClass} text-white`} />;
    if (type === 'http_request') return <MaterialIcon name="language" className={`${iconClass} text-white`} />;
    if (type === 'wait_downloads') return <MaterialIcon name="download" className={`${iconClass} text-white`} />;
    if (type === 'get_content') return <MaterialIcon name="article" className={`${iconClass} text-white`} />;
    if (type === 'do_nothing') return <MaterialIcon name="block" className={`${iconClass} text-white/50`} />;
    return <span className="text-xs text-white/20">|</span>;
};

// Block types that have no config and shouldn't open a modal
const NO_CONFIG_TYPES: Action['type'][] = ['else', 'end', 'on_error', 'do_nothing'];

interface ActionItemProps {
    action: Action;
    index: number;
    status: 'running' | 'success' | 'error' | 'skipped' | undefined;
    isDragging: boolean;
    isDragOver: boolean;
    translateY: number;
    variables: Record<string, Variable>;
    availableTasks: Task[];
    onUpdate: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    onAutoSave: () => void;
    onOpenPalette: (id?: string) => void;
    onOpenContextMenu: (e: React.MouseEvent, id: string) => void;
    onPointerDown: (e: React.PointerEvent, id: string, index: number) => void;
    dragTransformY?: number;
    onStartInspect?: (id: string) => void;
    onCreateVariable?: (name: string) => void;
    onDeleteVariable?: (name: string) => void;
    isSelected?: boolean;
    selectorOptions?: string[];
}

const ActionItem: React.FC<ActionItemProps> = React.memo(({
    action,
    index,
    status,
    isDragging,
    isDragOver,
    translateY,
    variables,
    availableTasks,
    onUpdate,
    onAutoSave,
    onOpenPalette,
    onOpenContextMenu,
    onPointerDown,
    dragTransformY,
    onStartInspect,
    onCreateVariable,
    onDeleteVariable,
    isSelected,
    selectorOptions
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
    const paletteOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const statusClass = status === 'running'
        ? 'border-yellow-400/60'
        : status === 'success'
            ? 'border-green-400/60'
            : status === 'error'
                ? 'border-red-400/70'
                : status === 'skipped'
                    ? 'border-gray-500/40'
                    : '';

    const isInteractiveTarget = (target: EventTarget | null) => {
        if (!target || !(target instanceof HTMLElement)) return false;
        return !!target.closest('input, textarea, select, button, a, [contenteditable="true"], [data-no-drag="true"], [role="button"]');
    };

    const transformStyle = isDragging
        ? `translateY(${dragTransformY || 0}px)`
        : translateY
            ? `translateY(${translateY}px)`
            : undefined;

    const summary = getActionSummary(action);
    const hasConfig = !NO_CONFIG_TYPES.includes(action.type);

    useEffect(() => {
        return () => {
            if (paletteOpenTimer.current) {
                clearTimeout(paletteOpenTimer.current);
                paletteOpenTimer.current = null;
            }
        };
    }, []);

    const openActionPaletteWithDelay = () => {
        if (paletteOpenTimer.current) {
            clearTimeout(paletteOpenTimer.current);
            paletteOpenTimer.current = null;
            if (hasConfig) {
                setIsModalOpen(true);
            }
            return;
        }

        paletteOpenTimer.current = setTimeout(() => {
            paletteOpenTimer.current = null;
            onOpenPalette(action.id);
        }, 180);
    };

    return (
        <>
            <div
                id={`action-${action.id}`}
                data-action-id={action.id}
                onPointerDown={(e) => {
                    if (isInteractiveTarget(e.target)) return;
                    if (e.button !== 0) return;
                    pointerDownPos.current = { x: e.clientX, y: e.clientY };
                    e.stopPropagation();
                    onPointerDown(e, action.id, index);
                }}
                onDoubleClick={(e) => {
                    if (!hasConfig) return;
                    if (isInteractiveTarget(e.target)) return;
                    e.stopPropagation();
                    setIsModalOpen(true);
                }}
                onContextMenu={(e) => onOpenContextMenu(e, action.id)}
                className={`bg-black min-w-[280px] w-full max-w-sm mx-auto border p-5 rounded-2xl group/item relative transition-[transform,box-shadow,opacity,filter,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform select-none touch-none ${statusClass || (isSelected ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-white/20')} ${isDragging ? 'ring-2 ring-white/40 scale-[1.02] shadow-[0_30px_80px_rgba(0,0,0,0.45)] opacity-85 z-20 mx-auto' : ''} ${isDragOver && !isDragging ? 'ring-2 ring-blue-400/60 bg-blue-500/5' : ''} ${action.disabled ? 'opacity-40 grayscale' : ''}`}
                style={{ transform: transformStyle }}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="text-xs font-bold text-white/20 font-mono tracking-tighter shrink-0">{(index + 1).toString().padStart(2, '0')}</div>
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        {renderBlockMarker(action.type)}
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            openActionPaletteWithDelay();
                        }}
                        onDoubleClick={(e) => {
                            if (!hasConfig) return;
                            if (isInteractiveTarget(e.target)) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setIsModalOpen(true);
                        }}
                        className="action-type-select text-xs font-bold uppercase tracking-[0.2em] text-white focus:outline-none cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-white/50 shrink-0"
                        aria-label={`Change action type: ${action.type}`}
                    >
                        {ACTION_CATALOG.find((item) => item.type === action.type)?.label || action.type}
                    </button>
                    {summary && (
                        <span className="text-white/40 text-xs font-mono truncate min-w-0 pointer-events-none">
                            {summary}
                        </span>
                    )}
                    {hasConfig && (
                        <button
                            data-no-drag="true"
                            onClick={(e) => { e.stopPropagation(); setIsModalOpen(true); }}
                            className="ml-auto shrink-0 text-white/20 hover:text-white/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                            aria-label="Configure block"
                            title="Configure block"
                        >
                            <MaterialIcon name="tune" className="text-sm" />
                        </button>
                    )}
                </div>
            </div>

            {isModalOpen && (
                <ActionConfigModal
                    action={action}
                    variables={variables}
                    availableTasks={availableTasks}
                    selectorOptions={selectorOptions}
                    onUpdate={onUpdate}
                    onAutoSave={onAutoSave}
                    onClose={() => setIsModalOpen(false)}
                    onStartInspect={onStartInspect}
                    onCreateVariable={onCreateVariable}
                    onDeleteVariable={onDeleteVariable}
                />
            )}
        </>
    );
});

export default ActionItem;
