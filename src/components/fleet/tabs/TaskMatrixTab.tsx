import React, { useMemo } from 'react';
import MaterialIcon from '../../MaterialIcon';
import { FleetWorkerState } from '../../../types';

const STATUS_COLORS: Record<string, string> = {
    IDLE: 'bg-gray-500/30 text-gray-400',
    RUNNING: 'bg-cyan-400/20 text-cyan-400 border-cyan-400/50',
    SUCCESS: 'bg-green-400/20 text-green-400 border-green-400/50',
    FAILED: 'bg-red-400/20 text-red-400 border-red-400/50',
};

interface TaskMatrixTabProps {
    workers: FleetWorkerState[];
    rows: any[];
    fleetConfig: any;
    onRowCenter: (workerId: string) => void;
    onProxyBind: (mode: 'STICKY_AUTO_BIND' | 'POOL_ROTATION') => void;
    onFallbackStrategy: (strategy: 'STOP' | 'LOOP' | 'REVERSE_LOOP' | 'RANDOM') => void;
    onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const TaskMatrixTab: React.FC<TaskMatrixTabProps> = ({ workers, rows, fleetConfig, onRowCenter, onProxyBind, onFallbackStrategy, onNotify }) => {
    const summary = useMemo(() => {
        const running = workers.filter(w => w.status === 'RUNNING').length;
        const idle = workers.filter(w => w.status === 'IDLE').length;
        const success = workers.filter(w => w.status === 'SUCCESS').length;
        const failed = workers.filter(w => w.status === 'FAILED').length;
        return { running, idle, success, failed, total: workers.length };
    }, [workers]);

    const formatUptime = (ms: number) => {
        if (!ms) return '—';
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}h ${m % 60}m`;
        if (m > 0) return `${m}m ${s % 60}s`;
        return `${s}s`;
    };

    const handleCopyWorkerId = (id: string) => {
        navigator.clipboard.writeText(id).then(() => onNotify('Worker ID copied', 'success'));
    };

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-4 font-space-mono">
                {/* Live summary cards */}
                <div className="grid grid-cols-4 gap-2">
                    <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-cyan-400">{summary.running}</div>
                        <div className="text-xs font-bold uppercase text-gray-500 tracking-widest">Running</div>
                    </div>
                    <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-gray-400">{summary.idle}</div>
                        <div className="text-xs font-bold uppercase text-gray-500 tracking-widest">Idle</div>
                    </div>
                    <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-green-400">{summary.success}</div>
                        <div className="text-xs font-bold uppercase text-gray-500 tracking-widest">Success</div>
                    </div>
                    <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-3 text-center">
                        <div className="text-2xl font-bold text-red-400">{summary.failed}</div>
                        <div className="text-xs font-bold uppercase text-gray-500 tracking-widest">Failed</div>
                    </div>
                </div>

                {/* Matrix grid header */}
                <div className="bg-[#0a0a0a] border border-white/10 rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[40px_120px_120px_80px_80px_100px_120px_60px] gap-px bg-white/5 text-xs font-bold uppercase text-gray-500 px-2 h-7 items-center">
                        <div>#</div>
                        <div>Worker ID</div>
                        <div>Active Node</div>
                        <div>Status</div>
                        <div>Row #</div>
                        <div>Uptime</div>
                        <div>Proxies (IP:port)</div>
                        <div></div>
                    </div>

                    {workers.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 text-xs">
                            No active workers. Start a Fleet task to begin.
                        </div>
                    ) : (
                        workers.map((w, i) => (
                            <div
                                key={w.id}
                                className="grid grid-cols-[40px_120px_120px_80px_80px_100px_120px_60px] gap-px bg-white/[0.02] text-xs px-2 h-8 items-center"
                            >
                                <div className="text-gray-600">{i + 1}</div>
                                <div className="truncate">
                                    <button
                                        onClick={() => handleCopyWorkerId(w.id)}
                                        className="truncate hover:text-cyan-400 transition-colors"
                                        title={w.id}
                                    >
                                        {w.id.slice(0, 16)}…
                                    </button>
                                </div>
                                <div className="truncate text-white/60">
                                    {w.activeActionId ? (
                                        <span
                                            className="cursor-pointer text-cyan-400 hover:text-cyan-300 transition-colors"
                                            onClick={() => onRowCenter(w.id)}
                                            title="Center viewport on this node"
                                        >
                                            {w.activeActionId.slice(0, 12)}…
                                        </span>
                                    ) : (
                                        '—'
                                    )}
                                </div>
                                <div>
                                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase border ${STATUS_COLORS[w.status] || STATUS_COLORS.IDLE}`}>
                                        {w.status}
                                    </span>
                                </div>
                                <div className="text-white/40">{w.rowIndex !== undefined ? w.rowIndex + 1 : '—'}</div>
                                <div className="text-white/30">{formatUptime(w.startTime ? Date.now() - w.startTime : 0)}</div>
                                <div className="truncate text-white/40">{w.proxy?.split('@').pop() || '—'}</div>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => onRowCenter(w.id)}
                                        className="p-1 rounded hover:bg-white/5 text-white/40 hover:text-cyan-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        title="Center viewport on active node"
                                    >
                                        <MaterialIcon name="center_focus_strong" className="text-xs" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Controls section */}
                <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
                    <div className="flex gap-4 items-center">
                        <label className="text-xs font-bold uppercase text-gray-500">Proxy Binding</label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onProxyBind('STICKY_AUTO_BIND')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${fleetConfig?.proxyBindMode === 'STICKY_AUTO_BIND' ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50' : 'bg-white/5 text-white/50 hover:bg-white/10'} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
                            >
                                Sticky Auto-Bind
                            </button>
                            <button
                                onClick={() => onProxyBind('POOL_ROTATION')}
                                className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${fleetConfig?.proxyBindMode === 'POOL_ROTATION' ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50' : 'bg-white/5 text-white/50 hover:bg-white/10'} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
                            >
                                Pool Rotation
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-4 items-center">
                        <label className="text-xs font-bold uppercase text-gray-500">Under-Row Fallback</label>
                        <div className="flex gap-2 flex-wrap">
                            {(['STOP', 'LOOP', 'REVERSE_LOOP', 'RANDOM'] as const).map((strategy) => (
                                <button
                                    key={strategy}
                                    onClick={() => onFallbackStrategy(strategy)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold uppercase transition-all ${fleetConfig?.fallbackStrategy === strategy ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/50' : 'bg-white/5 text-white/50 hover:bg-white/10'} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
                                >
                                    {strategy.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex gap-4 items-center">
                        <label className="text-xs font-bold uppercase text-gray-500">Total Rows</label>
                        <span className="text-xs font-bold text-white/60">{rows.length} row(s)</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TaskMatrixTab;
