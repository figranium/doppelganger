import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { Task } from '../../types';

interface EditorTopBarProps {
    currentTask: Task;
    onUpdateTaskName: (name: string) => void;
    onAutoSave: () => void;
    onOpenHistory: () => void;
}

const EditorTopBar: React.FC<EditorTopBarProps> = ({
    currentTask,
    onUpdateTaskName,
    onAutoSave,
    onOpenHistory,
}) => {
    return (
        <div className="fixed top-0 left-0 right-0 z-40 w-full pointer-events-none">
            <div className="glass-card flex items-center justify-between p-1 px-6 border-b border-white/10 backdrop-blur-xl pointer-events-auto">
                <div className="flex-1 overflow-hidden flex justify-center">
                    <input
                        type="text"
                        value={currentTask.name || ''}
                        onChange={(e) => onUpdateTaskName(e.target.value)}
                        onBlur={() => onAutoSave()}
                        placeholder="Task name"
                        className="bg-transparent border-none text-[11px] font-bold text-white uppercase tracking-[0.25em] focus:outline-none w-full max-w-[400px] text-center placeholder:text-white/20 py-1"
                    />
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={onOpenHistory}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        title="Version History"
                        aria-label="Version History"
                    >
                        <MaterialIcon name="history" className="text-base" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditorTopBar;
