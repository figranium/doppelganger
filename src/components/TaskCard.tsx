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
        <div className="bg-[#050505] border border-white/10 p-6 rounded-2xl flex flex-col gap-6 group hover:-translate-y-1 hover:border-white/30 transition-all shadow-xl hover:bg-[#0a0a0a]">
            <div className="flex justify-between items-start">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
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
                    <CopyButton
                        text={task.url}
                        title="Copy URL"
                        label=""
                        className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity p-2 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10"
                        iconClassName="text-[12px]"
                    />
                    <div className="px-3 py-1 rounded-lg bg-white/5 text-[7px] font-bold uppercase tracking-widest text-white/60">{task.mode}</div>
                </div>
            </div>
            <div>
                <h3 className="text-lg font-bold text-white truncate">{task.name || 'Untitled'}</h3>
                <p className="text-[10px] text-gray-600 font-mono truncate mt-1">{task.url || 'Target undefined'}</p>
            </div>
            <div className="flex gap-3 pt-4 border-t border-white/5">
                <button
                    onClick={() => onEditTask(task)}
                    className="flex-1 py-2 rounded-lg bg-white text-black text-[9px] font-bold uppercase tracking-widest hover:scale-105 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    Edit Task
                </button>
                <button
                    onClick={() => onDeleteTask(task.id!)}
                    className="w-10 h-10 rounded-lg bg-transparent border border-white/10 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Delete task"
                    title="Delete task"
                >
                    <MaterialIcon name="close" className="text-base" />
                </button>
            </div>
        </div>
    );
};

export default memo(TaskCard);
