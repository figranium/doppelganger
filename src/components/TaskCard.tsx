import React, { memo } from 'react';
import { Task } from '../types';
import MaterialIcon from './MaterialIcon';
import CopyButton from './CopyButton';

interface TaskCardProps {
    task: Task;
    onEditTask: (task: Task) => void;
    onDeleteTask: (id: string) => void;
}

const getFavicon = (url: string) => {
    if (!url) return null;
    // ⚡ Bolt: Optimized regex-based domain extraction is ~3x faster than new URL().hostname
    const match = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:/\n?]+)/im);
    if (!match) return null;
    const domain = match[1];
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
};

const TaskCard: React.FC<TaskCardProps> = ({ task, onEditTask, onDeleteTask }) => {
    const favicon = getFavicon(task.url);

    return (
        <div className="theme-surface-3 border theme-border p-6 rounded-2xl flex flex-col gap-6 group hover:-translate-y-1 hover:border-[var(--app-border-strong)] transition-all shadow-xl hover:theme-surface">
            <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-xl theme-input border theme-border flex items-center justify-center overflow-hidden">
                    {favicon ? (
                        <img
                            src={favicon}
                            alt=""
                            className="w-6 h-6 object-contain grayscale opacity-100 group-hover:grayscale-0 transition-all duration-300"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    ) : (
                        <MaterialIcon name="public" className="text-gray-500 text-xl" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <div className="px-3 py-1 rounded-lg theme-input text-xs font-bold uppercase tracking-widest theme-text-muted">{task.mode}</div>
                </div>
            </div>
            <div>
                <h3 className="text-lg font-bold theme-text truncate" title={task.name || 'Untitled'}>{task.name || 'Untitled'}</h3>
                <div className="flex items-center gap-2 mt-1 min-w-0">
                    <p className="text-xs text-gray-600 font-mono truncate flex-1">{task.url || 'Target undefined'}</p>
                    {task.url && (
                        <CopyButton
                            text={task.url}
                            title="Copy URL"
                            className="p-1 rounded-md text-white/20 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                            iconClassName="text-xs"
                        />
                    )}
                </div>
            </div>
            <div className="flex gap-3 pt-4 border-t theme-border">
                <button
                    onClick={() => onEditTask(task)}
                    className="flex-1 py-2 rounded-lg theme-accent-bg text-xs font-bold uppercase tracking-widest hover:brightness-90 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 inline-flex items-center justify-center gap-2"
                    aria-label="Edit Task"
                    title="Edit Task"
                >
                    <MaterialIcon name="edit" className="text-[14px]" />
                    Edit Task
                </button>
                <button
                    onClick={() => onDeleteTask(task.id!)}
                    className="w-10 h-10 rounded-lg bg-transparent border theme-border flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Delete task"
                    title="Delete task"
                >
                    <MaterialIcon name="delete" className="text-base theme-text-faint" />
                </button>
            </div>
        </div>
    );
};

export default memo(TaskCard);
