import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
    'Enter', 'Tab', 'Escape', 'Space', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5'
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
    ],
    selector: [
        { value: 'exists', label: 'Exists' },
        { value: 'not_exists', label: 'Does not exist' }
    ]
};

const NO_CONFIG_TYPES: Action['type'][] = ['else', 'end', 'on_error', 'do_nothing'];

interface ActionConfigModalProps {
    action: Action;
    variables: Record<string, Variable>;
    availableTasks: Task[];
    selectorOptions?: string[];
    onUpdate: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    onAutoSave: () => void;
    onClose: () => void;
    onStartInspect?: (id: string) => void;
    onCreateVariable?: (name: string) => void;
    onDeleteVariable?: (name: string) => void;
}

const ActionConfigModal: React.FC<ActionConfigModalProps> = ({
    action,
    variables,
    availableTasks,
    selectorOptions,
    onUpdate,
    onAutoSave,
    onClose,
    onStartInspect,
    onCreateVariable,
    onDeleteVariable,
}) => {
    const label = ACTION_CATALOG.find((i) => i.type === action.type)?.label || action.type;

    const [showAiPrompt, setShowAiPrompt] = useState(false);
    const [aiDescription, setAiDescription] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    const handleGenerateScript = async () => {
        if (!aiDescription.trim()) return;
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch('/api/tasks/generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: aiDescription.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.details ? `${data.error}: ${data.details}` : (data.error || 'Generation failed'));
            onUpdate(action.id, { value: data.script });
            setShowAiPrompt(false);
            setAiDescription('');
        } catch (e: any) {
            setAiError(e.message);
        } finally {
            setAiLoading(false);
        }
    };
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const autoCreatedInSession = useRef(new Set<string>());

    useEffect(() => {
        const fieldsToScan = [
            action.selector, action.value, action.key, action.varName,
            action.conditionValue, action.headers, action.body
        ];
        const regex = /\{\$([\w.]+)\}/g;
        const referenced = new Set<string>();
        for (const text of fieldsToScan) {
            if (!text) continue;
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const name = match[1];
                if (name !== 'now' && name !== 'block.output') referenced.add(name);
            }
        }
        // Create missing variables
        for (const name of referenced) {
            if (!(name in variables)) {
                onCreateVariable?.(name);
                autoCreatedInSession.current.add(name);
            }
        }
        // Delete auto-created variables that are no longer referenced
        for (const name of autoCreatedInSession.current) {
            if (!referenced.has(name) && variables[name]?.autoCreated) {
                onDeleteVariable?.(name);
                autoCreatedInSession.current.delete(name);
            }
        }
    }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

    const field = (labelText: string, children: React.ReactNode) => (
        <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1 block">{labelText}</label>
            {children}
        </div>
    );

    const inputWrap = (children: React.ReactNode) => (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs focus-within:border-white/20 transition-all">
            {children}
        </div>
    );

    const renderForm = () => {
        if (NO_CONFIG_TYPES.includes(action.type)) {
            return (
                <p className="text-xs text-gray-600 text-center py-4">
                    This block has no configurable options.
                </p>
            );
        }

        const { modifiers, baseKey } = parsePressKey(action.key);

        const varKeys = Object.keys(variables || {});
        const normalizedVar = normalizeVarName(action.conditionVar || '');
        const inferredType = normalizedVar && variables?.[normalizedVar]?.type;
        const condVarType = action.conditionVarType || inferredType || 'string';
        const ops = conditionOps[condVarType as VarType] || conditionOps.string;
        const opValue = action.conditionOp || ops[0].value;

        const httpMethod = action.method || 'GET';
        const bodyMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

        return (
            <div className="space-y-10">
                {/* Selector field */}
                {(action.type === 'click' || action.type === 'type' || action.type === 'hover' || action.type === 'wait_selector' || action.type === 'scroll') && (
                    field(action.type === 'scroll' ? 'Selector (Optional)' : 'Selector',
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs focus-within:border-white/20 transition-all flex items-center gap-2">
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <RichInput
                                    value={action.selector || ''}
                                    onChange={(v) => onUpdate(action.id, { selector: v })}
                                    onBlur={() => onAutoSave()}
                                    variables={variables}
                                    placeholder={action.type === 'scroll' ? '.scroll-container or leave empty' : '.btn-primary'}
                                />
                                {selectorOptions && selectorOptions.length > 1 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {selectorOptions.map((opt, i) => (
                                            <button
                                                key={i}
                                                onClick={() => onUpdate(action.id, { selector: opt }, true)}
                                                className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${action.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {onStartInspect && (
                                <button
                                    onClick={() => { onClose(); onStartInspect(action.id); }}
                                    disabled={action.disabled}
                                    className="text-white opacity-50 hover:opacity-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shrink-0 disabled:opacity-20 disabled:cursor-not-allowed rounded"
                                    title="Pick Selector in Browser"
                                    aria-label="Pick Selector in Browser"
                                >
                                    <MaterialIcon name="my_location" className="text-lg" />
                                </button>
                            )}
                        </div>
                    )
                )}

                {/* Scroll speed */}
                {action.type === 'scroll' && field('Scroll Speed (ms)',
                    inputWrap(
                        <RichInput
                            value={action.key || ''}
                            onChange={(v) => onUpdate(action.id, { key: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="500"
                        />
                    )
                )}

                {/* Value field for navigate / type / wait / wait_selector / javascript / csv */}
                {(action.type === 'navigate' || action.type === 'type' || action.type === 'wait' || action.type === 'wait_selector' || action.type === 'javascript' || action.type === 'csv') && (
                    action.type === 'javascript' ? (
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Script</label>
                                <button
                                    onClick={() => { setShowAiPrompt(v => !v); setAiError(null); }}
                                    className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors"
                                    title="Generate with AI"
                                >
                                    <MaterialIcon name="auto_awesome" className="text-sm" />
                                    Generate
                                </button>
                            </div>
                            {showAiPrompt && (
                                <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                    <input
                                        autoFocus
                                        type="text"
                                        value={aiDescription}
                                        onChange={e => setAiDescription(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !aiLoading) handleGenerateScript(); }}
                                        placeholder="e.g. extract all article titles and links"
                                        className="bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                                    />
                                    {aiError && <p className="text-xs text-red-400">{aiError}</p>}
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => { setShowAiPrompt(false); setAiError(null); }} className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Cancel</button>
                                        <button
                                            onClick={handleGenerateScript}
                                            disabled={aiLoading || !aiDescription.trim()}
                                            className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                        >
                                            {aiLoading && <MaterialIcon name="autorenew" className="text-xs animate-spin" />}
                                            {aiLoading ? 'Generating…' : 'Generate'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {inputWrap(
                                <CodeEditor
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    language="javascript"
                                    variables={variables}
                                    className="min-h-[120px]"
                                    placeholder="return document.title"
                                />
                            )}
                        </div>
                    ) : field(
                        action.type === 'navigate' ? 'URL'
                            : action.type === 'type' ? 'Content'
                                : action.type === 'wait' ? 'Seconds'
                                    : action.type === 'wait_selector' ? 'Timeout (Sec)'
                                        : 'CSV Input',
                        inputWrap(
                            action.type === 'csv' ? (
                                <CodeEditor
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    language="plain"
                                    variables={variables}
                                    className="min-h-[120px]"
                                    placeholder={"name,age\nAda,31"}
                                />
                            ) : (
                                <RichInput
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    variables={variables}
                                    placeholder={
                                        action.type === 'navigate' ? 'https://example.com'
                                            : action.type === 'type' ? 'Search keywords'
                                                : action.type === 'wait' ? '3'
                                                    : action.type === 'wait_selector' ? '10'
                                                        : '400'
                                    }
                                />
                            )
                        )
                    )
                )}

                {/* Type mode */}
                {action.type === 'type' && field('Mode',
                    inputWrap(
                        <select
                            value={action.typeMode || 'replace'}
                            onChange={(e) => onUpdate(action.id, { typeMode: e.target.value as 'append' | 'replace' }, true)}
                            className="custom-select w-full bg-transparent border-none px-0 py-0 text-xs text-white"
                        >
                            {TYPE_MODE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    )
                )}

                {/* Screenshot label */}
                {action.type === 'screenshot' && field('Label (Optional)',
                    inputWrap(
                        <RichInput
                            value={action.value || ''}
                            onChange={(v) => onUpdate(action.id, { value: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="checkout-step"
                        />
                    )
                )}

                {/* Press key */}
                {action.type === 'press' && (
                    <div className="space-y-5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Key</label>
                        <div className="grid grid-cols-2 gap-3 text-xs text-white">
                            {PRESS_MODIFIERS.map((modifier) => (
                                <label key={modifier.value} className="inline-flex items-center space-x-1">
                                    <input
                                        type="checkbox"
                                        checked={modifiers.includes(modifier.value)}
                                        onChange={(e) => {
                                            const next = e.target.checked
                                                ? [...modifiers, modifier.value]
                                                : modifiers.filter((m) => m !== modifier.value);
                                            onUpdate(action.id, { key: buildPressKey(next, baseKey) }, true);
                                        }}
                                        className="h-3 w-3 rounded border border-white/30 bg-black/80"
                                    />
                                    <span className="uppercase text-xs text-white/70">{modifier.label}</span>
                                </label>
                            ))}
                        </div>
                        {inputWrap(
                            <select
                                value={baseKey}
                                onChange={(e) => onUpdate(action.id, { key: buildPressKey(modifiers, e.target.value) }, true)}
                                className="custom-select w-full bg-transparent border-none px-0 py-0 text-xs text-white"
                            >
                                <option value="">Select key</option>
                                {PRESS_BASE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                            </select>
                        )}
                    </div>
                )}

                {/* If / While condition */}
                {(action.type === 'if' || action.type === 'while') && (
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Condition</label>
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">{condVarType === 'selector' ? 'Selector' : 'Variable'}</span>
                                {condVarType === 'selector' ? (
                                    <div className="bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 focus-within:border-white/30 transition-all flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={action.selector || ''}
                                            onChange={(e) => onUpdate(action.id, { selector: e.target.value })}
                                            onBlur={() => onAutoSave()}
                                            placeholder=".verified-badge"
                                            className="flex-1 min-w-0 bg-transparent text-xs font-mono text-white focus:outline-none"
                                        />
                                        {onStartInspect && (
                                            <button
                                                onClick={() => { onClose(); onStartInspect(action.id); }}
                                                disabled={action.disabled}
                                                className="text-white opacity-50 hover:opacity-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shrink-0 disabled:opacity-20 disabled:cursor-not-allowed rounded"
                                                title="Pick Selector in Browser"
                                                aria-label="Pick Selector in Browser"
                                            >
                                                <MaterialIcon name="my_location" className="text-lg" />
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            type="text"
                                            list={`cond-var-${action.id}`}
                                            value={action.conditionVar || ''}
                                            onChange={(e) => onUpdate(action.id, { conditionVar: e.target.value })}
                                            onBlur={() => onAutoSave()}
                                            placeholder="variable name"
                                            className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                                        />
                                        {varKeys.length > 0 && (
                                            <datalist id={`cond-var-${action.id}`}>
                                                {varKeys.map((k) => <option key={k} value={k} />)}
                                            </datalist>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Type</span>
                                <select
                                    value={condVarType}
                                    onChange={(e) => {
                                        const nextType = e.target.value as VarType;
                                        const nextOps = conditionOps[nextType] || conditionOps.string;
                                        onUpdate(action.id, {
                                            conditionVarType: nextType,
                                            conditionOp: nextOps[0].value,
                                            conditionValue: (nextType === 'boolean' || nextType === 'selector') ? '' : action.conditionValue || ''
                                        }, true);
                                    }}
                                    className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold uppercase text-white/60 focus:outline-none"
                                >
                                    <option value="string">String</option>
                                    <option value="number">Number</option>
                                    <option value="boolean">Boolean</option>
                                    <option value="selector">Selector</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Relation</span>
                                <select
                                    value={opValue}
                                    onChange={(e) => onUpdate(action.id, { conditionOp: e.target.value }, true)}
                                    className="custom-select w-full bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs font-bold uppercase text-white/60 focus:outline-none"
                                >
                                    {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>
                        {condVarType !== 'boolean' && condVarType !== 'selector' && (
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Value</span>
                                <input
                                    type={condVarType === 'number' ? 'number' : 'text'}
                                    value={action.conditionValue || ''}
                                    onChange={(e) => onUpdate(action.id, { conditionValue: e.target.value })}
                                    onBlur={() => onAutoSave()}
                                    placeholder={condVarType === 'number' ? '0' : 'value'}
                                    className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-white/30"
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* Repeat */}
                {action.type === 'repeat' && field('Times',
                    inputWrap(
                        <RichInput
                            value={action.value || ''}
                            onChange={(v) => onUpdate(action.id, { value: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="3"
                        />
                    )
                )}

                {/* For Each */}
                {action.type === 'foreach' && <>
                    {field('Selector (Optional)', inputWrap(
                        <RichInput
                            value={action.selector || ''}
                            onChange={(v) => onUpdate(action.id, { selector: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder=".list-item"
                        />
                    ))}
                    {field('Variable (Array Name)', inputWrap(
                        <RichInput
                            value={action.varName || ''}
                            onChange={(v) => onUpdate(action.id, { varName: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="items"
                        />
                    ))}
                </>}

                {/* Set */}
                {action.type === 'set' && <>
                    {field('Variable Name', inputWrap(
                        <RichInput
                            value={action.varName || ''}
                            onChange={(v) => onUpdate(action.id, { varName: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="status"
                        />
                    ))}
                    {field('Value', inputWrap(
                        <RichInput
                            value={action.value || ''}
                            onChange={(v) => onUpdate(action.id, { value: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="ready"
                        />
                    ))}
                </>}

                {/* Merge */}
                {action.type === 'merge' && <>
                    {field('Sources', inputWrap(
                        <RichInput
                            value={action.value || ''}
                            onChange={(v) => onUpdate(action.id, { value: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="items, extraItems, {$block.output}"
                        />
                    ))}
                    {field('Target Variable (Optional)', inputWrap(
                        <RichInput
                            value={action.varName || ''}
                            onChange={(v) => onUpdate(action.id, { varName: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="allItems"
                        />
                    ))}
                </>}

                {/* Stop */}
                {action.type === 'stop' && field('Outcome',
                    <select
                        value={action.value || 'success'}
                        onChange={(e) => onUpdate(action.id, { value: e.target.value }, true)}
                        className="custom-select w-full bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white/70 focus:outline-none"
                    >
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                    </select>
                )}

                {/* Start Task */}
                {action.type === 'start' && field('Task',
                    <select
                        value={action.value || ''}
                        onChange={(e) => onUpdate(action.id, { value: e.target.value }, true)}
                        className="custom-select w-full bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white/70 focus:outline-none"
                    >
                        <option value="" disabled>Select task</option>
                        {availableTasks.length === 0 && <option value="" disabled>No other tasks</option>}
                        {availableTasks.map((t) => (
                            <option key={t.id} value={t.id}>{t.name || t.id}</option>
                        ))}
                    </select>
                )}

                {/* Wait Downloads */}
                {action.type === 'wait_downloads' && field('Max Wait (Sec, Optional)',
                    inputWrap(
                        <RichInput
                            value={action.value || ''}
                            onChange={(v) => onUpdate(action.id, { value: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="30"
                        />
                    )
                )}

                {/* HTTP Request */}
                {action.type === 'http_request' && <>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Method</label>
                            <select
                                value={httpMethod}
                                onChange={(e) => onUpdate(action.id, { method: e.target.value }, true)}
                                className="custom-select w-full bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs font-bold uppercase tracking-[0.1em] text-white/70 focus:outline-none focus:border-white/20"
                            >
                                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">URL</label>
                            {inputWrap(
                                <RichInput
                                    value={action.value || ''}
                                    onChange={(v) => onUpdate(action.id, { value: v })}
                                    onBlur={() => onAutoSave()}
                                    variables={variables}
                                    placeholder="https://api.example.com/data"
                                />
                            )}
                        </div>
                    </div>
                    {field('Headers (JSON, Optional)', inputWrap(
                        <CodeEditor
                            value={action.headers || ''}
                            onChange={(v) => onUpdate(action.id, { headers: v })}
                            onBlur={() => onAutoSave()}
                            language="json"
                            variables={variables}
                            className="min-h-[56px]"
                            placeholder={'{"Authorization": "Bearer {$token}"}'}
                        />
                    ))}
                    {bodyMethods.includes(httpMethod) && field('Body', inputWrap(
                        <CodeEditor
                            value={action.body || ''}
                            onChange={(v) => onUpdate(action.id, { body: v })}
                            onBlur={() => onAutoSave()}
                            language="json"
                            variables={variables}
                            className="min-h-[80px]"
                            placeholder={'{"key": "value"}'}
                        />
                    ))}
                    {field('Store Response In Variable (Optional)', inputWrap(
                        <RichInput
                            value={action.varName || ''}
                            onChange={(v) => onUpdate(action.id, { varName: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="apiResponse"
                        />
                    ))}
                </>}

                {/* Get Content */}
                {action.type === 'get_content' && <>
                    {field('Selector (Optional)', inputWrap(
                        <RichInput
                            value={action.selector || ''}
                            onChange={(v) => onUpdate(action.id, { selector: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder=".article-body or leave empty for full page"
                        />
                    ))}
                    {field('Store In Variable (Optional)', inputWrap(
                        <RichInput
                            value={action.varName || ''}
                            onChange={(v) => onUpdate(action.id, { varName: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="pageContent"
                        />
                    ))}
                </>}
            </div>
        );
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div
                className="glass-card w-full max-w-lg rounded-[28px] border border-white/10 p-7 shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-10 max-h-[85vh]"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between shrink-0">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.4em] text-gray-500">{label}</p>
                        <p className="text-xs text-gray-400 mt-1">Configure this block.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-white/40 hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-xl"
                        aria-label="Close"
                        title="Close"
                    >
                        <MaterialIcon name="close" className="text-base" />
                    </button>
                </div>

                <div className="overflow-y-auto custom-scrollbar pr-1">
                    {renderForm()}
                </div>

                <button
                    onClick={onClose}
                    className="shrink-0 w-full py-3 rounded-2xl bg-white text-black text-xs font-bold uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    Done
                </button>
            </div>
        </div>,
        document.body
    );
};

export default ActionConfigModal;
