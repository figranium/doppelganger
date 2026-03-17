interface SettingsHeaderProps {
    tab: 'system' | 'data' | 'proxies';
    onTabChange: (tab: 'system' | 'data' | 'proxies') => void;
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({ tab, onTabChange }) => {
    return (
        <div className="flex items-end justify-between mb-8">
            <div className="space-y-2">
                <h2 className="text-4xl font-bold tracking-tighter text-white">Settings</h2>
            </div>
            <div role="tablist" className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                {(['system', 'data', 'proxies'] as const).map((t) => (
                    <button
                        key={t}
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => onTabChange(t)}
                        className={`px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all focus:outline-none focus-visible:ring-2 ${tab === t ? 'bg-white text-black focus-visible:ring-blue-500' : 'text-gray-500 hover:text-white focus-visible:ring-white/50'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SettingsHeader;
