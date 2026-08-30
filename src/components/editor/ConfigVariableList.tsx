import { Variable } from '../../types';
import MaterialIcon from '../MaterialIcon';

interface ConfigVariableListProps {
    variables: Record<string, Variable>;
    canInsertVariable?: boolean;
    onInsertVariable?: (name: string) => void;
}

const variableTypeIcon: Record<Variable['type'], string> = {
    string: 'text_fields',
    number: 'numbers',
    boolean: 'toggle_on',
    selector: 'ads_click',
};

const formatValue = (value: unknown) => {
    if (value === undefined) return 'No value';
    if (typeof value === 'string') return value || 'Empty string';
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
};

const ConfigVariableList: React.FC<ConfigVariableListProps> = ({
    variables,
    canInsertVariable = false,
    onInsertVariable,
}) => {
    const entries = Object.entries(variables || {});

    return (
        <section className="rounded-2xl border theme-border bg-[var(--app-surface-2)] p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                    <MaterialIcon name="data_object" className="text-sm" />
                    Variables
                </div>
                <span className="text-[10px] text-[var(--app-text-faint)]">{entries.length}</span>
            </div>
            <p className="mt-2 text-[10px] text-[var(--app-text-faint)]">
                {canInsertVariable ? 'Click or drag a variable into a field.' : 'Drag a variable, or focus a field before clicking.'}
            </p>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {entries.map(([name, variable]) => (
                    <div key={name} className="flex w-full items-start gap-3">
                        <button
                            type="button"
                            draggable
                            aria-disabled={!canInsertVariable}
                            onClick={() => { if (canInsertVariable) onInsertVariable?.(name); }}
                            onDragStart={(event) => {
                                const token = `{$${name}}`;
                                event.dataTransfer.effectAllowed = 'copy';
                                event.dataTransfer.setData('text/plain', token);
                                event.dataTransfer.setData('application/x-figranium-variable', token);
                            }}
                            className={`inline-flex max-w-[58%] shrink-0 cursor-grab overflow-hidden rounded-lg border theme-border bg-[var(--app-input)] text-left active:cursor-grabbing ${canInsertVariable ? '' : 'opacity-75'}`}
                            title={canInsertVariable ? `Insert {$${name}}` : `Drag {$${name}} into a field`}
                        >
                            <span className="flex w-8 shrink-0 items-center justify-center border-r theme-border text-[var(--app-text-muted)]">
                                <MaterialIcon name={variableTypeIcon[variable.type]} className="text-sm" />
                            </span>
                            <span className="truncate px-3 py-2 font-mono text-xs text-[var(--app-text)]">{name}</span>
                        </button>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words pt-1.5 text-xs leading-5 text-[var(--app-text-muted)]">
                            {formatValue(variable.value)}
                        </span>
                    </div>
                ))}
                {entries.length === 0 && (
                    <p className="py-4 text-center text-xs text-[var(--app-text-faint)]">No variables defined</p>
                )}
            </div>
        </section>
    );
};

export default ConfigVariableList;
