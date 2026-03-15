import React, { memo, useState } from 'react';
import { Action, Task, Variable, VarType } from '../../types';
import MaterialIcon from '../MaterialIcon';
import RichInput from '../RichInput';
import CodeEditor from '../CodeEditor';
import { ACTION_CATALOG } from './actionCatalog';

const PRESS_MODIFIERS = [
    { value: 'Control', label: 'Ctrl' },
    { value: 'Shift', label: 'Shift' },
    { value: 'Alt', label: 'Alt' },
    { value: 'Meta', label: 'Meta' }
];

const PRESS_BASE_KEYS = [
    'Enter',
    'Tab',
    'Escape',
    'Space',
    'Backspace',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'F1',
    'F2',
    'F3',
    'F4',
    'F5'
]
    .concat([...Array(10)].map((_, i) => `${i}`))
    .concat(Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)));

const TYPE_MODE_OPTIONS = [
    { value: 'replace', label: 'Replace Text' },
    { value: 'append', label: 'Append Text' }
];

const parsePressKey = (key?: string) => {
    if (!key) return { modifiers: [] as string[], baseKey: '' };
    const parts = key.split('+');
    const baseKey = parts.pop() || '';
    return { modifiers: parts, baseKey };
};

const buildPressKey = (modifiers: string[], baseKey: string) => {
    const filtered = modifiers.filter(Boolean);
    return [...filtered, baseKey].filter(Boolean).join('+');
};

const normalizeVarName = (raw: string) => {
    const trimmed = (raw || '').trim();
    const match = trimmed.match(/^\{\$([\w.]+)\}$/);
    return match ? match[1] : trimmed;
};

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
    }
    return summary.trim();
};

const conditionOps: Record<VarType, { value: string; label: string }[]> = {
    string: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not equal' },
        { value: 'contains', label: 'Contains' },
        { value: 'starts_with', label: 'Starts with' },
        { value: 'ends_with', label: 'Ends with' },
        { value: 'matches', label: 'Matches regex' }
    ],
    number: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not equal' },
        { value: 'gt', label: 'Greater than' },
        { value: 'gte', label: 'Greater or equal' },
        { value: 'lt', label: 'Less than' },
        { value: 'lte', label: 'Less or equal' }
    ],
    boolean: [
        { value: 'is_true', label: 'Is true' },
        { value: 'is_false', label: 'Is false' }
    ]
};

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
    isSelected?: boolean;
    selectorOptions?: string[];
}

const ActionItem: React.FC<ActionItemProps> = memo(({
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
    isSelected,
    selectorOptions
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const statusClass = status === 'running'
        ? 'border-yellow-400/60'
        : status === 'success'
            ? 'border-green-400/60'
            : status === 'error'
                ? 'border-red-400/70'
                : status === 'skipped'
                    ? 'border-gray-500/40'
                    : '';

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
        return <span className="text-[9px] text-white/20">|</span>;
    };

    const isInteractiveTarget = (target: EventTarget | null) => {
        if (!target || !(target instanceof HTMLElement)) return false;
        return !!target.closest('input, textarea, select, button, a, [contenteditable="true"], [data-no-drag="true"], [role="button"]');
    };

    // Calculate transform based on isDragging state and passed dragTransformY
    // If dragging, use the exact Y offset calculated by parent.
    // If not dragging, rely on translateY (for displacement by other dragged items).
    const transformStyle = isDragging
        ? `translateY(${dragTransformY || 0}px)`
        : translateY
            ? `translateY(${translateY}px)`
            : undefined;

    return (
        <div
            id={`action-${action.id}`}
            data-action-id={action.id}
            onPointerDown={(e) => {
                if (isInteractiveTarget(e.target)) return;
                if (e.button !== 0) return;
                e.preventDefault();
                onPointerDown(e, action.id, index);
            }}
            onContextMenu={(e) => onOpenContextMenu(e, action.id)}
            className={`bg-black min-w-[280px] w-full max-w-sm mx-auto border p-5 rounded-2xl space-y-4 group/item relative transition-[transform,box-shadow,opacity,filter,background-color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform select-none touch-none ${statusClass || (isSelected ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-white/20')} ${isDragging ? 'ring-2 ring-white/40 scale-[1.02] shadow-[0_30px_80px_rgba(0,0,0,0.45)] opacity-85 z-20 mx-auto' : ''} ${isDragOver && !isDragging ? 'ring-2 ring-blue-400/60 bg-blue-500/5' : ''} ${action.disabled ? 'opacity-40 grayscale' : ''}`}
            style={{
                transform: transformStyle
            }}
        >
            <div
                role="button"
                tabIndex={0}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? "Collapse action" : "Expand action"}
                title={isExpanded ? "Collapse" : "Expand"}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setIsExpanded(!isExpanded);
                    }
                }}
                className="flex items-center justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-xl"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <div className="text-[8px] font-bold text-white/20 font-mono tracking-tighter">{(index + 1).toString().padStart(2, '0')}</div>
                    <div className="w-4 h-4 flex items-center justify-center">
                        {renderBlockMarker(action.type)}
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenPalette(action.id); }}
                        className="action-type-select text-[10px] font-bold uppercase tracking-[0.2em] text-white focus:outline-none cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label={`Change action type: ${action.type}`}
                    >
                        {ACTION_CATALOG.find((item) => item.type === action.type)?.label || action.type}
                    </button>
                    {!isExpanded && (
                        <span className="ml-2 text-white/40 text-[9px] font-mono truncate max-w-[150px] pointer-events-none">
                            {getActionSummary(action)}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <MaterialIcon name={isExpanded ? 'expand_less' : 'expand_more'} className="text-base text-gray-600" />
                </div>
            </div>
            {isExpanded && (<>
                {(action.type === 'click' || action.type === 'type' || action.type === 'hover' || action.type === 'wait_selector' || action.type === 'scroll') && (
                    <div className="space-y-1.5 relative">
                        <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1 block">
                            {action.type === 'scroll' ? 'Selector (Optional)' : 'Selector'}
                        </label>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all flex items-center gap-2 relative">
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <RichInput
                                    value={action.selector || ''}
                                    onChange={(v) => onUpdate(action.id, { selector: v })}
                                    onBlur={() => onAutoSave()}
                                    variables={variables}
                                    placeholder={action.type === 'scroll' ? ".scroll-container or leave empty" : ".btn-primary"}
                                />
                                {selectorOptions && selectorOptions.length > 1 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selectorOptions.map((opt, i) => (
                                            <button
                                                key={i}
                                                onClick={(e) => { e.stopPropagation(); onUpdate(action.id, { selector: opt }, true); }}
                                                className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${action.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                title="Use this alternative selector"
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    if (onStartInspect) onStartInspect(action.id);
                                }}
                                disabled={action.disabled}
                                className="text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 flex items-center justify-center opacity-50 hover:opacity-100 shrink-0 disabled:opacity-20 disabled:hover:opacity-20 disabled:cursor-not-allowed rounded"
                                title="Pick Selector in Browser"
                                aria-label="Pick Selector in Browser"
                            >
                                <MaterialIcon name="my_location" className="text-lg" />
                            </button>
                        </div>
                    </div>
                )}


                {action.type === 'scroll' && (
                    <div className="space-y-1.5">
                        <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Scroll Speed (ms)</label>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                            <RichInput
                                value={action.key || ''}
                                onChange={(v) => onUpdate(action.id, { key: v })}
                                onBlur={() => onAutoSave()}
                                variables={variables}
                                placeholder="500"
                            />
                        </div>
                    </div>
                )}

                {(action.type === 'navigate' || action.type === 'type' || action.type === 'wait' || action.type === 'wait_selector' || action.type === 'javascript' || action.type === 'csv') && (
                    <div className="space-y-1.5">
                        <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">
                            {action.type === 'navigate'
                                ? 'URL'
                                : action.type === 'type'
                                    ? 'Content'
                                    : action.type === 'wait'
                                        ? 'Seconds'
                                        : action.type === 'wait_selector'
                                            ? 'Timeout (Sec)'
                                            : action.type === 'csv'
                                                ? 'CSV Input'
                                                : 'Script'}
                        </label>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                            {action.type === 'javascript' ? (
                                <CodeEditor
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    language="javascript"
                                    variables={variables}
                                    className="min-h-[120px]"
                                    placeholder="return document.title"
                                />
                            ) : action.type === 'csv' ? (
                                <CodeEditor
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    language="plain"
                                    variables={variables}
                                    className="min-h-[120px]"
                                    placeholder="name,age\nAda,31"
                                />
                            ) : (
                                <RichInput
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    variables={variables}
                                    placeholder={action.type === 'navigate' ? 'https://example.com' : action.type === 'type' ? 'Search keywords' : action.type === 'wait' ? '3' : action.type === 'wait_selector' ? '10' : '400'}
                                />
                            )}
                        </div>
                        {action.type === 'type' && (
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Mode</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <select
                                        value={action.typeMode || 'replace'}
                                        onChange={(e) => {
                                            onUpdate(action.id, { typeMode: e.target.value as 'append' | 'replace' }, true);
                                        }}
                                        className="custom-select w-full bg-transparent border-none px-0 py-0 text-[11px] text-white"
                                    >
                                        {TYPE_MODE_OPTIONS.map((option) => (
                                            <option key={option.value} value={option.value}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {action.type === 'screenshot' && (
                    <div className="space-y-1.5">
                        <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Label (Optional)</label>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                            <RichInput
                                value={action.value || ''}
                                onChange={(v) => onUpdate(action.id, { value: v })}
                                onBlur={() => onAutoSave()}
                                variables={variables}
                                placeholder="checkout-step"
                            />
                        </div>
                    </div>
                )
                }

                {
                    action.type === 'press' && (() => {
                        const { modifiers, baseKey } = parsePressKey(action.key);
                        return (
                            <div className="space-y-2">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Key</label>
                                <div className="grid grid-cols-2 gap-1 text-[10px] text-white">
                                    {PRESS_MODIFIERS.map((modifier) => (
                                        <label key={modifier.value} className="inline-flex items-center space-x-1">
                                            <input
                                                type="checkbox"
                                                checked={modifiers.includes(modifier.value)}
                                                onChange={(e) => {
                                                    const nextModifiers = e.target.checked
                                                        ? [...modifiers, modifier.value]
                                                        : modifiers.filter((m) => m !== modifier.value);
                                                    onUpdate(action.id, {
                                                        key: buildPressKey(nextModifiers, baseKey)
                                                    }, true);
                                                }}
                                                className="h-3 w-3 rounded border border-white/30 bg-black/80"
                                            />
                                            <span className="uppercase text-[9px] text-white/70">{modifier.label}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <select
                                        value={baseKey}
                                        onChange={(e) => onUpdate(action.id, { key: buildPressKey(modifiers, e.target.value) }, true)}
                                        className="custom-select w-full bg-transparent border-none px-0 py-0 text-[11px] text-white"
                                    >
                                        <option value="">Select key</option>
                                        {PRESS_BASE_KEYS.map((keyOption) => (
                                            <option key={keyOption} value={keyOption}>
                                                {keyOption}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        );
                    })()
                }

                {
                    action.type === 'if' && (() => {
                        const varKeys = Object.keys(variables || {});
                        const normalizedVar = normalizeVarName(action.conditionVar || '');
                        const inferredType = normalizedVar && variables?.[normalizedVar]?.type;
                        const varType = action.conditionVarType || inferredType || 'string';
                        const ops = conditionOps[varType as VarType] || conditionOps.string;
                        const opValue = action.conditionOp || ops[0].value;
                        return (
                            <div className="space-y-2">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Condition</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Variable</span>
                                        <input
                                            type="text"
                                            list={`if-var-${action.id}`}
                                            value={action.conditionVar || ''}
                                            onChange={(e) => onUpdate(action.id, { conditionVar: e.target.value })}
                                            onBlur={() => onAutoSave()}
                                            placeholder="variable name"
                                            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white"
                                        />
                                        {varKeys.length > 0 && (
                                            <datalist id={`if-var-${action.id}`}>
                                                {varKeys.map((key) => (
                                                    <option key={key} value={key} />
                                                ))}
                                            </datalist>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Type</span>
                                        <select
                                            value={varType}
                                            onChange={(e) => {
                                                const nextType = e.target.value as VarType;
                                                const nextOps = conditionOps[nextType] || conditionOps.string;
                                                onUpdate(action.id, {
                                                    conditionVarType: nextType,
                                                    conditionOp: nextOps[0].value,
                                                    conditionValue: nextType === 'boolean' ? '' : action.conditionValue || ''
                                                }, true);
                                            }}
                                            className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-[8px] font-bold uppercase text-white/60"
                                        >
                                            <option value="string">String</option>
                                            <option value="number">Number</option>
                                            <option value="boolean">Boolean</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Relation</span>
                                        <select
                                            value={opValue}
                                            onChange={(e) => onUpdate(action.id, { conditionOp: e.target.value }, true)}
                                            className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-[8px] font-bold uppercase text-white/60"
                                        >
                                            {ops.map((opt) => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {varType !== 'boolean' && (
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Value</span>
                                        <input
                                            type={varType === 'number' ? 'number' : 'text'}
                                            value={action.conditionValue || ''}
                                            onChange={(e) => onUpdate(action.id, { conditionValue: e.target.value })}
                                            onBlur={() => onAutoSave()}
                                            placeholder={varType === 'number' ? '0' : 'value'}
                                            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white"
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })()
                }

                {
                    action.type === 'while' && (() => {
                        const varKeys = Object.keys(variables || {});
                        const normalizedVar = normalizeVarName(action.conditionVar || '');
                        const inferredType = normalizedVar && variables?.[normalizedVar]?.type;
                        const varType = action.conditionVarType || inferredType || 'string';
                        const ops = conditionOps[varType as VarType] || conditionOps.string;
                        const opValue = action.conditionOp || ops[0].value;
                        return (
                            <div className="space-y-2">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Condition</label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Variable</span>
                                        <input
                                            type="text"
                                            list={`while-var-${action.id}`}
                                            value={action.conditionVar || ''}
                                            onChange={(e) => onUpdate(action.id, { conditionVar: e.target.value })}
                                            onBlur={() => onAutoSave()}
                                            placeholder="variable name"
                                            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white"
                                        />
                                        {varKeys.length > 0 && (
                                            <datalist id={`while-var-${action.id}`}>
                                                {varKeys.map((key) => (
                                                    <option key={key} value={key} />
                                                ))}
                                            </datalist>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Type</span>
                                        <select
                                            value={varType}
                                            onChange={(e) => {
                                                const nextType = e.target.value as VarType;
                                                const nextOps = conditionOps[nextType] || conditionOps.string;
                                                onUpdate(action.id, {
                                                    conditionVarType: nextType,
                                                    conditionOp: nextOps[0].value,
                                                    conditionValue: nextType === 'boolean' ? '' : action.conditionValue || ''
                                                }, true);
                                            }}
                                            className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-[8px] font-bold uppercase text-white/60"
                                        >
                                            <option value="string">String</option>
                                            <option value="number">Number</option>
                                            <option value="boolean">Boolean</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Relation</span>
                                        <select
                                            value={opValue}
                                            onChange={(e) => onUpdate(action.id, { conditionOp: e.target.value }, true)}
                                            className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-[8px] font-bold uppercase text-white/60"
                                        >
                                            {ops.map((opt) => (
                                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {varType !== 'boolean' && (
                                    <div className="space-y-1">
                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest pl-1">Value</span>
                                        <input
                                            type={varType === 'number' ? 'number' : 'text'}
                                            value={action.conditionValue || ''}
                                            onChange={(e) => onUpdate(action.id, { conditionValue: e.target.value })}
                                            onBlur={() => onAutoSave()}
                                            placeholder={varType === 'number' ? '0' : 'value'}
                                            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white"
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })()
                }

                {
                    action.type === 'repeat' && (
                        <div className="space-y-1.5">
                            <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Times</label>
                            <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                <RichInput
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    variables={variables}
                                    placeholder="3"
                                />
                            </div>
                        </div>
                    )
                }

                {
                    action.type === 'foreach' && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Selector (Optional)</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <RichInput
                                        value={action.selector || ''}
                                        onChange={(v) => onUpdate(action.id, { selector: v })}
                                        variables={variables}
                                        placeholder=".list-item"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Variable (Array Name)</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <RichInput
                                        value={action.varName || ''}
                                        onChange={(v) => onUpdate(action.id, { varName: v })}
                                        variables={variables}
                                        placeholder="items"
                                    />
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    action.type === 'set' && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Variable Name</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <RichInput
                                        value={action.varName || ''}
                                        onChange={(v) => onUpdate(action.id, { varName: v })}
                                        variables={variables}
                                        placeholder="status"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Value</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <RichInput
                                        value={action.value || ''}
                                        onChange={(v) => onUpdate(action.id, { value: v })}
                                        variables={variables}
                                        placeholder="ready"
                                    />
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    action.type === 'merge' && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Sources</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <RichInput
                                        value={action.value || ''}
                                        onChange={(v) => onUpdate(action.id, { value: v })}
                                        variables={variables}
                                        placeholder="items, extraItems, {$block.output}"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Target Variable (Optional)</label>
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[11px] focus-within:border-white/20 transition-all">
                                    <RichInput
                                        value={action.varName || ''}
                                        onChange={(v) => onUpdate(action.id, { varName: v })}
                                        variables={variables}
                                        placeholder="allItems"
                                    />
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    action.type === 'stop' && (
                        <div className="space-y-1.5">
                            <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Outcome</label>
                            <select
                                value={action.value || 'success'}
                                onChange={(e) => onUpdate(action.id, { value: e.target.value }, true)}
                                className="custom-select w-full bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70 focus:outline-none"
                            >
                                <option value="success">Success</option>
                                <option value="error">Error</option>
                            </select>
                        </div>
                    )
                }

                {
                    action.type === 'on_error' && (
                        <div className="text-[8px] text-gray-600 uppercase tracking-widest">
                            Runs if any action fails.
                        </div>
                    )
                }

                {
                    action.type === 'start' && (
                        <div className="space-y-1.5">
                            <label className="text-[7px] font-bold text-gray-600 uppercase tracking-widest pl-1">Task</label>
                            <select
                                value={action.value || ''}
                                onChange={(e) => onUpdate(action.id, { value: e.target.value }, true)}
                                className="custom-select w-full bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2 text-[9px] font-bold uppercase tracking-[0.2em] text-white/70 focus:outline-none"
                            >
                                <option value="" disabled>Select task</option>
                                {availableTasks.length === 0 && (
                                    <option value="" disabled>No other tasks</option>
                                )}
                                {availableTasks.map((task) => (
                                    <option key={task.id} value={task.id}>
                                        {task.name || task.id}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )
                }
            </>)}
        </div >
    );
});

export default ActionItem;
