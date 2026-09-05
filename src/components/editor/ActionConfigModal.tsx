import { useCallback, useEffect, useRef, useState } from 'react';
import { Action, BlockTestResult, Task, Variable, VarType } from '../../types';
import MaterialIcon from '../MaterialIcon';
import RichInput from '../RichInput';
import CodeEditor from '../CodeEditor';
import { ACTION_CATALOG } from './actionCatalog';
import CustomSelect, { CustomCombobox } from '../common/CustomSelect';
import BlockConfigWorkspace from './BlockConfigWorkspace';
import ConfigModalShell from './ConfigModalShell';
import useVariableInsertion from './useVariableInsertion';

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
] as const;

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
    task: Task;
    variables: Record<string, Variable>;
    availableTasks: Task[];
    selectorOptions?: string[];
    onUpdate: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    onAutoSave: () => void;
    onClose: () => void;
    onStartInspect?: (id: string) => void;
    onCreateVariable?: (name: string) => void;
    onDeleteVariable?: (name: string) => void;
    testResult?: BlockTestResult;
    onTestResult: (result: BlockTestResult) => void;
}

const ActionConfigModal: React.FC<ActionConfigModalProps> = ({
    action,
    task,
    variables,
    availableTasks,
    selectorOptions,
    onUpdate,
    onAutoSave,
    onClose,
    onStartInspect,
    onCreateVariable,
    onDeleteVariable,
    testResult,
    onTestResult,
}) => {
    const catalogItem = ACTION_CATALOG.find((i) => i.type === action.type);
    const label = catalogItem?.label || action.type;
    const [isTesting, setIsTesting] = useState(false);
    const [testError, setTestError] = useState<string | null>(null);
    const { canInsertVariable, captureInsertionSelection, insertVariable } = useVariableInsertion();
    const testAbortRef = useRef<AbortController | null>(null);
    const testRunIdRef = useRef<string | null>(null);
    const testStartedAtRef = useRef(0);

    const [showAiPrompt, setShowAiPrompt] = useState(false);
    const [aiDescription, setAiDescription] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [cabinets, setCabinets] = useState<{ id: string; name: string }[]>([]);
    useEffect(() => {
        if (action.type !== 'upload') return;
        fetch('/api/cabinets').then(r => r.ok ? r.json() : null).then(data => {
            if (data?.cabinets) setCabinets(data.cabinets);
        }).catch(() => undefined);
    }, [action.type]);

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
    const stopTest = useCallback((recordStoppedResult = true) => {
        const runId = testRunIdRef.current;
        if (runId) {
            fetch('/api/executions/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ runId }),
            }).catch(() => undefined);
        }
        testAbortRef.current?.abort();
        testAbortRef.current = null;
        testRunIdRef.current = null;
        setIsTesting(false);
        if (recordStoppedResult && testStartedAtRef.current) {
            onTestResult({
                actionId: action.id,
                status: 'stopped',
                durationMs: Date.now() - testStartedAtRef.current,
                resolvedInputs: {},
                variables: Object.fromEntries(Object.entries(variables).map(([name, definition]) => [name, definition.value])),
                logs: ['Block test stopped by user.'],
                screenshotUrl: null,
                timestamp: Date.now(),
            });
        }
    }, [action.id, onTestResult, variables]);

    const runTest = useCallback(async () => {
        if (isTesting) return;
        const runId = `block_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const controller = new AbortController();
        const runtimeVariables = Object.fromEntries(
            Object.entries(variables).map(([name, definition]) => [name, definition.value])
        );
        testAbortRef.current = controller;
        testRunIdRef.current = runId;
        testStartedAtRef.current = Date.now();
        setIsTesting(true);
        setTestError(null);
        onAutoSave();

        try {
            const response = await fetch('/api/tasks/test-action', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskSnapshot: task, targetActionId: action.id, variables: runtimeVariables, runId }),
                signal: controller.signal,
            });
            if (response.redirected && new URL(response.url).pathname === '/login') {
                throw new Error('Your session expired. Sign in again, then retry the block test.');
            }
            const isJson = response.headers.get('content-type')?.includes('application/json');
            if (!isJson) {
                if (response.status === 404) {
                    throw new Error('The block-test endpoint is unavailable. Restart the backend and refresh this page.');
                }
                throw new Error(`The block-test endpoint returned an unexpected response (${response.status}).`);
            }
            const data = await response.json();
            if (!response.ok) throw new Error(data.details || data.error || 'Block test failed');
            onTestResult({
                actionId: action.id,
                status: data.status || 'not_reached',
                durationMs: Number(data.durationMs) || 0,
                resolvedInputs: data.resolvedInputs || {},
                output: data.output,
                error: data.errorMessage,
                variables: data.variables || {},
                logs: Array.isArray(data.logs) ? data.logs : [],
                screenshotUrl: data.screenshotUrl || null,
                timestamp: Number(data.timestamp) || Date.now(),
            });
        } catch (error: any) {
            if (error?.name !== 'AbortError') setTestError(error?.message || 'Block test failed');
        } finally {
            if (testAbortRef.current === controller) {
                testAbortRef.current = null;
                testRunIdRef.current = null;
                setIsTesting(false);
            }
        }
    }, [action.id, isTesting, onAutoSave, onTestResult, task, variables]);

    const handleClose = useCallback(() => {
        if (testAbortRef.current) stopTest(false);
        onClose();
    }, [onClose, stopTest]);

    const stopTestRef = useRef(stopTest);
    stopTestRef.current = stopTest;

    useEffect(() => () => {
        if (testAbortRef.current) stopTestRef.current(false);
    }, []);

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
        const useTwoColumnLayout = ['type', 'scroll', 'foreach', 'set', 'merge', 'solve_captcha', 'upload'].includes(action.type);

        return (
            <div className={useTwoColumnLayout
                ? 'grid grid-cols-1 content-start items-start gap-x-8 gap-y-10 md:grid-cols-2'
                : 'space-y-10'}>
                {/* Selector field */}
                {(action.type === 'click' || action.type === 'type' || action.type === 'hover' || action.type === 'wait_selector' || action.type === 'scroll' || action.type === 'upload') && (
                    field(action.type === 'scroll' ? 'Selector (Optional)' : 'Selector',
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 text-xs focus-within:border-white/20 transition-all flex items-center gap-2">
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                                <RichInput
                                    value={action.selector || ''}
                                    onChange={(v) => onUpdate(action.id, { selector: v })}
                                    onBlur={() => onAutoSave()}
                                    variables={variables}
                                    placeholder={action.type === 'scroll' ? '.scroll-container or leave empty' : action.type === 'upload' ? 'input[type=file] or .drop-zone' : '.btn-primary'}
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
                                    onClick={() => { handleClose(); onStartInspect(action.id); }}
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

                {action.type === 'upload' && <>
                    {field('Cabinet', <CustomSelect
                        value={action.cabinetId || ''}
                        onChange={(cabinetId) => onUpdate(action.id, { cabinetId }, true)}
                        options={cabinets.length ? [{ value: '', label: 'Default cabinet' }, ...cabinets.map(c => ({ value: c.id, label: c.name, icon: 'inventory_2' }))] : [{ value: '', label: 'Loading cabinets…', disabled: true }]}
                        ariaLabel="Upload cabinet"
                    />)}
                    {field('Mark as uploaded', <label className="flex items-center gap-2 text-xs text-white/80"><input type="checkbox" checked={!!action.markAsUploaded} onChange={(e) => onUpdate(action.id, { markAsUploaded: e.target.checked }, true)} className="h-4 w-4" /> Mark after the page accepts this item</label>)}
                </>}

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
                        <CustomSelect
                            value={action.typeMode || 'replace'}
                            onChange={(value) => onUpdate(action.id, { typeMode: value }, true)}
                            options={TYPE_MODE_OPTIONS}
                            className="!min-h-0 !border-0 !bg-transparent !p-0"
                            ariaLabel="Typing mode"
                        />
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
                            <CustomSelect
                                value={baseKey}
                                onChange={(value) => onUpdate(action.id, { key: buildPressKey(modifiers, value) }, true)}
                                options={[{ value: '', label: 'Select key' }, ...PRESS_BASE_KEYS.map((key) => ({ value: key, label: key }))]}
                                className="!min-h-0 !border-0 !bg-transparent !p-0"
                                ariaLabel="Press key"
                            />
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
                                                onClick={() => { handleClose(); onStartInspect(action.id); }}
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
                                    <div className="w-full bg-white/[0.05] border border-white/10 rounded-lg px-3 py-2 focus-within:border-white/30">
                                        <CustomCombobox
                                            value={action.conditionVar || ''}
                                            onChange={(value) => onUpdate(action.id, { conditionVar: value })}
                                            options={varKeys}
                                            placeholder="variable name"
                                            ariaLabel="Condition variable"
                                        />
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Type</span>
                                <CustomSelect
                                    value={condVarType}
                                    onChange={(nextType) => {
                                        const nextOps = conditionOps[nextType] || conditionOps.string;
                                        onUpdate(action.id, {
                                            conditionVarType: nextType,
                                            conditionOp: nextOps[0].value,
                                            conditionValue: (nextType === 'boolean' || nextType === 'selector') ? '' : action.conditionValue || ''
                                        }, true);
                                    }}
                                    options={[
                                        { value: 'string' as VarType, label: 'String', icon: 'text_fields' },
                                        { value: 'number' as VarType, label: 'Number', icon: 'numbers' },
                                        { value: 'boolean' as VarType, label: 'Boolean', icon: 'toggle_on' },
                                        { value: 'selector' as VarType, label: 'Selector', icon: 'ads_click' },
                                    ]}
                                    ariaLabel="Condition variable type"
                                />
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Relation</span>
                                <CustomSelect
                                    value={opValue}
                                    onChange={(value) => onUpdate(action.id, { conditionOp: value }, true)}
                                    options={ops}
                                    ariaLabel="Condition relation"
                                />
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
                                    data-variable-insertion-target={condVarType === 'number' ? undefined : 'true'}
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
                            allowVariableInsertion={false}
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
                            allowVariableInsertion={false}
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
                            allowVariableInsertion={false}
                            placeholder="allItems"
                        />
                    ))}
                </>}

                {/* Stop */}
                {action.type === 'stop' && field('Outcome',
                    <CustomSelect
                        value={action.value || 'success'}
                        onChange={(value) => onUpdate(action.id, { value }, true)}
                        options={[
                            { value: 'success', label: 'Success', icon: 'check_circle', iconClassName: 'text-green-400' },
                            { value: 'error', label: 'Error', icon: 'error', iconClassName: 'text-red-400' },
                        ]}
                        ariaLabel="Stop outcome"
                    />
                )}

                {/* Start Task */}
                {action.type === 'start' && field('Task',
                    <CustomSelect
                        value={action.value || ''}
                        onChange={(value) => onUpdate(action.id, { value }, true)}
                        options={availableTasks.length
                            ? [{ value: '', label: 'Select task', disabled: true }, ...availableTasks.map((task) => ({ value: task.id || '', label: task.name || task.id || 'Untitled' }))]
                            : [{ value: '', label: 'No other tasks', disabled: true }]}
                        placeholder="Select task"
                        ariaLabel="Task to start"
                    />
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
                            <CustomSelect
                                value={httpMethod}
                                onChange={(value) => onUpdate(action.id, { method: value }, true)}
                                options={[
                                    { value: 'GET', label: 'GET', icon: 'download' },
                                    { value: 'POST', label: 'POST', icon: 'upload' },
                                    { value: 'PUT', label: 'PUT', icon: 'published_with_changes' },
                                    { value: 'PATCH', label: 'PATCH', icon: 'edit' },
                                    { value: 'DELETE', label: 'DELETE', icon: 'delete', iconClassName: 'text-red-400' },
                                ]}
                                ariaLabel="HTTP method"
                            />
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
                            allowVariableInsertion={false}
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
                            allowVariableInsertion={false}
                            placeholder="pageContent"
                        />
                    ))}
                </>}

                {/* Solve / Wait for Captcha */}
                {(action.type === 'solve_captcha' || action.type === 'wait_captcha') && <>
                    {action.type === 'wait_captcha' && (
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Waits until the captcha control is initialized, visible, enabled, and stable. This block does not click or solve it.
                        </p>
                    )}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Captcha Type (Optional)</label>
                        <CustomSelect
                            value={action.captchaType || ''}
                            onChange={(value) => onUpdate(action.id, { captchaType: (value || undefined) as Action['captchaType'] }, true)}
                            options={[
                                { value: '', label: 'Auto-detect', icon: 'search' },
                                { value: 'recaptcha_v2', label: 'reCAPTCHA v2', iconUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=64', iconImageClassName: 'grayscale opacity-70' },
                                { value: 'recaptcha_v3', label: 'reCAPTCHA v3', iconUrl: 'https://www.google.com/s2/favicons?domain=google.com&sz=64', iconImageClassName: 'grayscale opacity-70' },
                                { value: 'hcaptcha', label: 'hCaptcha', iconUrl: 'https://www.google.com/s2/favicons?domain=hcaptcha.com&sz=64', iconImageClassName: 'grayscale opacity-70' },
                                { value: 'turnstile', label: 'Cloudflare Turnstile', iconUrl: 'https://www.google.com/s2/favicons?domain=cloudflare.com&sz=64', iconImageClassName: 'grayscale opacity-70' },
                            ]}
                            ariaLabel="Captcha type"
                        />
                    </div>
                    {field('Container Selector (Optional)', inputWrap(
                        <RichInput
                            value={action.selector || ''}
                            onChange={(v) => onUpdate(action.id, { selector: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            placeholder="#recaptcha-container or leave empty for full page"
                        />
                    ))}
                    {field('Timeout (Seconds)', inputWrap(
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={Math.max(1, Math.round((action.timeout || 120000) / 1000))}
                            onChange={(e) => onUpdate(action.id, { timeout: Math.max(1, Number(e.target.value) || 120) * 1000 })}
                            onBlur={() => onAutoSave()}
                            className="w-full bg-transparent border-none px-0 py-0 text-xs text-white focus:outline-none"
                        />
                    ))}
                    {field('Store Result In Variable (Optional)', inputWrap(
                        <RichInput
                            value={action.varName || ''}
                            onChange={(v) => onUpdate(action.id, { varName: v })}
                            onBlur={() => onAutoSave()}
                            variables={variables}
                            allowVariableInsertion={false}
                            placeholder="captchaResult"
                        />
                    ))}
                </>}
            </div>
        );
    };

    return (
        <ConfigModalShell icon={catalogItem?.icon || 'tune'} title={label} onClose={handleClose}>
            <BlockConfigWorkspace
                configuration={(
                    <div
                            className="min-w-0"
                            onFocusCapture={(event) => captureInsertionSelection(event.target)}
                            onSelectCapture={(event) => captureInsertionSelection(event.target)}
                            onKeyUpCapture={(event) => captureInsertionSelection(event.target)}
                            onPointerUpCapture={(event) => captureInsertionSelection(event.target)}
                    >
                        {renderForm()}
                    </div>
                )}
                action={action}
                variables={variables}
                canInsertVariable={canInsertVariable}
                isTesting={isTesting}
                testError={testError}
                testResult={testResult}
                onInsertVariable={insertVariable}
                onRunTest={runTest}
                onStopTest={() => stopTest(true)}
            />
        </ConfigModalShell>
    );
};

export default ActionConfigModal;
