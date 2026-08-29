import React from 'react';
import { CaptureEntry } from '../types';
import CopyButton from './CopyButton';
import MaterialIcon from './MaterialIcon';

interface CaptureCardProps {
    capture: CaptureEntry;
    onDelete?: (name: string) => void;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const CaptureCard: React.FC<CaptureCardProps> = ({ capture, onDelete }) => {
    const fullUrl = new URL(capture.url, window.location.origin).toString();

    return (
        <article className="h-full min-h-[300px] flex flex-col theme-surface-3 overflow-hidden group">
            <div className="px-4 py-3 border-b theme-border flex items-center justify-between flex-shrink-0">
                <div className="text-[10px] font-bold theme-text-muted uppercase tracking-widest flex items-center gap-1.5">
                    <MaterialIcon
                        name={capture.type === 'recording' ? 'play_circle' : 'photo_camera'}
                        className="text-xs theme-text-faint"
                    />
                    {capture.type === 'recording' ? 'Recording' : 'Screenshot'}
                </div>
                <div className="flex items-center gap-2">
                    <CopyButton
                        text={fullUrl}
                        title="Copy URL"
                        className="p-1.5 rounded-lg theme-text-faint theme-hover transition-all"
                        iconClassName="text-sm"
                    />
                    <a
                        href={capture.url}
                        download={capture.name}
                        className="p-1.5 rounded-lg theme-text-faint theme-hover transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="Download"
                        aria-label="Download capture"
                    >
                        <MaterialIcon name="download" className="text-sm" />
                    </a>
                    <a
                        href={capture.url}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 rounded-lg theme-text-faint theme-hover transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="Open in new tab"
                        aria-label="Open capture in new tab"
                    >
                        <MaterialIcon name="open_in_new" className="text-sm" />
                    </a>
                    {onDelete && (
                        <button
                            onClick={() => onDelete(capture.name)}
                            className="p-1.5 rounded-lg text-red-300 hover:text-red-200 hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            title="Delete"
                            aria-label="Delete capture"
                        >
                            <MaterialIcon name="delete" className="text-sm" />
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-black relative flex-1 min-h-[210px]">
                {capture.type === 'recording' ? (
                    <video src={capture.url} controls className="w-full h-full object-contain bg-black" />
                ) : (
                    <img src={capture.url} className="w-full h-full object-contain bg-black" alt={`Screenshot of ${capture.name}`} />
                )}
            </div>
            <div className="p-4 border-t theme-border flex-shrink-0">
                <div className="text-xs theme-text font-bold truncate" title={capture.name}>
                    {capture.name}
                </div>
                <div className="flex items-center justify-between mt-1.5 text-[10px] theme-text-faint uppercase tracking-widest">
                    <span>{formatBytes(capture.size)}</span>
                    <span>{new Date(capture.modified).toLocaleDateString()}</span>
                </div>
            </div>
        </article>
    );
};

// ⚡ Bolt: Add React.memo() to prevent unnecessary re-renders when parent lists update.
// CapturesScreen uses react-window which provides itemData with a stabilized onDelete callback.
export default React.memo(CaptureCard);
