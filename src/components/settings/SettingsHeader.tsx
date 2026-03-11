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
            <div className="flex bg-white/5 rounded-xl p-1 border border-white/5">
                {(['system', 'data', 'proxies'] as const).map((t) => (
                    <button
                        key={t}
                        onClick={() => onTabChange(t)}
                        className={`px-4 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${tab === t ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                    >
                        {t}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default SettingsHeader;
