import { ReactNode, useMemo } from 'react';
import { Action, BlockTestResult, Variable } from '../../types';
import MaterialIcon from '../MaterialIcon';
import ConfigVariableList from './ConfigVariableList';
import { isBlockStartAction } from '../../utils/actionBlocks';

interface InputEntry { key: string; label: string; raw: unknown; resolved: unknown }
interface BlockConfigWorkspaceProps {
    configuration: ReactNode;
    action: Action;
    actions: Action[];
    variables: Record<string, Variable>;
    canInsertVariable: boolean;
    isTesting: boolean;
    testError: string | null;
    testResult?: BlockTestResult;
    onInsertVariable: (name: string) => void;
    onRunTest: () => void;
    onStopTest: () => void;
}

const inputLabels: Partial<Record<keyof Action, string>> = {
    selector: 'Selector', value: 'Value', key: 'Key', conditionVar: 'Variable',
    conditionVarType: 'Variable type', conditionOp: 'Relation', conditionValue: 'Comparison value',
    typeMode: 'Typing mode', method: 'Method', headers: 'Headers', body: 'Body',
    timeout: 'Timeout', captchaType: 'Captcha type',
};
const inputKeys = Object.keys(inputLabels) as (keyof Action)[];

const resolveValue = (value: unknown, variables: Record<string, Variable>) => {
    if (typeof value !== 'string' || !value.includes('{$')) return value;
    return value.replace(/\{\$([\w.]+)\}/g, (_match, name) => {
        if (name === 'now') return new Date().toISOString();
        const resolved = variables[name]?.value;
        if (resolved === undefined || resolved === null) return '';
        if (typeof resolved === 'object') {
            try { return JSON.stringify(resolved); } catch { return String(resolved); }
        }
        return String(resolved);
    });
};

export const getActionInputEntries = (action: Action, variables: Record<string, Variable>): InputEntry[] => {
    const entries: InputEntry[] = [];
    for (const key of inputKeys) {
        const raw = action[key];
        if (raw === undefined || raw === null || raw === '') continue;
        entries.push({ key, label: inputLabels[key] || key, raw, resolved: resolveValue(raw, variables) });
    }
    return entries;
};

export const getExpectedOutput = (action: Action) => {
    switch (action.type) {
        case 'javascript': return 'The value returned by the script.';
        case 'csv': return 'An array of parsed CSV row objects.';
        case 'merge': return 'The merged source value.';
        case 'if':
        case 'while': return 'A boolean condition result.';
        case 'repeat': return 'The current remaining iteration count.';
        case 'foreach': return 'The current collection item.';
        case 'http_request': return 'The parsed response body.';
        case 'get_content': return 'The selected element or page content.';
        case 'solve_captcha': return 'Captcha solve details.';
        case 'wait_captcha': return 'Captcha readiness details.';
        case 'set': return 'The value assigned to the variable.';
        default: return 'This block has no direct output value.';
    }
};

const formatValue = (value: unknown) => {
    if (value === undefined) return 'No value';
    if (typeof value === 'string') return value || 'Empty string';
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};
const statusTone: Record<BlockTestResult['status'], string> = {
    success: 'text-green-500', error: 'text-red-500', skipped: 'text-amber-500',
    stopped: 'text-amber-500', not_reached: 'text-[var(--app-text-muted)]',
};

const BlockConfigWorkspace: React.FC<BlockConfigWorkspaceProps> = ({
    configuration, action, actions, variables, canInsertVariable, isTesting, testError,
    testResult, onInsertVariable, onRunTest, onStopTest,
}) => {
    const inputEntries = getActionInputEntries(action, variables);
    const loopVariablesAvailable = useMemo(() => {
        const actionIndex = actions.findIndex((candidate) => candidate.id === action.id);
        if (actionIndex < 1) return false;
        const stack: Action['type'][] = [];
        for (let index = 0; index < actionIndex; index++) {
            const type = actions[index].type;
            if (isBlockStartAction(type)) stack.push(type);
            else if (type === 'end') stack.pop();
        }
        return stack.includes('foreach');
    }, [action.id, actions]);
    const changedVariables = useMemo(() => {
        if (!testResult) return [];
        return Object.entries(testResult.variables || {}).filter(([name, value]) => (
            name !== 'block.output' && !Object.is(variables[name]?.value, value)
        ));
    }, [testResult, variables]);

    return (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)] lg:gap-8">
            <div className="min-w-0 space-y-6">
                {configuration}
                <section className="rounded-2xl border theme-border bg-[var(--app-surface-2)] p-4">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                        <MaterialIcon name="input" className="text-sm" /> Inputs
                    </div>
                    <div className="mt-3 space-y-2">
                        {inputEntries.map((entry) => {
                            const tested = Boolean(testResult) && Object.prototype.hasOwnProperty.call(testResult?.resolvedInputs || {}, entry.key);
                            const resolved = tested ? testResult?.resolvedInputs[entry.key] : entry.resolved;
                            return (
                                <div key={entry.key} className="rounded-xl bg-[var(--app-input)] px-3 py-2">
                                    <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-faint)]">{entry.label}</div>
                                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-[var(--app-text)]">{formatValue(resolved)}</pre>
                                    {!Object.is(entry.raw, resolved) && <div className="mt-1 truncate font-mono text-[10px] text-[var(--app-text-faint)]">Raw: {formatValue(entry.raw)}</div>}
                                </div>
                            );
                        })}
                        {inputEntries.length === 0 && <p className="text-xs text-[var(--app-text-faint)]">No configurable inputs.</p>}
                    </div>
                    <div className="mt-4 border-t theme-border pt-4">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                            <MaterialIcon name="output" className="text-sm" /> Output
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--app-text-muted)]">{getExpectedOutput(action)}</p>
                        {action.varName && <p className="mt-2 font-mono text-[11px] text-blue-500">Stores in {action.varName}</p>}
                    </div>
                </section>
            </div>

            <aside className="min-w-0 space-y-5" aria-label="Block context">
                <ConfigVariableList variables={variables} canInsertVariable={canInsertVariable} loopVariablesAvailable={loopVariablesAvailable} onInsertVariable={onInsertVariable} />
                <section className="rounded-2xl border theme-border bg-[var(--app-surface-2)] p-4" aria-live="polite">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                            <MaterialIcon name="science" className="text-sm" /> Test block
                        </div>
                        {testResult && <span className={`text-[10px] font-bold uppercase tracking-wider ${statusTone[testResult.status]}`}>{testResult.status.replace('_', ' ')}</span>}
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-[var(--app-text-faint)]">Runs preceding blocks in a temporary browser. Actions may affect the target site.</p>
                    <button
                        type="button"
                        onClick={isTesting ? onStopTest : onRunTest}
                        aria-busy={isTesting}
                        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${isTesting ? 'border border-red-400/30 bg-red-500/10 text-red-500 hover:bg-red-500/15' : 'theme-accent-bg hover:opacity-90'}`}
                    >
                        <MaterialIcon name={isTesting ? 'stop' : 'play_arrow'} className={isTesting ? 'text-sm' : 'text-base'} />
                        {isTesting ? 'Stop test' : 'Run through block'}
                    </button>
                    {testError && <p className="mt-3 text-xs leading-5 text-red-500">{testError}</p>}
                    {testResult?.status === 'error' && testResult.error && <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/[0.08] px-3 py-2 text-xs leading-5 text-red-500">{testResult.error}</p>}
                    {testResult && (
                        <div className="mt-4 space-y-3 border-t theme-border pt-4">
                            <div className="flex items-center justify-between text-[10px] text-[var(--app-text-faint)]"><span>Latest result</span><span>{testResult.durationMs}ms</span></div>
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--app-code-bg)] p-3 font-mono text-[11px] leading-5 text-[var(--app-code-text)] custom-scrollbar">{formatValue(testResult.output)}</pre>
                            {changedVariables.length > 0 && (
                                <div>
                                    <div className="text-[10px] uppercase tracking-wider text-[var(--app-text-faint)]">Changed variables</div>
                                    <div className="mt-2 space-y-1">{changedVariables.map(([name, value]) => <div key={name} className="flex gap-2 font-mono text-[10px] text-[var(--app-text-muted)]"><span className="text-blue-500">{name}</span><span className="min-w-0 flex-1 truncate text-right">{formatValue(value)}</span></div>)}</div>
                                </div>
                            )}
                            {testResult.screenshotUrl && <img src={testResult.screenshotUrl} alt="Page after the block test" className="w-full rounded-xl border theme-border object-cover" />}
                            {testResult.logs.length > 0 && <details className="text-xs text-[var(--app-text-muted)]"><summary className="cursor-pointer select-none">Execution logs</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-[var(--app-code-bg)] p-3 font-mono text-[10px] leading-4 custom-scrollbar">{testResult.logs.join('\n')}</pre></details>}
                        </div>
                    )}
                </section>
            </aside>
        </div>
    );
};

export default BlockConfigWorkspace;
