import { useState } from 'react';
import { Variable } from '../../types';
import MaterialIcon from '../MaterialIcon';
import { BLOCK_OUTPUT_VARIABLE, MORE_RESERVED_VARIABLES, ReservedVariableDefinition } from '../../utils/reservedVariables';

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
    const [activeTab, setActiveTab] = useState<'variables' | 'more'>('variables');
    const insertOrDragProps = (name: string) => ({
        draggable: true,
        'aria-disabled': !canInsertVariable,
        onClick: () => { if (canInsertVariable) onInsertVariable?.(name); },
        onDragStart: (event: React.DragEvent<HTMLButtonElement>) => {
            const token = `{$${name}}`;
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData('text/plain', token);
            event.dataTransfer.setData('application/x-figranium-variable', token);
        },
    });
    const reservedVariableRow = (variable: ReservedVariableDefinition) => (
        <div key={variable.name} className="flex w-full items-start gap-3">
            <button
                type="button"
                {...insertOrDragProps(variable.name)}
                className={`inline-flex max-w-[58%] shrink-0 cursor-grab overflow-hidden rounded-lg border theme-border bg-[var(--app-input)] text-left active:cursor-grabbing ${canInsertVariable ? '' : 'opacity-75'}`}
                title={canInsertVariable ? `Insert {$${variable.name}}` : `Drag {$${variable.name}} into a field`}
            >
                <span className="flex w-8 shrink-0 items-center justify-center border-r theme-border text-[var(--app-text-muted)]">
                    <MaterialIcon name={variable.icon} className="text-sm" />
                </span>
                <span className="truncate px-3 py-2 font-mono text-xs text-[var(--app-text)]">{variable.name}</span>
            </button>
            <span className="min-w-0 flex-1 pt-1.5 text-xs leading-5 text-[var(--app-text-muted)]">{variable.description}</span>
        </div>
    );

    return (
        <section className="rounded-2xl border theme-border bg-[var(--app-surface-2)] p-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--app-text-muted)]">
                    <MaterialIcon name="data_object" className="text-sm" />
                    Variables
                </div>
                <span className="text-[10px] text-[var(--app-text-faint)]">{entries.length}</span>
            </div>
            <div className="mt-3 flex gap-1 border-b theme-border" role="tablist" aria-label="Variable categories">
                <button type="button" role="tab" aria-selected={activeTab === 'variables'} onClick={() => setActiveTab('variables')} className={`border-b-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${activeTab === 'variables' ? 'border-blue-500 text-blue-500' : 'border-transparent text-[var(--app-text-faint)]'}`}>Variables</button>
                <button type="button" role="tab" aria-selected={activeTab === 'more'} onClick={() => setActiveTab('more')} className={`border-b-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider ${activeTab === 'more' ? 'border-blue-500 text-blue-500' : 'border-transparent text-[var(--app-text-faint)]'}`}>More</button>
            </div>
            <p className="mt-2 text-[10px] text-[var(--app-text-faint)]">
                {canInsertVariable ? 'Click or drag a variable into a field.' : 'Drag a variable, or focus a field before clicking.'}
            </p>
            <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1 custom-scrollbar">
                {activeTab === 'variables' && entries.map(([name, variable]) => (
                    <div key={name} className="flex w-full items-start gap-3">
                        <button
                            type="button"
                            {...insertOrDragProps(name)}
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
                {activeTab === 'variables' && reservedVariableRow(BLOCK_OUTPUT_VARIABLE)}
                {activeTab === 'variables' && entries.length === 0 && (
                    <p className="py-4 text-center text-xs text-[var(--app-text-faint)]">No task variables defined</p>
                )}
                {activeTab === 'more' && MORE_RESERVED_VARIABLES.map(reservedVariableRow)}
            </div>
        </section>
    );
};

export default ConfigVariableList;
