import React, { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Task } from '../types';
import MaterialIcon from './MaterialIcon';
import { copyToClipboard } from '../utils/clipboard';

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
    const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
    const [copiedItem, setCopiedItem] = useState<'share' | 'api' | null>(null);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleEnabled = !!task.schedule?.enabled;
    const lastOpened = task.last_opened
        ? new Date(task.last_opened).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
        : 'Never opened';

    useEffect(() => {
        if (!menuPosition) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuPosition(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [menuPosition]);

    useEffect(() => () => {
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    }, []);

    const copyMenuValue = async (kind: 'share' | 'api') => {
        if (!task.id) return;
        const path = kind === 'share' ? `/tasks/${task.id}` : `/api/tasks/${task.id}/api`;
        if (!await copyToClipboard(`${window.location.origin}${path}`)) return;
        setCopiedItem(kind);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedItem(null), 1600);
    };

    const menu = menuPosition ? createPortal(
        <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuPosition(null)} />
            <div
                className="fixed z-50 w-[210px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-xs font-bold uppercase tracking-widest text-white/80"
                style={{ top: menuPosition.top, right: menuPosition.right }}
                role="menu"
                aria-label={`Actions for ${task.name || 'Untitled Task'}`}
                onClick={(event) => event.stopPropagation()}
            >
                <button onClick={() => { setMenuPosition(null); onEditTask(task); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5" role="menuitem">
                    <MaterialIcon name="open_in_new" className="text-sm text-white/40" />
                    Open
                </button>
                <button onClick={() => copyMenuValue('share')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5" role="menuitem">
                    <MaterialIcon name={copiedItem === 'share' ? 'check' : 'link'} className={copiedItem === 'share' ? 'text-sm text-green-400' : 'text-sm text-white/40'} />
                    {copiedItem === 'share' ? 'Link copied' : 'Copy Link'}
                </button>
                <button onClick={() => copyMenuValue('api')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5" role="menuitem">
                    <MaterialIcon name={copiedItem === 'api' ? 'check' : 'data_object'} className={copiedItem === 'api' ? 'text-sm text-green-400' : 'text-sm text-white/40'} />
                    {copiedItem === 'api' ? 'API URL copied' : 'Copy API URL'}
                </button>
                <div className="my-1 border-t border-white/10" />
                <button onClick={() => { setMenuPosition(null); if (task.id) onDeleteTask(task.id); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-red-400 flex items-center gap-2.5" role="menuitem">
                    <MaterialIcon name="delete" className="text-sm text-red-400/70" />
                    Delete
                </button>
            </div>
        </>,
        document.body
    ) : null;

    return (
        <>
        <div
            className="app-list-row group grid grid-cols-[minmax(260px,1.7fr)_110px_100px_minmax(150px,0.8fr)_44px] items-center gap-4 px-5 py-4 max-lg:grid-cols-[minmax(240px,1fr)_100px_44px] max-sm:grid-cols-[1fr_auto] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/30"
            onClick={() => onEditTask(task)}
            onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onEditTask(task);
                }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Open ${task.name || 'Untitled Task'}`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl theme-input border theme-border flex items-center justify-center overflow-hidden shrink-0">
                    {favicon ? (
                        <img
                            src={favicon}
                            alt=""
                            className="w-6 h-6 object-contain"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    ) : (
                        <MaterialIcon name="public" className="theme-text-faint text-lg" />
                    )}
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-bold theme-text truncate" title={task.name || 'Untitled'}>{task.name || 'Untitled'}</h3>
                    <p className="mt-1 text-[11px] theme-text-faint font-mono truncate" title={task.url || 'Target undefined'}>{task.url || 'Target undefined'}</p>
                </div>
            </div>

            <div className="max-sm:hidden">
                <span className="app-badge">{task.mode}</span>
            </div>

            <div className="text-[11px] theme-text-muted max-lg:hidden">
                <span className="font-bold theme-text">{task.actions?.length || 0}</span> actions
            </div>

            <div className="min-w-0 max-lg:hidden">
                <div className="text-[11px] theme-text-muted truncate">{scheduleEnabled ? 'Scheduled' : 'Manual'}</div>
                <div className="text-[10px] theme-text-faint truncate mt-1">{lastOpened}</div>
            </div>

            <div className="flex items-center justify-end gap-2">
                <button
                    onClick={(event) => {
                        event.stopPropagation();
                        const rect = event.currentTarget.getBoundingClientRect();
                        setMenuPosition({
                            top: Math.min(rect.bottom + 6, window.innerHeight - 190),
                            right: Math.max(12, window.innerWidth - rect.right),
                        });
                    }}
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg theme-text-faint hover:theme-text transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label={`Open actions for ${task.name || 'Untitled Task'}`}
                    aria-haspopup="menu"
                    aria-expanded={!!menuPosition}
                    title="Task actions"
                >
                    <MaterialIcon name="more_vert" className="text-lg" />
                </button>
            </div>
        </div>
        {menu}
        </>
    );
};

export default memo(TaskCard);
