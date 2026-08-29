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
        <div className="app-panel p-7 space-y-4">
            <div>
                <h3 className="text-sm font-bold theme-text">User Agent</h3>
                <p className="text-xs theme-text-faint mt-1">Default browser identity</p>
            </div>
            <div className="space-y-2">
                <label htmlFor="user-agent-select" className="sr-only">Select Default User Agent</label>
                <CustomSelect
                    value={selection}
                    onChange={onChange}
                    disabled={loading}
                    options={[{ value: 'system', label: 'System user agent (default)' }, ...options.map((agent) => ({ value: agent, label: agent }))]}
                    ariaLabel="Select Default User Agent"
                />
                <div className="text-xs theme-text-faint">
                    Applies when rotate UA is disabled in tasks.
                </div>
            </div>
        </div>
    );
};

export default UserAgentPanel;
import CustomSelect from '../common/CustomSelect';
