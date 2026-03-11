import React from 'react';
import MaterialIcon from './MaterialIcon';

interface SidebarProps {
    onNavigate: (screen: 'dashboard' | 'editor' | 'settings' | 'executions' | 'captures') => void;
    onNewTask: () => void;
    onLogout: () => void;
    currentScreen: 'dashboard' | 'editor' | 'settings' | 'executions' | 'captures';
}

const Sidebar: React.FC<SidebarProps> = ({ onNavigate, onNewTask, onLogout, currentScreen }) => {
    return (
        <aside className="w-20 h-full border-r border-white/10 glass flex flex-col items-center py-8 shrink-0 z-50">
            <button
                onClick={() => onNavigate('dashboard')}
                className="mb-12 hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
                aria-label="Go to Dashboard"
                title="Go to Dashboard"
            >
                <img src="/figranium_icon.svg" alt="Figranium Logo" className="w-10 h-10" onError={(e) => { e.currentTarget.src = '/figranium_icon.svg' }} />
            </button>

            <div className="flex-1 flex flex-col gap-6">
                <button
                    onClick={onNewTask}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white bg-white/5 hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="New Task"
                    aria-label="New Task"
                >
                    <MaterialIcon name="add" className="text-2xl" />
                </button>

                <button
                    onClick={() => onNavigate('dashboard')}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentScreen === 'dashboard' ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
                    title="Dashboard"
                    aria-label="Dashboard"
                >
                    <MaterialIcon name="home" className="text-2xl" />
                </button>

                <button
                    onClick={() => onNavigate('settings')}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentScreen === 'settings' ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
                    title="Settings"
                    aria-label="Settings"
                >
                    <MaterialIcon name="settings" className="text-2xl" />
                </button>
                <button
                    onClick={() => onNavigate('executions')}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentScreen === 'executions' ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
                    title="Executions"
                    aria-label="Executions"
                >
                    <MaterialIcon name="history" className="text-2xl" />
                </button>
                <button
                    onClick={() => onNavigate('captures')}
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentScreen === 'captures' ? 'bg-white/10 text-white' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
                    title="Captures"
                    aria-label="Captures"
                >
                    <MaterialIcon name="photo_camera" className="text-2xl" />
                </button>
            </div>

            <button
                onClick={onLogout}
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-gray-500 hover:bg-red-500/10 hover:text-red-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                title="Logout"
                aria-label="Logout"
            >
                <MaterialIcon name="logout" className="text-2xl" />
            </button>
        </aside>
    );
};

export default React.memo(Sidebar);
