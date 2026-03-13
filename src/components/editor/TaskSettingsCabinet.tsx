import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { Task, TaskSchedule, VarType } from '../../types';
import CodeEditor from '../CodeEditor';
import CopyButton from '../CopyButton';

interface TaskSettingsCabinetProps {
    isOpen: boolean;
    onClose: () => void;
    currentTask: Task;
    onUpdateTask: (updates: Partial<Task>) => void;
    proxyListLoaded: boolean;
    proxyList: { id: string }[];
}

const TaskSettingsCabinet: React.FC<TaskSettingsCabinetProps & {
    initialTab?: 'mode' | 'variables' | 'behavior' | 'extraction' | 'api' | 'schedule' | 'history',
    versions: { id: string; timestamp: number; name: string; mode: string }[],
    versionsLoading: boolean,
    onRollback: (id: string) => void,
    onPreview: (id: string) => void
}> = ({
    isOpen,
    onClose,
    currentTask,
    onUpdateTask,
    proxyListLoaded,
    proxyList,
    initialTab = 'mode',
    versions,
    versionsLoading,
    onRollback,
    onPreview
}) => {
        const [activeTab, setActiveTab] = React.useState<typeof initialTab>(initialTab);

        React.useEffect(() => {
            if (isOpen) {
                setActiveTab(initialTab);
            }
        }, [isOpen, initialTab]);

        if (!isOpen) return null;

        const rotateProxiesDisabled = proxyListLoaded && proxyList.length === 1 && proxyList[0]?.id === 'host';

        const updateVariable = (oldName: string, name: string, type: VarType, value: any) => {
            const nextVars = { ...currentTask.variables };
            if (oldName !== name) delete nextVars[oldName];
            nextVars[name] = { type, value };
            onUpdateTask({ variables: nextVars });
        };

        const removeVariable = (name: string) => {
            const nextVars = { ...currentTask.variables };
            delete nextVars[name];
            onUpdateTask({ variables: nextVars });
        };

        const addVariable = () => {
            const name = `var_${Object.keys(currentTask.variables || {}).length + 1}`;
            updateVariable(name, name, 'string', '');
        };

        const toggleStealth = (key: keyof Task['stealth']) => {
            onUpdateTask({
                stealth: {
                    ...currentTask.stealth,
                    [key]: !currentTask.stealth[key]
                }
            });
        };

        const renderTabButton = (id: typeof activeTab, label: string, icon: string) => (
            <button
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === id
                    ? 'bg-white text-black shadow-lg shadow-white/10'
                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                    }`}
            >
                <MaterialIcon name={icon} className="text-sm" />
                {label}
            </button>
        );

        return (
            <div className="fixed inset-y-0 right-0 w-[450px] z-[100] flex">
                {/* Backdrop for closing */}
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

                {/* The Cabinet */}
                <div className="relative h-full w-full bg-[#080808]/90 border-l border-white/10 backdrop-blur-2xl shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-300 ease-out p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Task Settings</h2>
                            <p className="text-[10px] text-gray-500 uppercase tracking-[0.2em] mt-1">{currentTask.name || 'Untitled Task'}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/5 text-gray-400 hover:text-white transition-colors"
                            aria-label="Close settings"
                            title="Close settings"
                        >
                            <MaterialIcon name="close" />
                        </button>
                    </div>

                    {/* Tabs Nav */}
                    <div className="flex flex-wrap gap-2 mb-8 bg-black/40 p-1 rounded-2xl border border-white/5">
                        {renderTabButton('mode', 'Mode', 'settings_input_component')}
                        {renderTabButton('variables', 'Vars', 'data_object')}
                        {renderTabButton('behavior', 'Behavior', 'psychology')}
                        {renderTabButton('extraction', 'Extract', 'terminal')}
                        {renderTabButton('api', 'API', 'api')}
                        {renderTabButton('schedule', 'Schedule', 'event_repeat')}
                        {renderTabButton('history', 'History', 'history')}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                        {activeTab === 'mode' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Execution Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => onUpdateTask({ mode: 'agent' })}
                                            className={`p-4 rounded-2xl border transition-all text-left space-y-2 ${currentTask.mode === 'agent'
                                                ? 'bg-white/10 border-white/30 ring-1 ring-white/20'
                                                : 'bg-white/5 border-white/5 opacity-50 hover:opacity-100 hover:border-white/10'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                <MaterialIcon name="smart_toy" className="text-white/60" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-white">Agent Mode</div>
                                                <div className="text-[9px] text-gray-500">Autonomous decision making</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => onUpdateTask({ mode: 'scrape' })}
                                            className={`p-4 rounded-2xl border transition-all text-left space-y-2 ${currentTask.mode === 'scrape'
                                                ? 'bg-white/10 border-white/30 ring-1 ring-white/20'
                                                : 'bg-white/5 border-white/5 opacity-50 hover:opacity-100 hover:border-white/10'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                                <MaterialIcon name="api" className="text-white/60" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-white">Scrape Mode</div>
                                                <div className="text-[9px] text-gray-500">Fixed data extraction flow</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'variables' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Task Variables</label>
                                    <button
                                        onClick={addVariable}
                                        className="px-3 py-1 rounded-lg bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-white/20 transition-all border border-white/10"
                                    >
                                        + Add Var
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {Object.entries(currentTask.variables || {}).map(([name, def]) => (
                                        <div key={name} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    defaultValue={name}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== name) updateVariable(name, e.target.value, def.type, def.value);
                                                    }}
                                                    placeholder="Name"
                                                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white placeholder:text-gray-700"
                                                />
                                                <select
                                                    value={def.type}
                                                    onChange={(e) => updateVariable(name, name, e.target.value as VarType, def.value)}
                                                    className="bg-black/40 border border-white/5 rounded-xl px-2 py-2 text-[10px] font-bold uppercase text-gray-500"
                                                >
                                                    <option value="string">String</option>
                                                    <option value="number">Number</option>
                                                    <option value="boolean">Bool</option>
                                                </select>
                                                <button
                                                    onClick={() => removeVariable(name)}
                                                    className="text-red-500/50 hover:text-red-500 p-2"
                                                    aria-label="Remove variable"
                                                    title="Remove variable"
                                                >
                                                    <MaterialIcon name="delete" className="text-sm" />
                                                </button>
                                            </div>
                                            <div className="pl-1">
                                                {def.type === 'boolean' ? (
                                                    <select
                                                        value={String(def.value)}
                                                        onChange={(e) => updateVariable(name, name, def.type, e.target.value === 'true')}
                                                        className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white"
                                                    >
                                                        <option value="true">True</option>
                                                        <option value="false">False</option>
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={def.type === 'number' ? 'number' : 'text'}
                                                        value={def.value}
                                                        onChange={(e) => updateVariable(name, name, def.type, def.type === 'number' ? parseFloat(e.target.value) : e.target.value)}
                                                        placeholder="Default Value"
                                                        className="w-full bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-white"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(currentTask.variables || {}).length === 0 && (
                                        <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl">
                                            <p className="text-[10px] text-gray-600 uppercase tracking-widest">No variables defined</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'behavior' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Runtime Flags</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {[
                                            { label: 'Stateless Execution', key: 'statelessExecution', icon: 'auto_delete' },
                                            { label: 'Disable Recording', key: 'disableRecording', icon: 'videocam_off' },
                                            { label: 'Rotate Proxies', key: 'rotateProxies', icon: 'vpn_lock', disabled: rotateProxiesDisabled },
                                            { label: 'Rotate User Agents', key: 'rotateUserAgents', icon: 'person_search' },
                                            { label: 'Rotate Viewport', key: 'rotateViewport', icon: 'screenshot_monitor' },
                                            { label: 'Include Shadow DOM', key: 'includeShadowDom', icon: 'layers' },
                                        ].map((item) => (
                                            <button
                                                key={item.key}
                                                disabled={item.disabled}
                                                role="switch"
                                                aria-checked={!!currentTask[item.key as keyof Task]}
                                                onClick={() => onUpdateTask({ [item.key]: !currentTask[item.key as keyof Task] })}
                                                className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${currentTask[item.key as keyof Task]
                                                    ? 'bg-white/10 border-white/30 text-white'
                                                    : 'bg-white/5 border-white/5 text-gray-400 opacity-60 hover:opacity-100'
                                                    } ${item.disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <MaterialIcon name={item.icon} className="text-sm opacity-70" />
                                                    <span className="text-xs font-medium">{item.label}</span>
                                                </div>
                                                <div className={`w-8 h-4 rounded-full relative transition-colors ${currentTask[item.key as keyof Task] ? 'bg-white' : 'bg-white/10'}`}>
                                                    <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask[item.key as keyof Task] ? 'right-1 bg-black' : 'left-1 bg-white/20'}`} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Stealth & Behavior</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { label: 'Human Typing', key: 'naturalTyping', icon: 'keyboard' },
                                            { label: 'Cursor Glide', key: 'cursorGlide', icon: 'near_me' },
                                            { label: 'Idle Moves', key: 'idleMovements', icon: 'mouse' },
                                            { label: 'Dead Clicks', key: 'deadClicks', icon: 'ads_click' },
                                            { label: 'Fatigue Sim', key: 'fatigue', icon: 'hourglass_empty' },
                                            { label: 'Allow Typos', key: 'allowTypos', icon: 'spellcheck' },
                                            { label: 'Random Clicks', key: 'randomizeClicks', icon: 'shuffle' },
                                            { label: 'Overscroll', key: 'overscroll', icon: 'unfold_more' },
                                        ].map((item) => (
                                            <button
                                                key={item.key}
                                                role="switch"
                                                aria-checked={!!currentTask.stealth[item.key as keyof Task['stealth']]}
                                                onClick={() => toggleStealth(item.key as keyof Task['stealth'])}
                                                className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all text-left ${currentTask.stealth[item.key as keyof Task['stealth']]
                                                    ? 'bg-white/15 border-white/40 text-white'
                                                    : 'bg-white/5 border-white/5 text-gray-500 opacity-60 hover:opacity-100'
                                                    }`}
                                            >
                                                <MaterialIcon name={item.icon} className="text-sm opacity-70" />
                                                <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'extraction' && (
                            <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4 flex-1 flex flex-col">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Post-Execution Script</label>
                                        <select
                                            value={currentTask.extractionFormat || 'json'}
                                            onChange={(e) => onUpdateTask({ extractionFormat: e.target.value as any })}
                                            className="bg-black/40 border border-white/5 rounded-lg px-2 py-1 text-[8px] font-bold uppercase text-gray-500"
                                        >
                                            <option value="json">JSON</option>
                                            <option value="csv">CSV</option>
                                        </select>
                                    </div>
                                    <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl overflow-hidden min-h-[300px]">
                                        <CodeEditor
                                            language="javascript"
                                            value={currentTask.extractionScript || ''}
                                            onChange={(val) => onUpdateTask({ extractionScript: val })}
                                            placeholder="// Example: return { title: document.title };"
                                            className="h-full text-[11px]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'api' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Trigger via API</label>
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-gray-500">Run this task from external tools using the endpoint below:</p>
                                        <div className="relative group">
                                            <div className="bg-black/40 border border-white/10 rounded-xl p-4 pr-12 font-mono text-[10px] text-white/80 break-all border-dashed">
                                                POST /api/tasks/{currentTask.id}/api
                                            </div>
                                            <CopyButton
                                                text={`POST /api/tasks/${currentTask.id}/api`}
                                                className="absolute right-2 top-2 p-2 rounded-lg bg-white/5 border border-white/10 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                iconClassName="text-xs"
                                                title="Copy Endpoint"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Passing Variables</label>
                                    <div className="space-y-2">
                                        <p className="text-[10px] text-gray-500">You can override task variables in the request body:</p>
                                        <div className="relative group">
                                            <div className="bg-black/40 border border-white/5 rounded-xl p-4 pr-12 font-mono text-[10px] text-white/60">
                                                <pre>{JSON.stringify({
                                                    variables: Object.fromEntries(
                                                        Object.entries(currentTask.variables || {}).slice(0, 2).map(([k, v]) => [k, v.value])
                                                    )
                                                }, null, 2)}</pre>
                                            </div>
                                            <CopyButton
                                                text={JSON.stringify({
                                                    variables: Object.fromEntries(
                                                        Object.entries(currentTask.variables || {}).slice(0, 2).map(([k, v]) => [k, v.value])
                                                    )
                                                }, null, 2)}
                                                className="absolute right-2 top-2 p-2 rounded-lg bg-white/5 border border-white/10 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                iconClassName="text-xs"
                                                title="Copy Payload"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'schedule' && (() => {
                            const schedule: TaskSchedule = currentTask.schedule || { enabled: false };
                            const [advancedMode, setAdvancedMode] = React.useState(!!schedule.cron && !schedule.frequency);
                            const [description, setDescription] = React.useState<string | null>(null);
                            const [nextRunPreview, setNextRunPreview] = React.useState<number | null>(schedule.nextRun || null);

                            const updateSchedule = (updates: Partial<TaskSchedule>) => {
                                const next = { ...schedule, ...updates };
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

                            const saveSchedule = () => {
                                const payload = { ...schedule };
                                fetch(`/api/schedules/${currentTask.id}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    credentials: 'include',
                                    body: JSON.stringify(payload)
                                }).then(r => r.json()).then(data => {
                                    if (data.schedule) {
                                        onUpdateTask({ schedule: data.schedule });
                                        setDescription(data.description || null);
                                        setNextRunPreview(data.schedule?.nextRun || null);
                                    }
                                }).catch(() => { });
                            };

                            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                            const freq = schedule.frequency || 'daily';
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
                                                updateSchedule({ enabled: !schedule.enabled });
                                                // Auto-save when toggling
                                                setTimeout(saveSchedule, 100);
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
                                            onClick={() => setAdvancedMode(false)}
                                            className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                                                !advancedMode ? 'bg-white text-black' : 'text-gray-500 hover:text-white'
                                            }`}
                                        >Visual</button>
                                        <button
                                            onClick={() => setAdvancedMode(true)}
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
                                                            onClick={() => updateSchedule({ frequency: f })}
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

                                    {/* Save button */}
                                    <button
                                        onClick={saveSchedule}
                                        className="w-full py-3 rounded-2xl bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-gray-200 transition-all"
                                    >
                                        Save Schedule
                                    </button>
                                </div>
                            );
                        })()}

                        {activeTab === 'history' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em]">Version History</label>
                                    {versionsLoading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                                </div>

                                <div className="space-y-2">
                                    {versions.map((v) => (
                                        <div key={v.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center justify-between group hover:border-white/20 transition-all">
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs font-bold text-white mb-0.5">{new Date(v.timestamp).toLocaleString()}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-gray-400 font-bold uppercase tracking-widest">{v.mode}</span>
                                                    <span className="text-[9px] text-gray-600 truncate max-w-[150px]">{v.name || 'Untitled'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => onPreview(v.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                                                    title="Preview version"
                                                    aria-label="Preview version"
                                                >
                                                    <MaterialIcon name="visibility" className="text-sm" />
                                                </button>
                                                <button
                                                    onClick={() => onRollback(v.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-all"
                                                    title="Rollback to this version"
                                                    aria-label="Rollback to this version"
                                                >
                                                    <MaterialIcon name="restore" className="text-sm" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {versions.length === 0 && !versionsLoading && (
                                        <div className="text-center py-12 border border-dashed border-white/10 rounded-3xl">
                                            <p className="text-[10px] text-gray-600 uppercase tracking-widest">No previous versions found</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

export default TaskSettingsCabinet;
