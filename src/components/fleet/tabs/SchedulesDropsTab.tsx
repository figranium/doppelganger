import React, { useState, useCallback } from 'react';
import MaterialIcon from '../../MaterialIcon';

interface SchedulesDropsTabProps {
    fleetConfig: any;
    onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const SchedulesDropsTab: React.FC<SchedulesDropsTabProps> = ({ fleetConfig, onNotify }) => {
    const [cronExpr, setCronExpr] = useState('');
    const [preWarmCount, setPreWarmCount] = useState(5);
    const [jitterMs, setJitterMs] = useState(0);

    const handleSaveSchedule = useCallback(async () => {
        if (!cronExpr.trim()) {
            onNotify('Cron expression is required', 'error');
            return;
        }
        try {
            await fetch('/api/fleet/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cronExpr, preWarmCount, jitterMs }),
            });
            onNotify(`Schedule saved: ${cronExpr}`, 'success');
        } catch (e: any) {
            onNotify(`Failed to save schedule: ${e.message}`, 'error');
        }
    }, [cronExpr, preWarmCount, jitterMs, onNotify]);

    const handlePreWarm = useCallback(async () => {
        try {
            await fetch('/api/fleet/prewarm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ count: preWarmCount }),
            });
            onNotify(`Pre-warmed ${preWarmCount} workers`, 'success');
        } catch (e: any) {
            onNotify(`Pre-warm failed: ${e.message}`, 'error');
        }
    }, [preWarmCount, onNotify]);

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-6 font-questrial">
                {/* Cron trigger */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-600 tracking-widest">Cron Trigger</label>
                    <input
                        type="text"
                        value={cronExpr}
                        onChange={(e) => setCronExpr(e.target.value)}
                        placeholder="e.g. 0 */2 * * * (every 2 hours)"
                        className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all font-space-mono"
                    />
                    <p className="text-xs text-gray-600">Supports standard cron syntax with optional seconds field. See docs for examples.</p>
                </div>

                {/* Pre-warming */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-600 tracking-widest">Pre-warming</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="number"
                            min={0}
                            max={100}
                            value={preWarmCount}
                            onChange={(e) => setPreWarmCount(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-20 bg-[#0a0a0a] border border-white/10 rounded-xl px-2 py-1 text-sm text-white focus:outline-none focus:border-cyan-400/50 transition-all"
                        />
                        <button
                            onClick={handlePreWarm}
                            className="px-3 py-1.5 rounded-lg bg-cyan-400 text-black text-xs font-bold uppercase hover:scale-105 transition-all flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                        >
                            <MaterialIcon name="rocket_launch" className="text-sm" />
                            Pre-warm Now
                        </button>
                    </div>
                    <p className="text-xs text-gray-600">Pre-warm spawns N browser instances ahead of the schedule trigger.</p>
                </div>

                {/* Jitter */}
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-gray-600 tracking-widest">Jitter</label>
                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={0}
                            max={5000}
                            step={100}
                            value={jitterMs}
                            onChange={(e) => setJitterMs(parseInt(e.target.value))}
                            className="flex-1 accent-cyan-400"
                        />
                        <span className="text-xs font-bold text-white/60 w-16 text-right font-space-mono">{jitterMs}ms</span>
                    </div>
                    <p className="text-xs text-gray-600">Random jitter added to each worker's start time to avoid thundering herd.</p>
                </div>

                {/* Drop schedule */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                    <label className="text-xs font-bold uppercase text-gray-600 tracking-widest">Scheduled Drops</label>
                    {fleetConfig?.scheduledDrops?.length === 0 ? (
                        <p className="text-xs text-gray-600">No scheduled drops configured.</p>
                    ) : (
                        <div className="space-y-1">
                            {fleetConfig?.scheduledDrops?.map((drop: any, i: number) => (
                                <div key={i} className="flex justify-between items-center bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2">
                                    <span className="text-xs font-mono text-gray-400">{drop.cronExpr}</span>
                                    <span className="text-xs text-gray-500">{drop.description || '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={handleSaveSchedule}
                    className="w-full py-2.5 rounded-xl bg-cyan-400 text-black text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                >
                    Save Schedule
                </button>
            </div>
        </div>
    );
};

export default SchedulesDropsTab;
