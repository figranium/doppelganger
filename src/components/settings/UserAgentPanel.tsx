interface UserAgentPanelProps {
    selection: string;
    options: string[];
    loading: boolean;
    onChange: (selection: string) => void;
}

const UserAgentPanel: React.FC<UserAgentPanelProps> = ({
    selection,
    options,
    loading,
    onChange
}) => {
    return (
        <div className="glass-card p-8 rounded-[40px] space-y-4">
            <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-widest">User Agent</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Default browser identity</p>
            </div>
            <div className="space-y-2">
                <label htmlFor="user-agent-select" className="sr-only">Select Default User Agent</label>
                <select
                    id="user-agent-select"
                    value={selection}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={loading}
                    className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-[10px] text-white uppercase tracking-widest disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                    <option value="system">System user agent (default)</option>
                    {options.map((agent) => (
                        <option key={agent} value={agent}>
                            {agent}
                        </option>
                    ))}
                </select>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">
                    Applies when rotate UA is disabled in tasks.
                </div>
            </div>
        </div>
    );
};

export default UserAgentPanel;
