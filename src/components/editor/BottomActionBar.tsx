import React from 'react';
import MaterialIcon from '../MaterialIcon';

interface BottomActionBarProps {
    isExecuting: boolean;
    isHeadfulOpen: boolean;
    onRun: () => void;
    onStop?: () => void;
    onOpenHeadful: () => void;
    onStopHeadful?: () => void;
}

const BottomActionBar: React.FC<BottomActionBarProps> = ({
    isExecuting,
    isHeadfulOpen,
    onRun,
    onStop,
    onOpenHeadful,
    onStopHeadful,
}) => {
    return (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-[#111] border border-white/10 p-2 rounded-3xl shadow-2xl backdrop-blur-xl">
            <button
                onClick={onRun}
                disabled={isExecuting || isHeadfulOpen}
                className="shine-effect bg-white text-black px-8 py-4 rounded-2xl font-bold text-[10px] tracking-[0.3em] uppercase transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title="Run Task (Ctrl + Enter)"
                aria-label="Run Task (Ctrl + Enter)"
            >
                {isExecuting ? (
                    <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : <MaterialIcon name="play_arrow" className="text-sm text-black" />}
                <span>
                    {isExecuting ? 'Running...' : 'Run Task'}
                </span>
            </button>
            {isExecuting && (
                <button
                    onClick={() => onStop?.()}
                    className="w-12 h-12 rounded-2xl border border-white/10 text-white/80 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                    title="Stop task"
                    aria-label="Stop task"
                >
                    <MaterialIcon name="stop" className="text-base" />
                </button>
            )}
            <button
                onClick={() => {
                    if (isHeadfulOpen) {
                        onStopHeadful?.();
                    } else {
                        onOpenHeadful();
                    }
                }}
                disabled={isExecuting}
                className={`px-4 h-12 rounded-2xl border text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed ${isHeadfulOpen
                    ? 'border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                    : 'border-white/10 text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                title={isHeadfulOpen ? 'Stop headful browser' : 'Open browser to log in'}
            >
                <MaterialIcon name={isHeadfulOpen ? 'stop' : 'open_in_browser'} className="text-base" />
                {isHeadfulOpen ? 'Close Browser' : 'Open Browser'}
            </button>
        </div>
    );
};

export default BottomActionBar;
