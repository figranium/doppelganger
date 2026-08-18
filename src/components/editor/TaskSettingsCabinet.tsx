import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { Task, VarType, Credential, TaskOutput, ExtractionField, ExtractionGroup } from '../../types';
import CodeEditor from '../CodeEditor';
import CopyButton from '../CopyButton';
import ScheduleTab from './ScheduleTab';
import RichInput from '../RichInput';
import { generateExtractionScript } from '../../utils/extractionScriptGen';
import { taskFieldInspectId, taskGroupContainerInspectId, taskGroupFieldInspectId } from '../../utils/extractionFieldIds';

interface TaskSettingsCabinetProps {
    isOpen: boolean;
    onClose: () => void;
    currentTask: Task;
    onUpdateTask: (updates: Partial<Task>) => void;
    proxyListLoaded: boolean;
    proxyList: { id: string }[];
    onStartFieldInspect?: (fieldId: string) => void;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    fieldSelectorOptionsById?: Record<string, string[]>;
}

const TaskSettingsCabinet: React.FC<TaskSettingsCabinetProps & {
    initialTab?: 'mode' | 'variables' | 'behavior' | 'extraction' | 'api' | 'output' | 'schedule' | 'history',
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
    onStartFieldInspect,
    onStartGroupContainerInspect,
    onStartGroupFieldInspect,
    fieldSelectorOptionsById,
    initialTab = 'mode',
    versions,
    versionsLoading,
    onRollback,
    onPreview
}) => {
        const [activeTab, setActiveTab] = React.useState<typeof initialTab>(initialTab);
        const [credentials, setCredentials] = React.useState<Credential[]>([]);
        const [newCred, setNewCred] = React.useState({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
        const [showNewCredForm, setShowNewCredForm] = React.useState(false);
        const [credSaving, setCredSaving] = React.useState(false);
        const [databases, setDatabases] = React.useState<{ id: string; name: string; workspaceName: string }[]>([]);
        const [tables, setTables] = React.useState<{ id: string; name: string }[]>([]);
        const [dbLoading, setDbLoading] = React.useState(false);
        const [tableLoading, setTableLoading] = React.useState(false);
        const [browseSupported, setBrowseSupported] = React.useState(true);

        React.useEffect(() => {
            if (isOpen) {
                setActiveTab(initialTab);
            }
        }, [isOpen, initialTab]);

        React.useEffect(() => {
            if (isOpen && activeTab === 'output') {
                fetch('/api/credentials').then(r => r.json()).then(setCredentials).catch(() => {});
            }
        }, [isOpen, activeTab]);

        const fetchDatabases = React.useCallback(async (credentialId: string) => {
            if (!credentialId) { setDatabases([]); setTables([]); setBrowseSupported(true); return; }
            setDbLoading(true);
            setBrowseSupported(true);
            try {
                const res = await fetch(`/api/credentials/${credentialId}/proxy/baserow/databases`);
                if (res.ok) {
                    const dbs = await res.json();
                    setDatabases(dbs);
                    setBrowseSupported(true);
                } else {
                    setDatabases([]);
                    setBrowseSupported(false);
                }
            } catch { setDatabases([]); setBrowseSupported(false); } finally { setDbLoading(false); }
        }, []);

        const fetchTables = React.useCallback(async (credentialId: string, databaseId: string) => {
            if (!credentialId || !databaseId) { setTables([]); return; }
            setTableLoading(true);
            try {
                const res = await fetch(`/api/credentials/${credentialId}/proxy/baserow/databases/${databaseId}/tables`);
                if (res.ok) setTables(await res.json());
                else setTables([]);
            } catch { setTables([]); } finally { setTableLoading(false); }
        }, []);

        // Auto-load databases when credential changes
        React.useEffect(() => {
            if (currentTask.output?.credentialId) {
                fetchDatabases(currentTask.output.credentialId);
            } else {
                setDatabases([]);
                setTables([]);
            }
        }, [currentTask.output?.credentialId, fetchDatabases]);

        // Auto-load tables when database changes
        React.useEffect(() => {
            if (currentTask.output?.credentialId && currentTask.output?.databaseId) {
                fetchTables(currentTask.output.credentialId, currentTask.output.databaseId);
            } else {
                setTables([]);
            }
        }, [currentTask.output?.databaseId, currentTask.output?.credentialId, fetchTables]);

        const saveNewCredential = async () => {
            if (!newCred.name || !newCred.token) return;
            setCredSaving(true);
            try {
                const resp = await fetch('/api/credentials', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newCred.name, provider: 'baserow', config: { baseUrl: newCred.baseUrl, token: newCred.token } })
                });
                if (resp.ok) {
                    const created = await resp.json();
                    setCredentials(prev => [...prev, created]);
                    setNewCred({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
                    setShowNewCredForm(false);
                    if (!currentTask.output?.credentialId) {
                        onUpdateTask({ output: { ...currentTask.output as TaskOutput, credentialId: created.id, provider: 'baserow', tableId: currentTask.output?.tableId || '', onError: currentTask.output?.onError || 'ignore' } });
                    }
                }
            } finally {
                setCredSaving(false);
            }
        };

        const deleteCredential = async (id: string) => {
            await fetch(`/api/credentials/${id}`, { method: 'DELETE' });
            setCredentials(prev => prev.filter(c => c.id !== id));
            if (currentTask.output?.credentialId === id) {
                onUpdateTask({ output: { ...currentTask.output as TaskOutput, credentialId: '' } });
            }
        };

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
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${activeTab === id
                    ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] shadow-lg shadow-black/10 focus-visible:ring-blue-500'
                    : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-[var(--app-glass-card-hover)] focus-visible:ring-white/50'
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
                <div className="relative h-full w-full glass border-l theme-border shadow-[-20px_0_50px_rgba(0,0,0,0.15)] flex flex-col animate-in slide-in-from-right duration-300 ease-out p-8">
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h2 className="text-xl font-bold text-[var(--app-text)] tracking-tight">Task Settings</h2>
                            <p className="text-xs text-[var(--app-text-muted)] uppercase tracking-[0.2em] mt-1">{currentTask.name || 'Untitled Task'}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[var(--app-glass-card-hover)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            aria-label="Close settings"
                            title="Close settings"
                        >
                            <MaterialIcon name="close" />
                        </button>
                    </div>

                    {/* Description — always visible regardless of active tab */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em] block mb-2">Description</label>
                        <textarea
                            value={currentTask.description || ''}
                            onChange={(e) => onUpdateTask({ description: e.target.value })}
                            placeholder="What does this task do? Give AI agents and operators context..."
                            rows={3}
                            className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2.5 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)] resize-none transition-all custom-scrollbar"
                        />
                    </div>

                    {/* Tabs Nav */}
                    <div role="tablist" className="flex flex-wrap gap-2 mb-8 bg-[var(--app-input)] p-1 rounded-2xl border border-[var(--app-border)]">
                        {renderTabButton('mode', 'Mode', 'settings_input_component')}
                        {renderTabButton('variables', 'Vars', 'data_object')}
                        {renderTabButton('behavior', 'Behavior', 'psychology')}
                        {renderTabButton('extraction', 'Extract', 'terminal')}
                        {renderTabButton('api', 'API', 'api')}
                        {renderTabButton('output', 'Output', 'table')}
                        {renderTabButton('schedule', 'Schedule', 'event_repeat')}
                        {renderTabButton('history', 'History', 'history')}
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 -mr-2">
                        {activeTab === 'mode' && (
                            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Execution Mode</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            onClick={() => onUpdateTask({ mode: 'agent' })}
                                            className={`p-4 rounded-2xl border transition-all text-left space-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.mode === 'agent'
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] ring-1 ring-[var(--app-border-strong)]'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] opacity-50 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--app-input)] flex items-center justify-center">
                                                <MaterialIcon name="smart_toy" className="text-[var(--app-text-muted)]" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-[var(--app-text)]">Agent Mode</div>
                                                <div className="text-xs text-[var(--app-text-faint)]">Custom action sequence with logic</div>
                                            </div>
                                        </button>
                                        <button
                                            onClick={() => onUpdateTask({ mode: 'scrape' })}
                                            className={`p-4 rounded-2xl border transition-all text-left space-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.mode === 'scrape'
                                                ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] ring-1 ring-[var(--app-border-strong)]'
                                                : 'bg-[var(--app-surface-3)] border-[var(--app-border)] opacity-50 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                }`}
                                        >
                                            <div className="w-8 h-8 rounded-full bg-[var(--app-input)] flex items-center justify-center">
                                                <MaterialIcon name="api" className="text-[var(--app-text-muted)]" />
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-[var(--app-text)]">Scrape Mode</div>
                                                <div className="text-xs text-[var(--app-text-faint)]">Fixed data extraction flow</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'variables' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Task Variables</label>
                                    <button
                                        onClick={addVariable}
                                        className="px-3 py-1 rounded-lg bg-[var(--app-surface-3)] text-[var(--app-text)] text-xs font-bold uppercase tracking-wider hover:bg-[var(--app-surface-2)] transition-all border border-[var(--app-border)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    >
                                        + Add Var
                                    </button>
                                </div>

                                <div className="space-y-3">
                                    {Object.entries(currentTask.variables || {}).map(([name, def]) => (
                                        <div key={name} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4 space-y-3">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    defaultValue={name}
                                                    onBlur={(e) => {
                                                        if (e.target.value !== name) updateVariable(name, e.target.value, def.type, def.value);
                                                    }}
                                                    placeholder="Name"
                                                    className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-faint)]"
                                                />
                                                <select
                                                    value={def.type}
                                                    onChange={(e) => updateVariable(name, name, e.target.value as VarType, def.value)}
                                                    className="bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-2 py-2 text-xs font-bold uppercase text-[var(--app-text-muted)]"
                                                >
                                                    <option value="string">String</option>
                                                    <option value="number">Number</option>
                                                    <option value="boolean">Bool</option>
                                                </select>
                                                <button
                                                    onClick={() => removeVariable(name)}
                                                    className="text-red-500/70 hover:text-red-500 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
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
                                                        className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-xs text-[var(--app-text)]"
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
                                                        className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-xl px-3 py-2 text-xs text-[var(--app-text)]"
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    {Object.keys(currentTask.variables || {}).length === 0 && (
                                        <div className="text-center py-12 border border-dashed border-[var(--app-border)] rounded-3xl">
                                            <p className="text-xs text-[var(--app-text-faint)] uppercase tracking-widest">No variables defined</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'behavior' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Runtime Flags</label>
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
                                                className={`flex items-center justify-between p-4 rounded-2xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask[item.key as keyof Task]
                                                    ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)]'
                                                    : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] opacity-60 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                    } ${item.disabled ? 'opacity-20 cursor-not-allowed' : ''}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <MaterialIcon name={item.icon} className="text-sm opacity-70" />
                                                    <span className="text-xs font-medium">{item.label}</span>
                                                </div>
                                                <div className={`w-8 h-4 rounded-full relative transition-colors ${currentTask[item.key as keyof Task] ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}>
                                                    <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask[item.key as keyof Task] ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Stealth & Behavior</label>
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
                                                className={`flex flex-col gap-2 p-4 rounded-2xl border transition-all text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentTask.stealth[item.key as keyof Task['stealth']]
                                                    ? 'bg-[var(--app-surface-2)] border-[var(--app-border-strong)] text-[var(--app-text)]'
                                                    : 'bg-[var(--app-surface-3)] border-[var(--app-border)] text-[var(--app-text-muted)] opacity-60 hover:opacity-100 hover:border-[var(--app-border-strong)]'
                                                    }`}
                                            >
                                                <MaterialIcon name={item.icon} className="text-sm opacity-70" />
                                                <span className="text-xs font-bold uppercase tracking-tight">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'extraction' && (() => {
                            const extractionMode: 'visual' | 'javascript' = currentTask.extractionMode
                                || (currentTask.extractionScript && !(currentTask.extractionFields && currentTask.extractionFields.length) ? 'javascript' : 'visual');
                            const fields = currentTask.extractionFields || [];
                            const groups = currentTask.extractionGroups || [];

                            const setFields = (next: ExtractionField[]) => {
                                onUpdateTask({ extractionFields: next, extractionScript: generateExtractionScript(next, groups) });
                            };
                            const addField = () => {
                                setFields([...fields, { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' }]);
                            };
                            const updateField = (id: string, updates: Partial<ExtractionField>) => {
                                setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
                            };
                            const removeField = (id: string) => {
                                setFields(fields.filter(f => f.id !== id));
                            };
                            const switchMode = (mode: 'visual' | 'javascript') => {
                                onUpdateTask({ extractionMode: mode, extractionScript: generateExtractionScript(fields, groups) });
                            };

                            const setGroups = (next: ExtractionGroup[]) => {
                                onUpdateTask({ extractionGroups: next, extractionScript: generateExtractionScript(fields, next) });
                            };
                            const addGroup = () => {
                                setGroups([...groups, { id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', containerSelector: '', fields: [] }]);
                            };
                            const updateGroup = (id: string, updates: Partial<ExtractionGroup>) => {
                                setGroups(groups.map(g => g.id === id ? { ...g, ...updates } : g));
                            };
                            const removeGroup = (id: string) => {
                                setGroups(groups.filter(g => g.id !== id));
                            };
                            const addGroupField = (groupId: string) => {
                                const group = groups.find(g => g.id === groupId);
                                if (!group) return;
                                updateGroup(groupId, { fields: [...group.fields, { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' }] });
                            };
                            const updateGroupField = (groupId: string, fieldId: string, updates: Partial<ExtractionField>) => {
                                const group = groups.find(g => g.id === groupId);
                                if (!group) return;
                                updateGroup(groupId, { fields: group.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) });
                            };
                            const removeGroupField = (groupId: string, fieldId: string) => {
                                const group = groups.find(g => g.id === groupId);
                                if (!group) return;
                                updateGroup(groupId, { fields: group.fields.filter(f => f.id !== fieldId) });
                            };

                            return (
                                <div className="space-y-6 h-full flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="space-y-4 flex-1 flex flex-col min-h-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1 bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-lg p-1">
                                                {(['visual', 'javascript'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        onClick={() => switchMode(mode)}
                                                        className={`px-3 py-1 rounded-md text-xs font-bold uppercase tracking-tight transition-all ${extractionMode === mode
                                                            ? 'bg-[var(--app-text)] text-[var(--app-bg)] shadow-sm'
                                                            : 'text-[var(--app-text-muted)] hover:text-[var(--app-text)]'
                                                            }`}
                                                    >
                                                        {mode === 'visual' ? 'Visual' : 'JavaScript'}
                                                    </button>
                                                ))}
                                            </div>
                                            <select
                                                value={currentTask.extractionFormat || 'json'}
                                                onChange={(e) => onUpdateTask({ extractionFormat: e.target.value as any })}
                                                className="bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs font-bold uppercase text-[var(--app-text-muted)]"
                                            >
                                                <option value="json">JSON</option>
                                                <option value="csv">CSV</option>
                                            </select>
                                        </div>

                                        {extractionMode === 'visual' ? (
                                            <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0">
                                                {fields.length === 0 && (
                                                    <div className="text-xs text-[var(--app-text-muted)] bg-[var(--app-surface-3)] border border-dashed border-[var(--app-border)] rounded-2xl p-6 text-center">
                                                        No fields yet. Add a field, then use the target icon to pick its selector from the page.
                                                    </div>
                                                )}
                                                {fields.map(field => (
                                                    <div key={field.id} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-3 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                value={field.name}
                                                                onChange={(e) => updateField(field.id, { name: e.target.value })}
                                                                placeholder="fieldName"
                                                                className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                            />
                                                            <button
                                                                onClick={() => removeField(field.id)}
                                                                className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors shrink-0"
                                                                title="Remove field"
                                                                aria-label="Remove field"
                                                            >
                                                                <MaterialIcon name="close" className="text-base" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--app-border-strong)]">
                                                                <RichInput
                                                                    value={field.selector}
                                                                    onChange={(v) => updateField(field.id, { selector: v })}
                                                                    variables={currentTask.variables}
                                                                    placeholder=".price, h1.title, ..."
                                                                    className="text-xs"
                                                                />
                                                            </div>
                                                            {onStartFieldInspect && (
                                                                <button
                                                                    onClick={() => onStartFieldInspect(field.id)}
                                                                    className="text-[var(--app-text)] opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                    title="Pick Selector in Browser"
                                                                    aria-label="Pick Selector in Browser"
                                                                >
                                                                    <MaterialIcon name="my_location" className="text-lg" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {fieldSelectorOptionsById?.[taskFieldInspectId(field.id)] && fieldSelectorOptionsById[taskFieldInspectId(field.id)].length > 1 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {fieldSelectorOptionsById[taskFieldInspectId(field.id)].map((opt, i) => (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => updateField(field.id, { selector: opt })}
                                                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${field.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <select
                                                                value={field.attribute}
                                                                onChange={(e) => updateField(field.id, { attribute: e.target.value as ExtractionField['attribute'] })}
                                                                className="bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs text-[var(--app-text-muted)]"
                                                            >
                                                                <option value="text">Text</option>
                                                                <option value="html">HTML</option>
                                                                <option value="value">Input Value</option>
                                                                <option value="attr">Attribute</option>
                                                                <option value="image">Image URL</option>
                                                                <option value="link">Link URL</option>
                                                                <option value="exists">Exists (true/false)</option>
                                                            </select>
                                                            {field.attribute === 'attr' && (
                                                                <input
                                                                    value={field.attrName || ''}
                                                                    onChange={(e) => updateField(field.id, { attrName: e.target.value })}
                                                                    placeholder="href"
                                                                    className="w-24 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs font-mono text-[var(--app-text)]"
                                                                />
                                                            )}
                                                            {field.attribute !== 'exists' && (
                                                                <label className="flex items-center gap-1.5 text-xs text-[var(--app-text-muted)] cursor-pointer ml-auto">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={!!field.multiple}
                                                                        onChange={(e) => updateField(field.id, { multiple: e.target.checked })}
                                                                        className="accent-current"
                                                                    />
                                                                    Multiple (list)
                                                                </label>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={addField}
                                                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-[var(--app-border)] text-xs font-bold uppercase tracking-tight text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] transition-colors"
                                                >
                                                    <MaterialIcon name="add" className="text-base" />
                                                    Add Field
                                                </button>

                                                <div className="pt-2 mt-2 border-t border-dashed border-[var(--app-border)] space-y-3">
                                                    <div>
                                                        <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Repeating Groups</label>
                                                        <p className="text-xs text-[var(--app-text-faint)] mt-0.5">One row per matched container — e.g. every product card on a search results page — with a column per sub-field. Produces a multi-row CSV.</p>
                                                    </div>
                                                    {groups.map(group => (
                                                        <div key={group.id} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-3 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    value={group.name}
                                                                    onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                                                                    placeholder="groupName (e.g. products)"
                                                                    className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                                />
                                                                <button
                                                                    onClick={() => removeGroup(group.id)}
                                                                    className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors shrink-0"
                                                                    title="Remove group"
                                                                    aria-label="Remove group"
                                                                >
                                                                    <MaterialIcon name="close" className="text-base" />
                                                                </button>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--app-border-strong)]">
                                                                    <RichInput
                                                                        value={group.containerSelector}
                                                                        onChange={(v) => updateGroup(group.id, { containerSelector: v })}
                                                                        variables={currentTask.variables}
                                                                        placeholder="Row container, e.g. [data-component-type='s-search-result']"
                                                                        className="text-xs"
                                                                    />
                                                                </div>
                                                                {onStartGroupContainerInspect && (
                                                                    <button
                                                                        onClick={() => onStartGroupContainerInspect(group.id)}
                                                                        className="text-[var(--app-text)] opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                        title="Pick Row Container in Browser"
                                                                        aria-label="Pick Row Container in Browser"
                                                                    >
                                                                        <MaterialIcon name="my_location" className="text-lg" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {fieldSelectorOptionsById?.[taskGroupContainerInspectId(group.id)] && fieldSelectorOptionsById[taskGroupContainerInspectId(group.id)].length > 1 && (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {fieldSelectorOptionsById[taskGroupContainerInspectId(group.id)].map((opt, i) => (
                                                                        <button
                                                                            key={i}
                                                                            onClick={() => updateGroup(group.id, { containerSelector: opt })}
                                                                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${group.containerSelector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                                        >
                                                                            {opt}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <div className="pl-3 border-l-2 border-[var(--app-border)] space-y-2">
                                                                {group.fields.length === 0 && (
                                                                    <p className="text-xs text-[var(--app-text-faint)]">No columns yet. Add one for each piece of data to pull from every row (e.g. title, price).</p>
                                                                )}
                                                                {group.fields.map(field => (
                                                                    <div key={field.id} className="space-y-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <input
                                                                                value={field.name}
                                                                                onChange={(e) => updateGroupField(group.id, field.id, { name: e.target.value })}
                                                                                placeholder="columnName"
                                                                                className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                                            />
                                                                            <button
                                                                                onClick={() => removeGroupField(group.id, field.id)}
                                                                                className="text-[var(--app-text-muted)] hover:text-red-400 transition-colors shrink-0"
                                                                                title="Remove column"
                                                                                aria-label="Remove column"
                                                                            >
                                                                                <MaterialIcon name="close" className="text-base" />
                                                                            </button>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="flex-1 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1.5 focus-within:border-[var(--app-border-strong)]">
                                                                                <RichInput
                                                                                    value={field.selector}
                                                                                    onChange={(v) => updateGroupField(group.id, field.id, { selector: v })}
                                                                                    variables={currentTask.variables}
                                                                                    placeholder="Selector relative to row, e.g. h2 span"
                                                                                    className="text-xs"
                                                                                />
                                                                            </div>
                                                                            {onStartGroupFieldInspect && (
                                                                                <button
                                                                                    onClick={() => onStartGroupFieldInspect(group.id, field.id)}
                                                                                    className="text-[var(--app-text)] opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                                    title="Pick Selector in Browser (within row)"
                                                                                    aria-label="Pick Selector in Browser (within row)"
                                                                                >
                                                                                    <MaterialIcon name="my_location" className="text-lg" />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        {fieldSelectorOptionsById?.[taskGroupFieldInspectId(group.id, field.id)] && fieldSelectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].length > 1 && (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {fieldSelectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].map((opt, i) => (
                                                                                    <button
                                                                                        key={i}
                                                                                        onClick={() => updateGroupField(group.id, field.id, { selector: opt })}
                                                                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${field.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                                                    >
                                                                                        {opt}
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <select
                                                                                value={field.attribute}
                                                                                onChange={(e) => updateGroupField(group.id, field.id, { attribute: e.target.value as ExtractionField['attribute'] })}
                                                                                className="bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs text-[var(--app-text-muted)]"
                                                                            >
                                                                                <option value="text">Text</option>
                                                                                <option value="html">HTML</option>
                                                                                <option value="value">Input Value</option>
                                                                                <option value="attr">Attribute</option>
                                                                                <option value="image">Image URL</option>
                                                                                <option value="link">Link URL</option>
                                                                                <option value="exists">Exists (true/false)</option>
                                                                            </select>
                                                                            {field.attribute === 'attr' && (
                                                                                <input
                                                                                    value={field.attrName || ''}
                                                                                    onChange={(e) => updateGroupField(group.id, field.id, { attrName: e.target.value })}
                                                                                    placeholder="href"
                                                                                    className="w-24 bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-2 py-1 text-xs font-mono text-[var(--app-text)]"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                                <button
                                                                    onClick={() => addGroupField(group.id)}
                                                                    className="flex items-center justify-center gap-1.5 py-1.5 w-full rounded-lg border border-dashed border-[var(--app-border)] text-xs font-bold uppercase tracking-tight text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] transition-colors"
                                                                >
                                                                    <MaterialIcon name="add" className="text-sm" />
                                                                    Add Column
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button
                                                        onClick={addGroup}
                                                        className="flex items-center justify-center gap-1.5 py-2 w-full rounded-xl border border-dashed border-[var(--app-border)] text-xs font-bold uppercase tracking-tight text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:border-[var(--app-border-strong)] transition-colors"
                                                    >
                                                        <MaterialIcon name="add" className="text-base" />
                                                        Add Group
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex-1 bg-[var(--app-code-bg)] border border-[var(--app-border)] rounded-2xl overflow-hidden min-h-[300px]">
                                                <CodeEditor
                                                    language="javascript"
                                                    value={currentTask.extractionScript || ''}
                                                    onChange={(val) => onUpdateTask({ extractionScript: val })}
                                                    placeholder="// Example: return { title: document.title };"
                                                    className="h-full text-xs"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {activeTab === 'api' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Trigger via API</label>
                                    <div className="space-y-2">
                                        <p className="text-xs text-[var(--app-text-muted)]">Run this task from external tools using the endpoint below:</p>
                                        <div className="relative group">
                                            <div className="bg-[var(--app-code-bg)] border border-[var(--app-border)] rounded-xl p-4 pr-12 font-mono text-xs text-[var(--app-text-muted)] break-all border-dashed">
                                                POST /api/tasks/{currentTask.id}/api
                                            </div>
                                            <CopyButton
                                                text={`POST /api/tasks/${currentTask.id}/api`}
                                                className="absolute right-2 top-2 p-2 rounded-lg bg-[var(--app-surface-3)] border border-[var(--app-border)] text-[var(--app-text)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                iconClassName="text-xs"
                                                title="Copy Endpoint"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Response Options</label>
                                    <button
                                        role="switch"
                                        aria-checked={currentTask.includeHtml}
                                        onClick={() => onUpdateTask({ includeHtml: !currentTask.includeHtml })}
                                        className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--app-surface-3)] border border-[var(--app-border)] hover:bg-[var(--app-surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    >
                                        <div className="text-left">
                                            <span className="text-xs font-medium text-[var(--app-text)]">Include HTML in response</span>
                                            <p className="text-xs text-[var(--app-text-faint)] mt-0.5">When an extraction script is set, also return the raw HTML</p>
                                        </div>
                                        <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${currentTask.includeHtml ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}>
                                            <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask.includeHtml ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                        </div>
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Passing Variables</label>
                                    <div className="space-y-2">
                                        <p className="text-xs text-[var(--app-text-muted)]">You can override task variables in the request body:</p>
                                        <div className="relative group">
                                            <div className="bg-[var(--app-code-bg)] border border-[var(--app-border)] rounded-xl p-4 pr-12 font-mono text-xs text-[var(--app-text-faint)]">
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
                                                className="absolute right-2 top-2 p-2 rounded-lg bg-[var(--app-surface-3)] border border-[var(--app-border)] text-[var(--app-text)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                                                iconClassName="text-xs"
                                                title="Copy Payload"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'output' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* Enable toggle */}
                                <button
                                    role="switch"
                                    aria-checked={!!currentTask.output}
                                    onClick={() => onUpdateTask({ output: currentTask.output ? undefined : { provider: 'baserow', credentialId: '', tableId: '', onError: 'ignore' } })}
                                    className="w-full flex items-center justify-between p-3 rounded-xl bg-[var(--app-surface-3)] border border-[var(--app-border)] hover:bg-[var(--app-surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                >
                                    <div className="text-left">
                                        <span className="text-xs font-medium text-[var(--app-text)]">Push results to destination</span>
                                        <p className="text-xs text-[var(--app-text-faint)] mt-0.5">Send extracted data to an external table after each run</p>
                                    </div>
                                    <div className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${currentTask.output ? 'bg-[var(--app-accent)]' : 'bg-[var(--app-border-strong)]'}`}>
                                        <div className={`absolute top-1 w-2 h-2 rounded-full transition-all ${currentTask.output ? 'right-1 bg-[var(--app-accent-text)]' : 'left-1 bg-[var(--app-text-faint)]'}`} />
                                    </div>
                                </button>

                                {currentTask.output && (<>
                                    {/* Provider dropdown */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Provider</label>
                                        <select
                                            value={currentTask.output.provider}
                                            onChange={e => onUpdateTask({ output: { ...currentTask.output as TaskOutput, provider: e.target.value as 'baserow', credentialId: '', tableId: '' } })}
                                            className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                        >
                                            <option value="baserow">Baserow</option>
                                        </select>
                                    </div>

                                    {/* Credential picker */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Credential</label>
                                            <button
                                                onClick={() => setShowNewCredForm(v => !v)}
                                                className="text-xs font-bold text-[var(--app-text-muted)] hover:text-[var(--app-text)] transition-colors flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded"
                                            >
                                                <MaterialIcon name="add" className="text-xs" />
                                                New
                                            </button>
                                        </div>

                                        {showNewCredForm && (
                                            <div className="space-y-2 p-3 rounded-xl bg-[var(--app-surface-3)] border border-[var(--app-border)]">
                                                <input
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    placeholder="Name (e.g. My Baserow)"
                                                    value={newCred.name}
                                                    onChange={e => setNewCred(v => ({ ...v, name: e.target.value }))}
                                                />
                                                <input
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    placeholder="Base URL"
                                                    value={newCred.baseUrl}
                                                    onChange={e => setNewCred(v => ({ ...v, baseUrl: e.target.value }))}
                                                />
                                                <input
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    placeholder="API Token"
                                                    type="password"
                                                    value={newCred.token}
                                                    onChange={e => setNewCred(v => ({ ...v, token: e.target.value }))}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={saveNewCredential}
                                                        disabled={credSaving || !newCred.name || !newCred.token}
                                                        className="flex-1 py-1.5 rounded-lg bg-[var(--app-accent)] text-[var(--app-accent-text)] text-xs font-bold disabled:opacity-40 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                    >
                                                        {credSaving ? 'Saving…' : 'Save'}
                                                    </button>
                                                    <button
                                                        onClick={() => setShowNewCredForm(false)}
                                                        className="px-3 py-1.5 rounded-lg bg-[var(--app-surface-3)] text-[var(--app-text-muted)] text-xs font-bold hover:text-[var(--app-text)] border border-[var(--app-border)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {(() => {
                                            const filtered = credentials.filter(c => c.provider === currentTask.output?.provider);
                                            return filtered.length === 0 && !showNewCredForm ? (
                                                <p className="text-xs text-[var(--app-text-faint)]">No credentials yet. Click <span className="text-[var(--app-text-muted)]">+ New</span> to add one.</p>
                                            ) : (
                                                <select
                                                    value={currentTask.output.credentialId}
                                                    onChange={e => onUpdateTask({ output: { ...currentTask.output as TaskOutput, credentialId: e.target.value } })}
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                >
                                                    <option value="">Select credential…</option>
                                                    {filtered.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                            );
                                        })()}

                                        {/* Credential list with delete */}
                                        {credentials.filter(c => c.provider === currentTask.output?.provider).length > 0 && (
                                            <div className="space-y-1">
                                                {credentials.filter(c => c.provider === currentTask.output?.provider).map(c => (
                                                    <div key={c.id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[var(--app-surface-3)] border border-[var(--app-border)]">
                                                        <div>
                                                            <span className="text-xs text-[var(--app-text)]">{c.name}</span>
                                                            <span className="text-xs text-[var(--app-text-faint)] ml-2">{c.config.baseUrl}</span>
                                                        </div>
                                                        <button onClick={() => deleteCredential(c.id)} className="text-[var(--app-text-faint)] hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded">
                                                            <MaterialIcon name="delete" className="text-sm" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {currentTask.output.credentialId && browseSupported && (
                                        <>
                                            {/* Database picker */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Database</label>
                                                    {dbLoading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                                                </div>
                                                <select
                                                    value={currentTask.output.databaseId || ''}
                                                    onChange={e => onUpdateTask({ output: { ...currentTask.output as TaskOutput, databaseId: e.target.value, tableId: '' } })}
                                                    className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                    disabled={dbLoading}
                                                >
                                                    <option value="">Select database…</option>
                                                    {databases.map(db => (
                                                        <option key={db.id} value={db.id}>{db.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Table picker */}
                                            {currentTask.output.databaseId && (
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Table</label>
                                                        {tableLoading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                                                    </div>
                                                    <select
                                                        value={currentTask.output.tableId}
                                                        onChange={e => onUpdateTask({ output: { ...currentTask.output as TaskOutput, tableId: e.target.value } })}
                                                        className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                        disabled={tableLoading}
                                                    >
                                                        <option value="">Select table…</option>
                                                        {tables.map(t => (
                                                            <option key={t.id} value={t.id}>{t.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {currentTask.output.credentialId && !browseSupported && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Table ID</label>
                                            <input
                                                className="w-full bg-[var(--app-input)] border border-[var(--app-border)] rounded-lg px-3 py-2 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:border-[var(--app-border-strong)]"
                                                placeholder="e.g. 1234"
                                                value={currentTask.output.tableId}
                                                onChange={e => onUpdateTask({ output: { ...currentTask.output as TaskOutput, tableId: e.target.value } })}
                                            />
                                            <p className="text-xs text-[var(--app-text-faint)]">Your token doesn't support browsing. Use a <span className="text-[var(--app-text-muted)]">Personal API Token</span> for dropdowns, or enter the Table ID from the Baserow URL.</p>
                                        </div>
                                    )}

                                    {/* On Error */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">On Push Error</label>
                                        <div className="flex gap-2">
                                            {(['ignore', 'fail'] as const).map(val => (
                                                <button
                                                    key={val}
                                                    onClick={() => onUpdateTask({ output: { ...currentTask.output as TaskOutput, onError: val } })}
                                                    className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all focus:outline-none focus-visible:ring-2 ${currentTask.output?.onError === val ? 'bg-[var(--app-accent)] text-[var(--app-accent-text)] focus-visible:ring-blue-500' : 'bg-[var(--app-surface-3)] text-[var(--app-text-muted)] hover:text-[var(--app-text)] border border-[var(--app-border)] focus-visible:ring-white/50'}`}
                                                >
                                                    {val === 'ignore' ? 'Ignore' : 'Log Error'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-[var(--app-text-faint)]">
                                            {currentTask.output.onError === 'fail'
                                                ? 'Push errors will be logged prominently in the server console.'
                                                : 'Push errors will be silently suppressed.'}
                                        </p>
                                    </div>
                                </>)}
                            </div>
                        )}

                        {activeTab === 'schedule' && (
                            <ScheduleTab currentTask={currentTask} onUpdateTask={onUpdateTask} />
                        )}

                        {activeTab === 'history' && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-[var(--app-text-muted)] uppercase tracking-[0.2em]">Version History</label>
                                    {versionsLoading && <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />}
                                </div>

                                <div className="space-y-2">
                                    {versions.map((v) => (
                                        <div key={v.id} className="bg-[var(--app-surface-3)] border border-[var(--app-border)] rounded-2xl p-4 flex items-center justify-between group hover:border-[var(--app-border-strong)] transition-all">
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs font-bold text-[var(--app-text)] mb-0.5">{new Date(v.timestamp).toLocaleString()}</div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--app-surface-2)] text-[var(--app-text-muted)] font-bold uppercase tracking-widest">{v.mode}</span>
                                                    <span className="text-xs text-[var(--app-text-faint)] truncate max-w-[150px]">{v.name || 'Untitled'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => onPreview(v.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--app-text-faint)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-2)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    title="Preview version"
                                                    aria-label="Preview version"
                                                >
                                                    <MaterialIcon name="visibility" className="text-sm" />
                                                </button>
                                                <button
                                                    onClick={() => onRollback(v.id)}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--app-text-faint)] hover:text-[var(--app-text)] hover:bg-[var(--app-surface-2)] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    title="Rollback to this version"
                                                    aria-label="Rollback to this version"
                                                >
                                                    <MaterialIcon name="restore" className="text-sm" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {versions.length === 0 && !versionsLoading && (
                                        <div className="text-center py-12 border border-dashed border-[var(--app-border)] rounded-3xl">
                                            <p className="text-xs text-[var(--app-text-faint)] uppercase tracking-widest">No previous versions found</p>
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
