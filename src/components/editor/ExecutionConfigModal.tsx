import { Task } from '../../types';
import MaterialIcon from '../MaterialIcon';
import RichInput from '../RichInput';
import ConfigModalShell from './ConfigModalShell';
import ConfigVariableList from './ConfigVariableList';
import useVariableInsertion from './useVariableInsertion';

interface ExecutionConfigModalProps {
    task: Task;
    onUpdate: (updates: Partial<Task>, saveImmediately?: boolean) => void;
    onClose: () => void;
}

const modeOptions = [
    { mode: 'agent' as const, icon: 'smart_toy', label: 'Agent Mode', description: 'Custom action sequence with logic' },
    { mode: 'scrape' as const, icon: 'api', label: 'Scrape Mode', description: 'Fixed data extraction flow' },
];

const ExecutionConfigModal: React.FC<ExecutionConfigModalProps> = ({ task, onUpdate, onClose }) => {
    const { canInsertVariable, captureInsertionSelection, insertVariable } = useVariableInsertion();

    return (
        <ConfigModalShell icon="bolt" title="On Execution" onClose={onClose}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)] lg:gap-8">
                <div
                    className="min-w-0 space-y-8"
                    onFocusCapture={(event) => captureInsertionSelection(event.target)}
                    onSelectCapture={(event) => captureInsertionSelection(event.target)}
                    onKeyUpCapture={(event) => captureInsertionSelection(event.target)}
                    onPointerUpCapture={(event) => captureInsertionSelection(event.target)}
                >
                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">URL</label>
                        <div className="rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm transition-colors focus-within:border-[var(--app-border-strong)]">
                            <RichInput
                                value={task.url}
                                onChange={(url) => onUpdate({ url })}
                                onBlur={() => onUpdate({}, true)}
                                variables={task.variables}
                                placeholder="https://..."
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Wait (seconds)</label>
                        <input
                            type="number"
                            min="0"
                            value={task.wait}
                            onChange={(event) => onUpdate({ wait: Number(event.target.value) || 0 })}
                            onBlur={() => onUpdate({}, true)}
                            className="w-full rounded-xl border theme-border bg-[var(--app-input)] px-4 py-3 text-sm text-[var(--app-text)] transition-colors focus:border-[var(--app-border-strong)] focus:outline-none"
                        />
                    </div>

                    <div className="space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">Execution mode</label>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {modeOptions.map((option) => {
                                const selected = task.mode === option.mode;
                                return (
                                    <button
                                        key={option.mode}
                                        type="button"
                                        onClick={() => onUpdate({ mode: option.mode }, true)}
                                        aria-pressed={selected}
                                        className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-border-strong)] ${selected ? 'border-[var(--app-border-strong)] bg-[var(--app-surface-2)] ring-1 ring-[var(--app-border-strong)]' : 'theme-border bg-[var(--app-surface-3)] opacity-70 hover:opacity-100'}`}
                                    >
                                        <MaterialIcon name={option.icon} className="mt-0.5 text-lg text-[var(--app-text-muted)]" />
                                        <span>
                                            <span className="block text-xs font-bold text-[var(--app-text)]">{option.label}</span>
                                            <span className="mt-1 block text-xs leading-5 text-[var(--app-text-faint)]">{option.description}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <aside className="min-w-0" aria-label="Execution context">
                    <ConfigVariableList variables={task.variables} canInsertVariable={canInsertVariable} onInsertVariable={insertVariable} />
                </aside>
            </div>
        </ConfigModalShell>
    );
};

export default ExecutionConfigModal;
