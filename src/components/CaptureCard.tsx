import React from 'react';
import { CaptureEntry } from '../types';
import CopyButton from './CopyButton';

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
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
                <div className="text-[9px] font-bold text-white uppercase tracking-widest">
                    {capture.type === 'recording' ? 'Recording' : 'Screenshot'}
                </div>
                <div className="flex items-center gap-2">
                    <CopyButton
                        text={fullUrl}
                        title="Copy URL"
                        className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-all"
                        iconClassName="text-sm"
                    />
                    <a
                        href={capture.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9px] font-bold uppercase tracking-widest text-blue-300 hover:text-blue-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    >
                        Open
                    </a>
                    {onDelete && (
                        <button
                            onClick={() => onDelete(capture.name)}
                            className="text-[9px] font-bold uppercase tracking-widest text-red-300 hover:text-red-200 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>
            <div className="bg-black relative group">
                {capture.type === 'recording' ? (
                    <video src={capture.url} controls className="w-full h-64 object-contain bg-black" />
                ) : (
                    <img src={capture.url} className="w-full h-64 object-contain bg-black" alt={`Screenshot of ${capture.name}`} />
                )}
            </div>
            <div className="p-3 border-t border-white/5 bg-white/[0.01]">
                <div className="text-[9px] text-white font-bold uppercase tracking-widest truncate" title={capture.name}>
                    {capture.name}
                </div>
                <div className="flex items-center justify-between mt-1 text-[8px] text-gray-500 uppercase tracking-widest">
                    <span>{formatBytes(capture.size)}</span>
                    <span>{new Date(capture.modified).toLocaleDateString()}</span>
                </div>
            </div>
        </div>
    );
};

// ⚡ Bolt: Add React.memo() to prevent unnecessary re-renders when parent lists update.
// CapturesScreen uses react-window which provides itemData with a stabilized onDelete callback.
export default React.memo(CaptureCard);
