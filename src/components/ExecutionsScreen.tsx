import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import MaterialIcon from './MaterialIcon';
import { Execution, ConfirmRequest } from '../types';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { normalizeTaskOutcome, taskOutcomeBadgeClass, taskOutcomeLabel } from '../utils/taskOutcome';

const EXECUTION_ITEM_SIZE = 94;
const EXECUTION_LIST_MAX_VISIBLE = 7;
const EXECUTION_OVERSCAN = 4;

interface ExecutionListItemData {
    items: Execution[];
    deleteExecution: (id: string) => void;
    navigate: NavigateFunction;
}

const renderExecutionRow = ({ index, style, data }: ListChildComponentProps<ExecutionListItemData>) => {
    const execution = data.items[index];
    if (!execution) return null;
    const outcome = normalizeTaskOutcome(execution.outcome, execution.status);

    return (
        <div style={style}>
            <div
                onClick={() => data.navigate(`/executions/${execution.id}`)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        data.navigate(`/executions/${execution.id}`);
                    }
                }}
                role="button"
                tabIndex={0}
                className="app-list-row h-full grid grid-cols-[minmax(240px,1.5fr)_110px_120px_120px_44px] items-center gap-4 px-5 max-lg:grid-cols-[minmax(220px,1fr)_110px_44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl border theme-border theme-input flex items-center justify-center shrink-0">
                        <MaterialIcon name={execution.source === 'api' ? 'cloud' : 'monitor'} className="text-lg theme-text-faint" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-xs font-bold theme-text truncate">{execution.taskName || execution.mode}</div>
                        <div className="mt-1 text-[10px] theme-text-faint font-mono truncate">{execution.url || new Date(execution.timestamp).toLocaleString()}</div>
                    </div>
                </div>
                <div><span className={`app-badge ${taskOutcomeBadgeClass(outcome)}`}>{taskOutcomeLabel(outcome)}</span></div>
                <div className="text-[11px] theme-text-muted max-lg:hidden"><span className="uppercase">{execution.source}</span> · {execution.mode}</div>
                <div className="max-lg:hidden">
                    <div className="text-[11px] theme-text-muted">{execution.durationMs}ms</div>
                    <div className="mt-1 text-[10px] theme-text-faint">{new Date(execution.timestamp).toLocaleString()}</div>
                </div>
                <button
                    onClick={(event) => { event.stopPropagation(); data.deleteExecution(execution.id); }}
                    className="app-button-icon hover:!text-red-400 hover:!border-red-500/30 hover:!bg-red-500/10"
                    aria-label={`Delete execution ${execution.id}`}
                    title="Delete execution"
                >
                    <MaterialIcon name="delete" className="text-base" />
                </button>
            </div>
        </div>
    );
};

interface ExecutionsScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const ExecutionsScreen: React.FC<ExecutionsScreenProps> = ({ onConfirm, onNotify }) => {
    const navigate = useNavigate();
    const [executions, setExecutions] = useState<Execution[]>([]);
    const [filter, setFilter] = useState<'all' | 'editor' | 'api'>('all');
    const [loading, setLoading] = useState(false);

    const loadExecutions = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/executions');
            if (!response.ok) throw new Error('Failed to load');
            const data = await response.json();
            setExecutions(Array.isArray(data.executions) ? data.executions : []);
        } catch {
            setExecutions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearExecutions = useCallback(async () => {
        if (!await onConfirm('Clear all executions?')) return;
        const response = await fetch('/api/executions/clear', { method: 'POST' });
        if (response.ok) {
            onNotify('Executions cleared.', 'success');
            loadExecutions();
        } else onNotify('Clear failed.', 'error');
    }, [loadExecutions, onConfirm, onNotify]);

    const deleteExecution = useCallback(async (id: string) => {
        if (!await onConfirm('Delete this execution?')) return;
        const response = await fetch(`/api/executions/${id}`, { method: 'DELETE' });
        if (response.ok) {
            onNotify('Execution deleted.', 'success');
            setExecutions((previous) => previous.filter((execution) => execution.id !== id));
        } else onNotify('Delete failed.', 'error');
    }, [onConfirm, onNotify]);

    useEffect(() => { loadExecutions(); }, [loadExecutions]);

    const filtered = useMemo(() => executions.filter((execution) => filter === 'all' || execution.source === filter), [executions, filter]);
    const metrics = useMemo(() => {
        let successful = 0;
        let failed = 0;
        let duration = 0;
        let api = 0;
        for (const execution of executions) {
            const outcome = normalizeTaskOutcome(execution.outcome, execution.status);
            if (outcome === 'success') successful += 1;
            if (outcome === 'error' || outcome === 'crashed' || outcome === 'anti_bot') failed += 1;
            if (execution.source === 'api') api += 1;
            duration += Number(execution.durationMs) || 0;
        }
        return [
            { label: 'Total runs', value: executions.length },
            { label: 'Successful', value: successful },
            { label: 'Failed', value: failed },
            { label: 'Average runtime', value: executions.length ? `${Math.round(duration / executions.length)}ms` : '0ms' },
            { label: 'API runs', value: api },
        ];
    }, [executions]);
    const itemData = useMemo(() => ({ items: filtered, deleteExecution, navigate }), [filtered, deleteExecution, navigate]);

    return (
        <main className="app-page custom-scrollbar animate-in fade-in duration-500">
            <div className="app-page-inner">
                <header className="app-page-header">
                    <div><h1 className="app-page-title">Executions</h1><p className="app-page-subtitle">Run history and Task outcomes</p></div>
                    <div className="app-toolbar">
                        <button onClick={loadExecutions} disabled={loading} className="app-button-secondary" aria-busy={loading}>
                            <MaterialIcon name="sync" className={`text-base ${loading ? 'animate-spin' : ''}`} /> Refresh
                        </button>
                        <button onClick={clearExecutions} className="app-button-danger"><MaterialIcon name="delete" className="text-base" /> Clear all</button>
                    </div>
                </header>

                <section className="app-panel app-metrics" aria-label="Execution summary">
                    {metrics.map((metric) => <div className="app-metric" key={metric.label}><div className="app-metric-label">{metric.label}</div><div className="app-metric-value">{metric.value}</div></div>)}
                </section>

                <section className="app-panel overflow-hidden">
                    <div className="app-panel-header">
                        <div><h2 className="text-sm font-bold theme-text">Run history</h2><p className="mt-1 text-[10px] uppercase tracking-[0.14em] theme-text-faint">{filtered.length} executions</p></div>
                        <div role="tablist" className="app-toolbar rounded-xl border theme-border p-1 theme-input">
                            {(['all', 'editor', 'api'] as const).map((mode) => (
                                <button key={mode} role="tab" aria-selected={filter === mode} onClick={() => setFilter(mode)} className={`min-h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${filter === mode ? 'theme-accent-bg' : 'theme-text-faint hover:theme-text'}`}>{mode}</button>
                            ))}
                        </div>
                    </div>
                    {loading ? (
                        <div className="app-empty-state min-h-[220px]"><MaterialIcon name="sync" className="text-2xl theme-text-faint animate-spin" /><p className="text-xs theme-text-faint">Loading executions…</p></div>
                    ) : filtered.length ? (
                        <FixedSizeList height={Math.min(Math.max(EXECUTION_ITEM_SIZE, filtered.length * EXECUTION_ITEM_SIZE), EXECUTION_ITEM_SIZE * EXECUTION_LIST_MAX_VISIBLE)} itemCount={filtered.length} itemSize={EXECUTION_ITEM_SIZE} width="100%" overscanCount={EXECUTION_OVERSCAN} itemData={itemData} className="custom-scrollbar">
                            {renderExecutionRow}
                        </FixedSizeList>
                    ) : (
                        <div className="app-empty-state">
                            <div className="app-empty-icon"><MaterialIcon name="history" className="text-2xl" /></div>
                            <div><h3 className="text-sm font-bold theme-text">No executions found</h3><p className="mt-2 text-xs theme-text-faint">Run a Task from the dashboard or editor to see it here.</p></div>
                            <button onClick={() => navigate('/dashboard')} className="app-button-primary">Go to Tasks</button>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
};

export default ExecutionsScreen;
