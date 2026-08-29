import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { Task, TaskSchedule } from '../../types';
import { normalizeTaskOutcome, taskOutcomeDotClass, taskOutcomeLabel } from '../../utils/taskOutcome';
import CustomSelect from '../common/CustomSelect';

interface ScheduleTabProps {
    currentTask: Task;
    onUpdateTask: (updates: Partial<Task>) => void;
}

const ScheduleTab: React.FC<ScheduleTabProps> = ({ currentTask, onUpdateTask }) => {
    if (!currentTask.id) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-center space-y-4 animate-in fade-in duration-300">
                <div className="w-12 h-12 rounded-full bg-[var(--app-surface-3)] border border-[var(--app-border)] flex items-center justify-center">
                    <MaterialIcon name="save" className="text-[var(--app-text-faint)]" />
                </div>
                <div>
                    <p className="text-xs text-[var(--app-text)] font-medium">Save Required</p>
                    <p className="text-xs text-[var(--app-text-faint)] mt-1 max-w-[200px]">You must save this task before you can set an execution schedule.</p>
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
                <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Scheduled Execution</label>
                <button
                    role="switch"
                    aria-checked={schedule.enabled}
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
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                        schedule.enabled
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                            : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)]'
                    }`}
                >
                    <div className={`w-2 h-2 rounded-full ${schedule.enabled ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                    {schedule.enabled ? 'Active' : 'Inactive'}
                </button>
            </div>

            {/* Mode toggle: Visual / Advanced */}
            <div role="tablist" className="flex items-center gap-2 bg-[var(--app-input)] p-1 rounded-xl border border-[var(--app-border)]">
                <button
                    role="tab"
                    aria-selected={!advancedMode}
                    onClick={() => {
                        setAdvancedMode(false);
                        updateSchedule({ cron: undefined, frequency: schedule.frequency || 'daily' });
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all focus:outline-none focus-visible:ring-2 ${
                        !advancedMode ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] focus-visible:ring-blue-500' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)] focus-visible:ring-white/50'
                    }`}
                >Visual</button>
                <button
                    role="tab"
                    aria-selected={advancedMode}
                    onClick={() => {
                        setAdvancedMode(true);
                        updateSchedule({ frequency: undefined, cron: schedule.cron || '0 9 * * *' });
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all focus:outline-none focus-visible:ring-2 ${
                        advancedMode ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] focus-visible:ring-blue-500' : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)] focus-visible:ring-white/50'
                    }`}
                >Advanced</button>
            </div>

            {!advancedMode ? (
                <div className="space-y-6">
                    {/* Frequency selector */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Frequency</label>
                        <div role="tablist" className="grid grid-cols-3 gap-2">
                            {(['interval', 'hourly', 'daily', 'weekly', 'monthly'] as const).map(f => (
                                <button
                                    key={f}
                                    role="tab"
                                    aria-selected={freq === f}
                                    onClick={() => updateSchedule({ frequency: f, cron: undefined })}
                                    className={`px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all focus:outline-none focus-visible:ring-2 ${
                                        freq === f
                                            ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)] focus-visible:ring-blue-500'
                                            : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] focus-visible:ring-white/50'
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
                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Run every</label>
                            <div role="tablist" className="grid grid-cols-6 gap-2">
                                {[1, 5, 10, 15, 30, 60].map(m => (
                                    <button
                                        key={m}
                                        role="tab"
                                        aria-selected={(schedule.intervalMinutes || 5) === m}
                                        onClick={() => updateSchedule({ intervalMinutes: m })}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all focus:outline-none focus-visible:ring-2 ${
                                            (schedule.intervalMinutes || 5) === m
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)] focus-visible:ring-blue-500'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] focus-visible:ring-white/50'
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
                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">At minute</label>
                            <div role="tablist" className="grid grid-cols-4 gap-2">
                                {[0, 15, 30, 45].map(m => (
                                    <button
                                        key={m}
                                        role="tab"
                                        aria-selected={(schedule.minute ?? 0) === m}
                                        onClick={() => updateSchedule({ minute: m })}
                                        className={`py-2 rounded-xl text-xs font-bold border transition-all focus:outline-none focus-visible:ring-2 ${
                                            (schedule.minute ?? 0) === m
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)] focus-visible:ring-blue-500'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] focus-visible:ring-white/50'
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
                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Time</label>
                            <div className="flex gap-2">
                                <CustomSelect
                                    value={schedule.hour ?? 9}
                                    onChange={(hour) => updateSchedule({ hour })}
                                    options={Array.from({ length: 24 }, (_, hour) => ({ value: hour, label: hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM` }))}
                                    className="flex-1"
                                    ariaLabel="Hour"
                                />
                                <CustomSelect
                                    value={schedule.minute ?? 0}
                                    onChange={(minute) => updateSchedule({ minute })}
                                    options={Array.from({ length: 60 }, (_, minute) => ({ value: minute, label: `:${String(minute).padStart(2, '0')}` }))}
                                    className="flex-1"
                                    ariaLabel="Minute"
                                />
                            </div>
                        </div>
                    )}

                    {/* Weekly: day of week toggles */}
                    {freq === 'weekly' && (
                        <div className="space-y-3">
                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Days</label>
                            <div className="grid grid-cols-7 gap-1.5">
                                {dayNames.map((name, i) => (
                                    <button
                                        key={i}
                                        aria-pressed={daysOfWeek.includes(i)}
                                        onClick={() => {
                                            const next = daysOfWeek.includes(i)
                                                ? daysOfWeek.filter(d => d !== i)
                                                : [...daysOfWeek, i].sort();
                                            updateSchedule({ daysOfWeek: next });
                                        }}
                                        className={`py-2 rounded-xl text-xs font-bold uppercase border transition-all focus:outline-none focus-visible:ring-2 ${
                                            daysOfWeek.includes(i)
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)] focus-visible:ring-blue-500'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] focus-visible:ring-white/50'
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
                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Day of Month</label>
                            <CustomSelect
                                value={schedule.dayOfMonth ?? 1}
                                onChange={(dayOfMonth) => updateSchedule({ dayOfMonth })}
                                options={Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: String(index + 1) }))}
                                ariaLabel="Day of Month"
                            />
                        </div>
                    )}
                </div>
            ) : (
                /* Advanced raw cron mode */
                <div className="space-y-3">
                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Cron Expression</label>
                    <input
                        type="text"
                        aria-label="Cron Expression"
                        value={schedule.cron || ''}
                        onChange={e => updateSchedule({ cron: e.target.value, frequency: undefined })}
                        placeholder="*/5 * * * *"
                        className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-4 py-3 text-sm text-[var(--app-text)] font-mono placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)] transition-all focus-visible:ring-2 focus-visible:ring-white/50"
                    />
                    <p className="text-xs text-[var(--app-text-faint)] font-mono">minute hour day-of-month month day-of-week</p>
                </div>
            )}

            {/* Human-readable description */}
            {description && (
                <div className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <MaterialIcon name="event_repeat" className="text-sm text-[var(--app-text-faint)]" />
                        <span className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Schedule</span>
                    </div>
                    <p className="text-sm text-[var(--app-text)] font-medium">{description}</p>
                </div>
            )}

            {/* Next run preview */}
            {nextRunPreview && (
                <div className="flex items-center justify-between bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4">
                    <div>
                        <span className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Next Run</span>
                        <p className="text-xs text-[var(--app-text)] mt-1">{new Date(nextRunPreview).toLocaleString()}</p>
                    </div>
                    <span className="text-xs text-[var(--app-text-muted)]">in {formatRelativeTime(nextRunPreview)}</span>
                </div>
            )}

            {/* Last run status */}
            {schedule.lastRun && (
                <div className="flex items-center justify-between bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${taskOutcomeDotClass(normalizeTaskOutcome(schedule.lastRunStatus))}`} />
                        <div>
                            <span className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Last Run</span>
                            <p className="text-xs text-[var(--app-text)] mt-0.5">{new Date(schedule.lastRun).toLocaleString()}</p>
                            <p className="text-[10px] text-[var(--app-text-muted)] mt-0.5 uppercase tracking-widest">{taskOutcomeLabel(normalizeTaskOutcome(schedule.lastRunStatus))}</p>
                        </div>
                    </div>
                    {schedule.lastRunDurationMs != null && (
                        <span className="text-xs text-[var(--app-text-muted)]">{(schedule.lastRunDurationMs / 1000).toFixed(1)}s</span>
                    )}
                </div>
            )}

            {saveError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-widest text-center">
                    {saveError}
                </div>
            )}

            {/* Save button */}
            <button
                onClick={() => saveSchedule()}
                disabled={saving}
                className={`w-full py-3 rounded-2xl text-xs font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 ${
                    saveSuccess 
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 focus-visible:ring-white'
                        : 'bg-[var(--app-accent)] text-[var(--app-accent-text)] hover:opacity-90 shadow-xl shadow-black/5 focus-visible:ring-blue-500'
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
