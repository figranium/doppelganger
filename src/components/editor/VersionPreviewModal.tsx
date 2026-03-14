import React from 'react';
import { Task } from '../../types';
import CodeEditor from '../CodeEditor';

interface VersionPreviewModalProps {
    versionPreview: { id: string; timestamp: number; snapshot: Task } | null;
    onClose: () => void;
    onRunSnapshot: (task: Task) => void;
}

const VersionPreviewModal: React.FC<VersionPreviewModalProps> = ({
    versionPreview,
    onClose,
    onRunSnapshot,
}) => {
    if (!versionPreview) return null;

    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
            <div className="glass-card w-full max-w-6xl rounded-[32px] border border-white/10 p-8 shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                    <div className="space-y-1">
                        <div className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.3em]">Task Snapshot</div>
                        <div className="text-lg font-bold text-white">{versionPreview.snapshot.name}</div>
                        <div className="text-[8px] text-gray-500 uppercase tracking-[0.2em]">
                            {new Date(versionPreview.timestamp).toLocaleString()} | {versionPreview.snapshot.mode}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                onRunSnapshot(versionPreview.snapshot);
                                onClose();
                            }}
                            className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-xl bg-white text-black hover:bg-white/90 transition-all"
                        >
                            Run Version
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-2 flex-1 min-h-0">
                    <div className="space-y-2">
                        <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Snapshot JSON</div>
                        <CodeEditor
                            readOnly
                            value={JSON.stringify(versionPreview.snapshot, null, 2)}
                            language="json"
                            className="min-h-[320px]"
                        />
                    </div>
                    <div className="space-y-2">
                        <div className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">Output</div>
                        <div className="glass-card rounded-2xl p-6 border border-white/10 text-[10px] text-gray-500">
                            No output captured for this snapshot yet. Run this version to see results.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VersionPreviewModal;
