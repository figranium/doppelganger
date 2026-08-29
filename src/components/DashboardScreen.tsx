import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Execution, Task } from '../types';
import MaterialIcon from './MaterialIcon';
import TaskCard from './TaskCard';
import { normalizeTaskOutcome } from '../utils/taskOutcome';
import CustomSelect from './common/CustomSelect';

interface DashboardScreenProps {
    tasks: Task[];
    onNewTask: () => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (id: string) => void;
    onExportTasks: (taskIds?: string[]) => void;
    onImportTasks: (file: File) => void;
}

type TaskSort = 'recent' | 'name' | 'mode' | 'actions';

const DashboardScreen: React.FC<DashboardScreenProps> = ({ tasks, onNewTask, onEditTask, onDeleteTask, onExportTasks, onImportTasks }) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<TaskSort>('recent');
    const [executions, setExecutions] = useState<Execution[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/executions', { signal: controller.signal })
            .then((response) => response.ok ? response.json() : { executions: [] })
            .then((data) => setExecutions(Array.isArray(data.executions) ? data.executions : []))
            .catch((error) => {
                if (error?.name !== 'AbortError') setExecutions([]);
            });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                event.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const visibleTasks = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        const filtered = query
            ? tasks.filter((task) => (task.name || '').toLowerCase().includes(query) || (task.url || '').toLowerCase().includes(query))
            : [...tasks];

        return filtered.sort((a, b) => {
            if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'mode') return a.mode.localeCompare(b.mode);
            if (sortBy === 'actions') return (b.actions?.length || 0) - (a.actions?.length || 0);
            return (b.last_opened || 0) - (a.last_opened || 0);
        });
    }, [tasks, searchQuery, sortBy]);

    const metrics = useMemo(() => {
        let succeeded = 0;
        let failed = 0;
        let totalDuration = 0;
        for (const execution of executions) {
            const outcome = normalizeTaskOutcome(execution.outcome, execution.status);
            if (outcome === 'success') succeeded += 1;
            if (outcome === 'error' || outcome === 'crashed' || outcome === 'anti_bot') failed += 1;
            totalDuration += Number(execution.durationMs) || 0;
        }
        return [
            { label: 'Tasks', value: String(tasks.length) },
            { label: 'Executions', value: String(executions.length) },
            { label: 'Failed executions', value: String(failed) },
            { label: 'Success rate', value: executions.length ? `${Math.round((succeeded / executions.length) * 100)}%` : '0%' },
            { label: 'Average runtime', value: executions.length ? `${Math.round(totalDuration / executions.length)}ms` : '0ms' },
        ];
    }, [executions, tasks.length]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        Array.from(event.target.files || []).forEach(onImportTasks);
        event.target.value = '';
    };

    const toggleExportSelection = (taskId: string) => {
        setSelectedTaskIds((previous) => previous.includes(taskId) ? previous.filter((id) => id !== taskId) : [...previous, taskId]);
    };

    return (
        <>
            <main className="app-page custom-scrollbar animate-in fade-in duration-500">
                <div className="app-page-inner">
                    <header className="app-page-header">
                        <div>
                            <h1 className="app-page-title">Overview</h1>
                            <p className="app-page-subtitle">Your Tasks, executions, and runtime activity</p>
                        </div>
                        <div className="app-toolbar">
                            <button onClick={() => { setSelectedTaskIds([]); setIsExportModalOpen(true); }} className="app-button-secondary" title="Export Tasks">
                                <MaterialIcon name="download" className="text-base" /> Export
                            </button>
                            <button onClick={() => fileInputRef.current?.click()} className="app-button-secondary" title="Import Tasks">
                                <MaterialIcon name="upload" className="text-base" /> Import
                            </button>
                            <button onClick={onNewTask} className="app-button-primary shine-effect" aria-label="Create new Task (Alt + N)" title="Create new Task (Alt + N)">
                                <MaterialIcon name="add" className="text-base" /> Create Task
                            </button>
                            <input ref={fileInputRef} type="file" accept="application/json" multiple className="hidden" onChange={handleFileChange} />
                        </div>
                    </header>

                    <section className="app-panel app-metrics" aria-label="Task and execution overview">
                        {metrics.map((metric) => (
                            <div className="app-metric" key={metric.label}>
                                <div className="app-metric-label">{metric.label}</div>
                                <div className="app-metric-value">{metric.value}</div>
                            </div>
                        ))}
                    </section>

                    <section className="app-panel overflow-hidden">
                        <div className="app-panel-header">
                            <div>
                                <h2 className="text-sm font-bold theme-text">Tasks</h2>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] theme-text-faint">{visibleTasks.length} of {tasks.length}</p>
                            </div>
                            <div className="app-toolbar">
                                <label className="relative block w-[240px] max-sm:w-full">
                                    <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-base theme-text-faint" />
                                    <input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search Tasks…  /" className="app-input-control w-full pl-9 pr-8" aria-label="Search Tasks" />
                                    {searchQuery ? <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 theme-text-faint" aria-label="Clear search"><MaterialIcon name="close" className="text-sm" /></button> : null}
                                </label>
                                <CustomSelect
                                    value={sortBy}
                                    onChange={setSortBy}
                                    options={[
                                        { value: 'recent', label: 'Recently opened', icon: 'history' },
                                        { value: 'name', label: 'Name', icon: 'sort_by_alpha' },
                                        { value: 'mode', label: 'Mode', icon: 'category' },
                                        { value: 'actions', label: 'Action count', icon: 'format_list_numbered' },
                                    ]}
                                    className="min-w-[170px]"
                                    ariaLabel="Sort Tasks"
                                />
                            </div>
                        </div>

                        {visibleTasks.length ? (
                            <div>
                                {visibleTasks.map((task) => <TaskCard key={task.id} task={task} onEditTask={onEditTask} onDeleteTask={onDeleteTask} />)}
                            </div>
                        ) : (
                            <div className="app-empty-state">
                                <div className="app-empty-icon"><MaterialIcon name={tasks.length ? 'search_off' : 'account_tree'} className="text-2xl" /></div>
                                <div>
                                    <h3 className="text-sm font-bold theme-text">{tasks.length ? 'No matching Tasks' : 'Create your first Task'}</h3>
                                    <p className="mt-2 text-xs theme-text-faint">{tasks.length ? 'Try another search term.' : 'Build a Task in the visual editor and run it when you are ready.'}</p>
                                </div>
                                <button onClick={tasks.length ? () => setSearchQuery('') : onNewTask} className="app-button-primary">
                                    <MaterialIcon name={tasks.length ? 'close' : 'add'} className="text-base" /> {tasks.length ? 'Clear search' : 'Create Task'}
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            </main>

            {isExportModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-20 sm:pb-6">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsExportModalOpen(false)} />
                    <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full slide-up">
                        <div className="p-6 sm:p-8 shrink-0"><h3 className="text-xl font-bold text-white tracking-tight">Export Tasks</h3><p className="text-xs text-white/50 mt-2 font-mono">Select the Tasks you want to export.</p></div>
                        <div className="px-6 sm:px-8 pb-4 flex items-center gap-3 shrink-0 border-b border-white/5">
                            <button onClick={() => setSelectedTaskIds(tasks.flatMap((task) => task.id ? [task.id] : []))} className="text-xs font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300">Select All</button>
                            <span className="text-white/20">|</span>
                            <button onClick={() => setSelectedTaskIds([])} className="text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white/80">Deselect All</button>
                            <div className="flex-1" /><span className="text-xs font-mono text-white/30">{selectedTaskIds.length} selected</span>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-2">
                            {tasks.map((task) => task.id ? (
                                <button key={task.id} onClick={() => toggleExportSelection(task.id!)} className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${selectedTaskIds.includes(task.id) ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/5 hover:border-white/10'}`}>
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${selectedTaskIds.includes(task.id) ? 'bg-blue-500 border-blue-400 text-white' : 'border-white/20'}`}>{selectedTaskIds.includes(task.id) ? <MaterialIcon name="check" className="text-[14px]" /> : null}</div>
                                    <div className="flex-1 min-w-0"><div className="text-sm font-bold text-white truncate">{task.name || 'Untitled'}</div><div className="text-xs text-white/40 font-mono truncate">{task.url || 'No URL'}</div></div>
                                </button>
                            ) : null)}
                        </div>
                        <div className="p-6 sm:p-8 bg-black/40 border-t border-white/5 flex gap-3 shrink-0">
                            <button onClick={() => setIsExportModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white text-xs font-bold uppercase tracking-widest hover:bg-white/5">Cancel</button>
                            <button onClick={() => { onExportTasks(selectedTaskIds); setIsExportModalOpen(false); }} disabled={!selectedTaskIds.length} className={`flex-1 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest ${selectedTaskIds.length ? 'bg-white text-black hover:brightness-90' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>Export ({selectedTaskIds.length})</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
};

export default memo(DashboardScreen);
