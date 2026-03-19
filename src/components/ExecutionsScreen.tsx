import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import MaterialIcon from './MaterialIcon';
import { Execution, ConfirmRequest } from '../types';
import { FixedSizeList, ListChildComponentProps } from 'react-window';

const EXECUTION_ITEM_SIZE = 140;
const EXECUTION_LIST_MAX_VISIBLE = 6;
const EXECUTION_OVERSCAN = 4;

interface ExecutionListItemData {
    items: Execution[];
    deleteExecution: (id: string) => void;
    navigate: NavigateFunction;
}

const renderExecutionRow = ({ index, style, data }: ListChildComponentProps<ExecutionListItemData>) => {
    const exec = data.items[index];
    if (!exec) return null;
    return (
        <div
            style={style}
            onClick={() => data.navigate(`/executions/${exec.id}`)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    data.navigate(`/executions/${exec.id}`);
                }
            }}
            role="button"
            tabIndex={0}
            className="glass-card w-full rounded-2xl p-5 flex items-center gap-4 text-left hover:bg-white/[0.06] transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        >
            <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                {exec.source === 'api' ? <MaterialIcon name="cloud" className="text-xl" /> : <MaterialIcon name="monitor" className="text-xl" />}
            </div>
            <div className="flex-1 min-w-0 space-y-1">
                <div className="text-[10px] font-bold text-white uppercase tracking-widest truncate">
                    {exec.taskName || exec.mode}
                </div>
                <div className="text-[8px] text-gray-500 uppercase tracking-[0.2em]">
                    {new Date(exec.timestamp).toLocaleString()} | {exec.source} | {exec.mode} | {exec.status} | {exec.durationMs}ms
                </div>
                {exec.url && (
                    <div className="text-[9px] text-white/50 truncate font-mono">
                        {exec.url}
                    </div>
                )}
            </div>
            <button
                onClick={(event) => {
                    event.stopPropagation();
                    data.deleteExecution(exec.id);
                }}
                className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-red-500/5 border border-red-500/10 text-red-400 hover:bg-red-500/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                aria-label={`Delete execution ${exec.id}`}
            >
                Delete
            </button>
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
            const res = await fetch('/api/executions');
            if (!res.ok) throw new Error('Failed to load');
            const data = await res.json();
            setExecutions(Array.isArray(data.executions) ? data.executions : []);
        } catch {
            setExecutions([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearExecutions = useCallback(async () => {
        const confirmed = await onConfirm('Clear all executions?');
        if (!confirmed) return;
        const res = await fetch('/api/executions/clear', { method: 'POST' });
        if (res.ok) {
            onNotify('Executions cleared.', 'success');
            loadExecutions();
        } else {
            onNotify('Clear failed.', 'error');
        }
    }, [loadExecutions, onConfirm, onNotify]);

    const deleteExecution = useCallback(async (id: string) => {
        const confirmed = await onConfirm('Delete this execution?');
        if (!confirmed) return;
        const res = await fetch(`/api/executions/${id}`, { method: 'DELETE' });
        if (res.ok) {
            onNotify('Execution deleted.', 'success');
            setExecutions((prev) => prev.filter((e) => e.id !== id));
        } else {
            onNotify('Delete failed.', 'error');
        }
    }, [onConfirm, onNotify]);

    useEffect(() => {
        loadExecutions();
    }, [loadExecutions]);

    const filtered = useMemo(() => {
        return executions.filter((exec) => {
            if (filter === 'all') return true;
            return exec.source === filter;
        });
    }, [executions, filter]);

    // Memoize itemData to prevent FixedSizeList from re-rendering all rows on every render
    const itemData = useMemo(() => ({
        items: filtered,
        deleteExecution,
        navigate
    }), [filtered, deleteExecution, navigate]);

    return (
        <main className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-end justify-between">
                    <div className="space-y-2">
                        <h2 className="text-base font-heading font-bold tracking-[0.25em] text-white uppercase">Run History</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <div role="tablist" className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                            {(['all', 'editor', 'api'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    role="tab"
                                    aria-selected={filter === mode}
                                    onClick={() => setFilter(mode)}
                                    className={`px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all focus:outline-none focus-visible:ring-2 ${filter === mode ? 'bg-white text-black focus-visible:ring-blue-500' : 'text-gray-500 hover:text-white focus-visible:ring-white/50'}`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={loadExecutions}
                            disabled={loading}
                            aria-busy={loading}
                            className="w-10 h-10 rounded-2xl border border-white/10 text-gray-400 hover:text-white hover:bg-white/5 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Refresh"
                            aria-label="Refresh executions"
                        >
                            <MaterialIcon name="sync" className={`text-xl ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={clearExecutions}
                            className="w-10 h-10 rounded-2xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            title="Clear all"
                            aria-label="Clear all executions"
                        >
                            <MaterialIcon name="delete" className="text-xl" />
                        </button>
                    </div>
                </div>

                {loading && (
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest">Loading executions...</div>
                )}
                {!loading && filtered.length === 0 && (
                    <div className="text-[9px] text-gray-600 uppercase tracking-widest">No executions found.</div>
                )}

                {!loading && filtered.length > 0 && (
                    <FixedSizeList
                        height={Math.min(
                            Math.max(EXECUTION_ITEM_SIZE, filtered.length * EXECUTION_ITEM_SIZE),
                            EXECUTION_ITEM_SIZE * EXECUTION_LIST_MAX_VISIBLE
                        )}
                        itemCount={filtered.length}
                        itemSize={EXECUTION_ITEM_SIZE}
                        width="100%"
                        overscanCount={EXECUTION_OVERSCAN}
                        itemData={itemData}
                        className="custom-scrollbar"
                    >
                        {renderExecutionRow}
                    </FixedSizeList>
                )}
            </div>
        </main>
    );
};

export default ExecutionsScreen;
