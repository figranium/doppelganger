import React, { useRef } from 'react';
import MaterialIcon from '../MaterialIcon';

interface HeadfulModalProps {
    isHeadfulOpen: boolean;
    isInspectMode: boolean;
    isInspectLoading: boolean;
    isExecuting: boolean;
    useNovnc?: boolean | null;
    onToggleInspect: () => void;
    onStopHeadful: () => void;
}

const HeadfulModal: React.FC<HeadfulModalProps> = ({
    isHeadfulOpen,
    isInspectMode,
    isInspectLoading,
    isExecuting,
    useNovnc,
    onToggleInspect,
    onStopHeadful,
}) => {
    const headfulFrameRef = useRef<HTMLDivElement | null>(null);

    if (!isHeadfulOpen) return null;

    const { origin, hostname } = window.location;
    const headfulUrl = `${origin}/novnc.html?host=${hostname}&path=websockify`;

    const requestFullscreen = () => {
        const target = headfulFrameRef.current;
        if (!target) return;
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => { });
            return;
        }
        target.requestFullscreen?.().catch(() => { });
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-md flex items-center justify-center p-8 pointer-events-auto">
            <div className="w-full h-full max-w-6xl max-h-[800px] bg-black/60 backdrop-blur-3xl border border-white/20 rounded-[32px] shadow-2xl overflow-hidden flex flex-col">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-white/10 bg-black/20 gap-4">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white">Active Browser Session</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onToggleInspect}
                            disabled={isInspectLoading || isExecuting}
                            className={`px-3 py-1.5 rounded-xl border text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${isInspectMode
                                ? 'border-green-500/30 bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                : 'border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}
                            title={isInspectMode ? 'Stop inspecting elements' : 'Highlight elements on hover'}
                        >
                            {isInspectLoading ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <MaterialIcon name={isInspectMode ? 'visibility_off' : 'center_focus_strong'} className="text-[14px]" />
                            )}
                            {isInspectMode ? 'Stop Inspect' : 'Inspect UI'}
                        </button>
                        <button
                            type="button"
                            onClick={requestFullscreen}
                            className="p-2 text-white/60 hover:text-white transition-colors"
                            title="Toggle fullscreen"
                        >
                            <MaterialIcon name="fullscreen" className="text-[16px]" />
                        </button>
                        <button
                            type="button"
                            onClick={onStopHeadful}
                            className="p-2 text-white/60 hover:text-white transition-colors"
                            title="Close Browser"
                        >
                            <MaterialIcon name="close" className="text-[16px]" />
                        </button>
                    </div>
                </div>
                <div ref={headfulFrameRef} className="flex-1 relative bg-black flex items-center justify-center">
                    {useNovnc === false ? (
                        <div className="text-center p-8">
                            <MaterialIcon name="open_in_new" className="text-6xl text-white/20 mb-4 block" />
                            <h3 className="text-white text-lg font-bold mb-2">Browser Opened Natively</h3>
                            <p className="text-white/60 text-sm max-w-md mx-auto leading-relaxed mb-6">
                                The headful browser has been launched in a separate window on your desktop.
                                Use that window to pick selectors. It will automatically sync back here.
                            </p>
                            <div className="text-[11px] text-amber-500/80 max-w-md mx-auto bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-left">
                                <div className="flex items-center gap-2 mb-2 font-bold uppercase tracking-widest text-amber-500">
                                    <MaterialIcon name="warning" className="text-base" />
                                    <span>Warning</span>
                                </div>
                                Figranium is not optimized for native browser windows. On <strong>Wayland displays</strong>, you <strong>HAVE TO use Docker</strong>, or you will have to deal with the problems of a physical browser losing focus or failing to capture clicks.<br /><br />
                                For maximum stability, please install the proper tools (Xvfb, x11vnc, websockify) or use the official Docker image.
                            </div>
                        </div>
                    ) : (
                        <iframe
                            src={headfulUrl}
                            className="absolute inset-0 w-full h-full border-0"
                            title="Headful Browser"
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default HeadfulModal;
