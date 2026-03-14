import React from 'react';
import MaterialIcon from '../MaterialIcon';
import ResultsPane from './ResultsPane';
import { Results, ConfirmRequest } from '../../types';

interface ResultsDrawerProps {
    isOpen: boolean;
    onToggle: () => void;
    results: Results | null;
    pinnedResults?: Results | null;
    isExecuting: boolean;
    isHeadfulOpen: boolean;
    runId?: string | null;
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
    onPinResults?: (results: Results) => void;
    onUnpinResults?: () => void;
    useNovnc?: boolean | null;
}

const ResultsDrawer: React.FC<ResultsDrawerProps> = ({
    isOpen,
    onToggle,
    results,
    pinnedResults,
    isExecuting,
    isHeadfulOpen,
    runId,
    onConfirm,
    onNotify,
    onPinResults,
    onUnpinResults,
    useNovnc,
}) => {
    return (
        <div
            className={`fixed top-0 right-0 h-full w-[600px] max-w-[90vw] bg-[#080808] border-l border-white/10 shadow-2xl transition-transform duration-500 ease-in-out z-40 transform ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        >
            <button
                onClick={onToggle}
                className={`absolute top-1/2 -left-8 -translate-y-1/2 w-8 h-24 bg-[#111] border border-r-0 border-white/10 rounded-l-xl flex items-center justify-center cursor-pointer shadow-[-8px_0_15px_rgba(0,0,0,0.5)] transition-all hover:bg-white/5 hover:w-10 hover:-left-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
                aria-label={isOpen ? "Close Results Drawer" : "Open Results Drawer"}
                title={isOpen ? "Close Results Drawer" : "Open Results Drawer"}
            >
                <MaterialIcon name="drag_indicator" className={`text-white/30 text-xl transition-transform duration-500 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className="h-full w-full overflow-y-auto custom-scrollbar p-6">
                <ResultsPane
                    results={results}
                    pinnedResults={pinnedResults}
                    isExecuting={isExecuting}
                    isHeadful={isHeadfulOpen}
                    runId={runId}
                    onConfirm={onConfirm}
                    onNotify={onNotify}
                    onPin={onPinResults}
                    onUnpin={onUnpinResults}
                    fullWidth={true}
                    useNovnc={useNovnc}
                />
            </div>
        </div>
    );
};

export default ResultsDrawer;
