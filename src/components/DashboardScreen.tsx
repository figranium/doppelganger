import React, { useRef, memo } from 'react';
import { Task } from '../types';
import MaterialIcon from './MaterialIcon';
import TaskCard from './TaskCard';

interface DashboardScreenProps {
    tasks: Task[];
    onNewTask: () => void;
    onEditTask: (task: Task) => void;
    onDeleteTask: (id: string) => void;
    onExportTasks: (taskIds?: string[]) => void;
    onImportTasks: (file: File) => void;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ tasks, onNewTask, onEditTask, onDeleteTask, onExportTasks, onImportTasks }) => {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = React.useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = React.useState<string[]>([]);
    const [searchQuery, setSearchQuery] = React.useState('');

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const filteredTasks = React.useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return tasks;
        return tasks.filter(task =>
            (task.name || '').toLowerCase().includes(query) ||
            (task.url || '').toLowerCase().includes(query)
        );
    }, [tasks, searchQuery]);

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (files.length > 0) {
            files.forEach(file => onImportTasks(file));
        }
        event.target.value = '';
    };

    const toggleExportSelection = (taskId: string) => {
        setSelectedTaskIds((prev) =>
            prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
        );
    };

    return (
        <>
            <div className="flex-1 overflow-hidden animate-in fade-in duration-500 theme-bg">
                <div className="h-full flex flex-col px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-8 md:space-y-12 w-full">
                    <div className="relative flex flex-wrap items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <h2 className="text-2xl font-medium tracking-[0.25em] theme-text uppercase shrink-0">Dashboard</h2>
                        </div>
                        <div className="flex items-center gap-5">
                            {tasks.length > 0 && (
                                <div className="relative w-full sm:w-[220px] group/search">
                                    <MaterialIcon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 theme-text-faint text-base group-focus-within/search:theme-text transition-colors" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Filter tasks... (/)"
                                        className="w-full theme-input border theme-border rounded-2xl py-2.5 pl-10 pr-8 text-xs font-bold uppercase tracking-widest theme-text placeholder:text-gray-600 focus:outline-none focus:border-[var(--app-border-strong)] focus-visible:ring-2 focus-visible:ring-white/20 transition-all"
                                        aria-label="Filter tasks"
                                        title="Filter tasks by name or URL (/)"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 theme-text-faint hover:theme-text transition-colors"
                                            aria-label="Clear filter"
                                            title="Clear filter"
                                        >
                                            <MaterialIcon name="cancel" className="text-base" />
                                        </button>
                                    )}
                                </div>
                            )}
                            <button
                                onClick={() => {
                                    setSelectedTaskIds([]);
                                    setIsExportModalOpen(true);
                                }}
                                className="px-5 py-3 rounded-2xl border border-white/10 text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                title="Export tasks"
                                aria-label="Export tasks"
                            >
                                <MaterialIcon name="download" className="w-4 h-4 inline-block mr-2 text-[16px] align-sub" />
                                Export
                            </button>
                            <button
                                onClick={handleImportClick}
                                className="px-5 py-3 rounded-2xl border border-white/10 text-white text-xs font-bold uppercase tracking-[0.3em] hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                title="Import tasks"
                                aria-label="Import tasks"
                            >
                                <MaterialIcon name="upload" className="w-4 h-4 inline-block mr-2 text-[16px] align-sub" />
                                Import
                            </button>
                            <button
                                onClick={onNewTask}
                                className="shine-effect bg-white text-black px-9 py-3 rounded-2xl font-bold text-xs tracking-[0.2em] uppercase transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center gap-2"
                                aria-label="Create new task (Alt + N)"
                                title="Create new task (Alt + N)"
                            >
                                <MaterialIcon name="add" className="text-[16px]" />
                                New Task
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="application/json"
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                            />
                        </div>
                    </div>

                    <div className="relative flex-1 min-h-0">
                        <div className="pointer-events-none absolute top-0 left-0 right-0 h-10 bg-gradient-to-b from-theme-bg via-theme-bg/50 to-transparent z-10" />
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 content-start gap-6 overflow-y-auto custom-scrollbar pb-12 pr-4 h-full">
                            {searchQuery && filteredTasks.length === 0 && (
                                <div className="col-span-full py-20 flex flex-col items-center justify-center text-center space-y-4">
                                    <MaterialIcon name="search_off" className="text-5xl text-white/10" />
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">No matching tasks</p>
                                        <p className="text-xs text-gray-600">Try a different search term or clear the filter.</p>
                                    </div>
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="text-xs font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                                    >
                                        Clear Filter
                                    </button>
                                </div>
                            )}
                            {filteredTasks.map(task => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    onEditTask={onEditTask}
                                    onDeleteTask={onDeleteTask}
                                />
                            ))}
                        </div>
                    </div>

                    {tasks.length === 0 && (
                        <div className="flex-1 flex flex-col items-center justify-center">
                            <button
                                onClick={onNewTask}
                                className="w-full max-w-[400px] bg-[#0a0a0a] border border-dashed border-white/15 rounded-2xl p-8 hover:border-white/30 hover:bg-white/[0.03] transition-all flex flex-col items-center justify-center gap-4 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                title="Create first task"
                                aria-label="Create first task"
                            >
                                <div className="w-12 h-12 rounded-xl bg-white/5 group-hover:bg-white/10 transition-all flex items-center justify-center border border-white/5">
                                    <MaterialIcon name="add" className="text-3xl text-gray-500 group-hover:text-white transition-colors" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70 group-hover:text-white transition-colors">Create First Task</p>
                                    <p className="text-xs text-gray-500 max-w-[250px] mx-auto leading-relaxed group-hover:text-gray-400 transition-colors">
                                        Get started by creating your first automation task. This will open the visual editor.
                                    </p>
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {
                isExportModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-20 sm:pb-6">
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsExportModalOpen(false)} />
                        <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-full slide-up">
                            <div className="p-6 sm:p-8 shrink-0">
                                <h3 className="text-xl font-bold text-white tracking-tight">Export Tasks</h3>
                                <p className="text-xs text-white/50 mt-2 font-mono">
                                    Select the tasks you want to export.
                                </p>
                            </div>

                            <div className="px-6 sm:px-8 pb-4 flex items-center gap-3 shrink-0 border-b border-white/5">
                                <button
                                    onClick={() => setSelectedTaskIds(tasks.map(t => t.id!))}
                                    className="text-xs font-bold uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    Select All
                                </button>
                                <span className="text-white/20">|</span>
                                <button
                                    onClick={() => setSelectedTaskIds([])}
                                    className="text-xs font-bold uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
                                >
                                    Deselect All
                                </button>
                                <div className="flex-1" />
                                <span className="text-xs font-mono text-white/30">{selectedTaskIds.length} selected</span>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 space-y-2">
                                {tasks.map(task => (
                                    <button
                                        key={task.id}
                                        onClick={() => toggleExportSelection(task.id!)}
                                        className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${selectedTaskIds.includes(task.id!) ? 'bg-blue-500/10 border-blue-500/30' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                                    >
                                        <div className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${selectedTaskIds.includes(task.id!) ? 'bg-blue-500 border-blue-400 text-white' : 'border-white/20'}`}>
                                            {selectedTaskIds.includes(task.id!) && <MaterialIcon name="check" className="text-[14px]" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-white truncate">{task.name || 'Untitled'}</div>
                                            <div className="text-xs text-white/40 font-mono truncate">{task.url || 'No URL'}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            <div className="p-6 sm:p-8 bg-black/40 border-t border-white/5 flex gap-3 shrink-0">
                                <button
                                    onClick={() => setIsExportModalOpen(false)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white text-xs font-bold uppercase tracking-widest hover:bg-white/5 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onExportTasks(selectedTaskIds);
                                        setIsExportModalOpen(false);
                                    }}
                                    disabled={selectedTaskIds.length === 0}
                                    className={`flex-1 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${selectedTaskIds.length > 0 ? 'bg-white text-black hover:brightness-90' : 'bg-white/10 text-white/30 cursor-not-allowed'}`}
                                >
                                    Export ({selectedTaskIds.length})
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </>
    )
};

export default memo(DashboardScreen);
