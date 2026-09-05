import React from 'react';
import MaterialIcon from './MaterialIcon';

interface SidebarProps {
    onNavigate: (screen: 'dashboard' | 'editor' | 'settings' | 'executions' | 'captures' | 'cabinets') => void;
    onNewTask: () => void;
    onLogout: () => void;
    currentScreen: 'dashboard' | 'editor' | 'settings' | 'executions' | 'captures' | 'cabinets';
}

const Sidebar: React.FC<SidebarProps> = ({ onNavigate, onNewTask, onLogout, currentScreen }) => {
    return (
        <aside className="w-20 h-full border-r theme-border glass flex flex-col items-center py-8 shrink-0 z-50 theme-bg">
            <button
                onClick={() => onNavigate('dashboard')}
                className="mb-12 hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg"
                aria-label="Go to Dashboard (Alt + 1)"
                title="Go to Dashboard (Alt + 1)"
            >
                <img src="/figranium_icon.svg" alt="Figranium Logo" className="w-10 h-10 theme-logo" style={{ color: 'var(--app-logo)' }} onError={(e) => { e.currentTarget.src = '/figranium_icon.svg' }} />
            </button>

            <div className="flex-1 flex flex-col gap-6">
                <button
                    onClick={onNewTask}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center theme-text theme-hover transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="New Task (Alt + N)"
                    aria-label="New Task (Alt + N)"
                >
                    <MaterialIcon name="add" className="text-2xl theme-text" />
                </button>

                {([
                    ['dashboard', 'home', 'Dashboard (Alt + 1)'],
                    ['settings', 'settings', 'Settings (Alt + 2)'],
                    ['executions', 'history', 'Executions (Alt + 3)'],
                    ['captures', 'photo_camera', 'Captures (Alt + 4)'],
                    ['cabinets', 'inventory_2', 'Cabinets (Alt + 5)'],
                ] as const).map(([screen, icon, title]) => (
                    <button
                        key={screen}
                        onClick={() => onNavigate(screen)}
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${currentScreen === screen ? 'theme-highlight' : 'theme-text-faint theme-hover'}`}
                        title={title}
                        aria-label={title}
                    >
                        <MaterialIcon name={icon} className="text-2xl theme-text" />
                    </button>
                ))}
            </div>

            <button
                onClick={onLogout}
                className="w-12 h-12 rounded-2xl flex items-center justify-center theme-text-faint hover:bg-red-500/10 hover:text-red-500 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                title="Logout (Alt + L)"
                aria-label="Logout (Alt + L)"
            >
                <MaterialIcon name="logout" className="text-2xl theme-text-faint" />
            </button>
        </aside>
    );
};

export default React.memo(Sidebar);
