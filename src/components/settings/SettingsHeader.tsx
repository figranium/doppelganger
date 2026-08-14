import React from 'react';
import MaterialIcon from '../MaterialIcon';

interface SettingsHeaderProps {
    tab: 'system' | 'proxies';
    onTabChange: (tab: 'system' | 'proxies') => void;
}

const TAB_ICONS = {
    system: 'settings',
    proxies: 'security'
} as const;

const SettingsHeader: React.FC<SettingsHeaderProps> = ({ tab, onTabChange }) => {
    return (
        <div className="flex items-end justify-between mb-8">
            <div className="space-y-2">
                <h2 className="text-4xl font-bold text-white">Settings</h2>
                <div className="text-xs text-gray-500 uppercase tracking-[0.2em]">
                    Configure integrations and network options
                </div>
            </div>
            <div role="tablist" className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                {(['system', 'proxies'] as const).map((t) => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => onTabChange(t)}
                        className={`px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all focus:outline-none focus-visible:ring-2 flex items-center gap-2 ${tab === t ? 'bg-white text-black focus-visible:ring-blue-500' : 'text-gray-500 hover:text-white focus-visible:ring-white/50'}`}
                    >
                        <MaterialIcon name={TAB_ICONS[t]} className="text-[14px]" />
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SettingsHeader;
