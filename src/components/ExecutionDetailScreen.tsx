import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Execution, Results, ConfirmRequest } from '../types';
import MaterialIcon from './MaterialIcon';
import ResultsPane from './editor/ResultsPane';
import { useHeadfulStatus } from '../hooks/useHeadfulStatus';

interface ExecutionDetailScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const toResults = (exec: Execution): Results | null => {
    if (!exec.result) return null;
    const result = exec.result || {};
    return {
        url: exec.url || result.url || '',
        finalUrl: result.final_url || result.finalUrl,
        html: result.html,
        data: result.data ?? result.html ?? '',
        screenshotUrl: result.screenshot_url || result.screenshotUrl,
        logs: result.logs || [],
        timestamp: new Date(exec.timestamp).toLocaleTimeString()
    };
};

const ExecutionDetailScreen: React.FC<ExecutionDetailScreenProps> = ({ onConfirm, onNotify }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [execution, setExecution] = useState<Execution | null>(null);
    const [loading, setLoading] = useState(false);
    const useNovnc = useHeadfulStatus();

    useEffect(() => {
        const loadExecution = async () => {
            if (!id) return;
            setLoading(true);
            try {
                const res = await fetch(`/api/executions/${id}`);
                if (!res.ok) throw new Error('Failed to load execution');
                const data = await res.json();
                setExecution(data.execution || null);
            } catch {
                setExecution(null);
            } finally {
                setLoading(false);
            }
        };
        loadExecution();
    }, [id]);

    if (loading) {
        return (
            <main className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
                <div className="max-w-6xl mx-auto text-xs text-gray-500 uppercase tracking-widest">Loading execution...</div>
            </main>
        );
    }

    if (!execution) {
        return (
            <main className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
                <div className="max-w-6xl mx-auto space-y-6">
                    <button
                        onClick={() => navigate('/executions')}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all inline-flex items-center gap-2"
                        title="Back to Executions (Alt + 3)"
                        aria-label="Back to Executions (Alt + 3)"
                    >
                        <MaterialIcon name="arrow_back" className="text-[16px]" />
                        Back
                    </button>
                    <div className="text-xs text-gray-600 uppercase tracking-widest">Execution not found.</div>
                </div>
            </main>
        );
    }

    const results = toResults(execution);
    const statusClass = execution.status >= 200 && execution.status < 300
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : execution.status >= 400
            ? 'bg-red-500/10 text-red-400 border-red-500/20'
            : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

    return (
        <main className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-end justify-between">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold tracking-tighter text-white">{execution.taskName || execution.mode}</h2>
                        <div className="text-xs text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                            <span>{new Date(execution.timestamp).toLocaleString()}</span>
                            <span className="opacity-20">|</span>
                            <span>{execution.source}</span>
                            <span className="opacity-20">|</span>
                            <span>{execution.mode}</span>
                            <span className="opacity-20">|</span>
                            <span className={`px-1.5 py-0.5 rounded border ${statusClass}`}>
                                {execution.status}
                            </span>
                            <span className="opacity-20">|</span>
                            <span>{execution.durationMs}ms</span>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/executions')}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all inline-flex items-center gap-2"
                        title="Back to Executions (Alt + 3)"
                        aria-label="Back to Executions (Alt + 3)"
                    >
                        <MaterialIcon name="arrow_back" className="text-[16px]" />
                        Back
                    </button>
                </div>

                <div className="glass-card rounded-[32px] p-8 flex flex-col min-h-[420px]">
                        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Output</span>
                        </div>
                        {results ? (
                            <ResultsPane
                                results={results}
                                isExecuting={false}
                                mode={execution.mode}
                                onConfirm={onConfirm}
                                onNotify={onNotify}
                                fullWidth
                                useNovnc={useNovnc}
                            />
                        ) : (
                            <div className="text-xs text-gray-500 uppercase tracking-widest">No output captured.</div>
                        )}
                </div>
            </div>
        </main>
    );
};

export default ExecutionDetailScreen;
