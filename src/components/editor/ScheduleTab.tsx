import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { Task, TaskSchedule } from '../../types';

interface ScheduleTabProps {
    currentTask: Task;
    onUpdateTask: (updates: Partial<Task>) => void;
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({ currentTask, onUpdateTask }) => {
    if (!currentTask.id) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 animate-in fade-in duration-300">
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
                    <MaterialIcon name="save" className="text-gray-500" />
                </div>
                <div>
                    <p className="text-xs text-white font-medium">Save Required</p>
                    <p className="text-[10px] text-gray-500 mt-1 max-w-[200px]">You must save this task before you can set an execution schedule.</p>
                </div>
            </div>
        );
    }

    const schedule: TaskSchedule = currentTask.schedule || { enabled: false };
    const [advancedMode, setAdvancedMode] = React.useState(!!schedule.cron && !schedule.frequency);
    
    // Sync advancedMode if schedule changes externally (e.g. from server response)
    React.useEffect(() => {
        if (schedule.cron && !schedule.frequency) setAdvancedMode(true);
        if (schedule.frequency && !schedule.cron) setAdvancedMode(false);
    }, [schedule.cron, schedule.frequency]);
    const [description, setDescription] = React.useState<string | null>(null);
    const [nextRunPreview, setNextRunPreview] = React.useState<number | null>(schedule.nextRun || null);
    const [saving, setSaving] = React.useState(false);
    const [saveError, setSaveError] = React.useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = React.useState(false);

    const updateSchedule = (updates: Partial<TaskSchedule>) => {
        const next = { ...schedule, ...updates };
        
        // If enabling for the first time without frequency/cron, set a default
        if (next.enabled && !next.frequency && !next.cron) {
            next.frequency = 'daily';
            next.hour = 9;
            next.minute = 0;
        }

        onUpdateTask({ schedule: next });

        // Call describe endpoint for preview
        fetch(`/api/schedules/${currentTask.id}/describe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(next)
        }).then(r => r.json()).then(data => {
            setDescription(data.description || null);
            setNextRunPreview(data.nextRun || null);
        }).catch(() => { });
    };

    // Fetch description on mount
    React.useEffect(() => {
        if (schedule.enabled || schedule.frequency || schedule.cron) {
            fetch(`/api/schedules/${currentTask.id}/describe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(schedule)
            }).then(r => r.json()).then(data => {
                setDescription(data.description || null);
                setNextRunPreview(data.nextRun || null);
            }).catch(() => { });
        }
    }, []);

    const saveSchedule = (overrideSchedule?: TaskSchedule) => {
        setSaving(true);
        setSaveError(null);
        setSaveSuccess(false);

        const payload = overrideSchedule || { ...schedule };
        fetch(`/api/schedules/${currentTask.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        }).then(async r => {
            const data = await r.json();
            if (!r.ok) throw new Error(data.message || data.error || 'Failed to save');
            return data;
        }).then(data => {
            if (data.schedule) {
                onUpdateTask({ schedule: data.schedule });
                setDescription(data.description || null);
                setNextRunPreview(data.schedule?.nextRun || null);
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 2000);
            }
        }).catch((err) => { 
            setSaveError(err.message);
        }).finally(() => {
            setSaving(false);
        });
    };

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const freq = schedule.frequency || (advancedMode ? undefined : 'daily');
    const daysOfWeek = schedule.daysOfWeek || [];

    const formatRelativeTime = (ms: number) => {
        const diff = ms - Date.now();
        if (diff < 0) return 'now';
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'less than a minute';
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ${mins % 60}m`;
        const days = Math.floor(hrs / 24);
        return `${days}d ${hrs % 24}h`;
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Enable toggle */}
            <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Scheduled Execution</label>
                <button
                    onClick={() => {
                        const nextEnabled = !schedule.enabled;
                        const nextSchedule = { ...schedule, enabled: nextEnabled };
                        if (nextEnabled && !nextSchedule.frequency && !nextSchedule.cron) {
                            nextSchedule.frequency = 'daily';
                            nextSchedule.hour = 9;
                            nextSchedule.minute = 0;
                        }
                        updateSchedule(nextSchedule);
                        // Immediate save when toggling
                        saveSchedule(nextSchedule);
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                        schedule.enabled
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:border-white/20'
                    }`}
                >
                    <div className={`w-2 h-2 rounded-full ${schedule.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                    {schedule.enabled ? 'Active' : 'Inactive'}
                </button>
            </div>

            {/* Mode toggle: Visual / Advanced */}
            <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
                <button
                    onClick={() => {
                        setAdvancedMode(false);
                        updateSchedule({ cron: undefined, frequency: schedule.frequency || 'daily' });
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        !advancedMode ? 'bg-white text-black' : 'text-gray-500 hover:text-white'
                    }`}
                >Visual</button>
                <button
                    onClick={() => {
                        setAdvancedMode(true);
                        updateSchedule({ frequency: undefined, cron: schedule.cron || '0 9 * * *' });
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                        advancedMode ? 'bg-white text-black' : 'text-gray-500 hover:text-white'
                    }`}
                >Advanced</button>
            </div>

            {!advancedMode ? (
                <div className="space-y-6">
                    {/* Frequency selector */}
                    <div className="space-y-3">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Frequency</label>
                        <div className="grid grid-cols-3 gap-2">
                            {(['interval', 'hourly', 'daily', 'weekly', 'monthly'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => updateSchedule({ frequency: f, cron: undefined })}
                                    className={`px-3 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                        freq === f
                                            ? 'bg-white/15 border-white/40 text-white'
                                            : 'bg-white/5 border-white/5 text-gray-500 hover:text-white hover:border-white/15'
                                    }`}
                                >
                                    {f === 'interval' ? 'Every X min' : f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Interval minutes */}
                    {freq === 'interval' && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Run every</label>
                            <div className="grid grid-cols-6 gap-2">
                                {[1, 5, 10, 15, 30, 60].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => updateSchedule({ intervalMinutes: m })}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                            (schedule.intervalMinutes || 5) === m
                                                ? 'bg-white/15 border-white/40 text-white'
                                                : 'bg-white/5 border-white/5 text-gray-500 hover:text-white hover:border-white/15'
                                        }`}
                                    >
                                        {m}m
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Hourly: minute of hour */}
                    {freq === 'hourly' && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">At minute</label>
                            <div className="grid grid-cols-4 gap-2">
                                {[0, 15, 30, 45].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => updateSchedule({ minute: m })}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                                            (schedule.minute ?? 0) === m
                                                ? 'bg-white/15 border-white/40 text-white'
                                                : 'bg-white/5 border-white/5 text-gray-500 hover:text-white hover:border-white/15'
                                        }`}
                                    >
                                        :{String(m).padStart(2, '0')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Daily / Weekly / Monthly: time picker */}
                    {(freq === 'daily' || freq === 'weekly' || freq === 'monthly') && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Time</label>
                            <div className="flex gap-2">
                                <select
                                    value={schedule.hour ?? 9}
                                    onChange={e => updateSchedule({ hour: parseInt(e.target.value) })}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
                                >
                                    {Array.from({ length: 24 }, (_, i) => (
                                        <option key={i} value={i}>
                                            {i === 0 ? '12 AM' : i < 12 ? `${i} AM` : i === 12 ? '12 PM' : `${i - 12} PM`}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    value={schedule.minute ?? 0}
                                    onChange={e => updateSchedule({ minute: parseInt(e.target.value) })}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
                                >
                                    {Array.from({ length: 60 }, (_, i) => (
                                        <option key={i} value={i}>:{String(i).padStart(2, '0')}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Weekly: day of week toggles */}
                    {freq === 'weekly' && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Days</label>
                            <div className="grid grid-cols-7 gap-1.5">
                                {dayNames.map((name, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            const next = daysOfWeek.includes(i)
                                                ? daysOfWeek.filter(d => d !== i)
                                                : [...daysOfWeek, i].sort();
                                            updateSchedule({ daysOfWeek: next });
                                        }}
                                        className={`py-2 rounded-xl text-[10px] font-bold uppercase border transition-all ${
                                            daysOfWeek.includes(i)
                                                ? 'bg-white/20 border-white/40 text-white'
                                                : 'bg-white/5 border-white/5 text-gray-600 hover:text-white hover:border-white/15'
                                        }`}
                                    >
                                        {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Monthly: day of month */}
                    {freq === 'monthly' && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Day of Month</label>
                            <select
                                value={schedule.dayOfMonth ?? 1}
                                onChange={e => updateSchedule({ dayOfMonth: parseInt(e.target.value) })}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white"
                            >
                                {Array.from({ length: 31 }, (_, i) => (
                                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            ) : (
                /* Advanced raw cron mode */
                <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Cron Expression</label>
                    <input
                        type="text"
                        value={schedule.cron || ''}
                        onChange={e => updateSchedule({ cron: e.target.value, frequency: undefined })}
                        placeholder="*/5 * * * *"
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder:text-gray-700 focus:outline-none focus:border-white/30 transition-all"
                    />
                    <p className="text-[9px] text-gray-600 font-mono">minute hour day-of-month month day-of-week</p>
                </div>
            )}

            {/* Human-readable description */}
            {description && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <MaterialIcon name="event_repeat" className="text-sm text-white/40" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Schedule</span>
                    </div>
                    <p className="text-sm text-white font-medium">{description}</p>
                </div>
            )}

            {/* Next run preview */}
            {nextRunPreview && (
                <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div>
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Next Run</span>
                        <p className="text-xs text-white mt-1">{new Date(nextRunPreview).toLocaleString()}</p>
                    </div>
                    <span className="text-xs text-gray-400">in {formatRelativeTime(nextRunPreview)}</span>
                </div>
            )}

            {/* Last run status */}
            {schedule.lastRun && (
                <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${schedule.lastRunStatus === 'success' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Last Run</span>
                            <p className="text-xs text-white mt-0.5">{new Date(schedule.lastRun).toLocaleString()}</p>
                        </div>
                    </div>
                    {schedule.lastRunDurationMs != null && (
                        <span className="text-[10px] text-gray-500">{(schedule.lastRunDurationMs / 1000).toFixed(1)}s</span>
                    )}
                </div>
            )}

            {saveError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest text-center">
                    {saveError}
                </div>
            )}

            {/* Save button */}
            <button
                onClick={() => saveSchedule()}
                disabled={saving}
                className={`w-full py-3 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 ${
                    saveSuccess 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                        : 'bg-white text-black hover:bg-gray-200 shadow-xl shadow-white/5'
                } disabled:opacity-50`}
            >
                {saving ? (
                    <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : saveSuccess ? (
                    <MaterialIcon name="check" className="text-sm" />
                ) : null}
                {saveSuccess ? 'Schedule Saved' : saving ? 'Saving...' : 'Save Schedule'}
            </button>
        </div>
    );
};

export default ScheduleTab;
