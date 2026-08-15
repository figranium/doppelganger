import { useRef, useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { PanelShell, LoadingState, EmptyState } from '../common/ListState';

interface ProxyEntry {
    id: string;
    server: string;
    username?: string;
    password?: string;
    label?: string;
    isRotatingPool?: boolean;
    estimatedPoolSize?: number;
}

const getProxyDisplayLabel = (proxy: ProxyEntry) => {
    if (proxy.label) return proxy.label;
    try {
        return new URL(proxy.server).host;
    } catch {
        return proxy.server;
    }
};

interface ProxiesPanelProps {
    proxies: ProxyEntry[];
    defaultProxyId: string | null;
    includeDefaultInRotation: boolean;
    rotationMode: 'round-robin' | 'random';
    loading: boolean;
    onRefresh: () => void;
    onAdd: (entry: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }) => void;
    onImport: (entries: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }[]) => void;
    onUpdate: (id: string, entry: { server: string; username?: string; password?: string; label?: string; isRotatingPool?: boolean; estimatedPoolSize?: number }) => void;
    onDelete: (id: string) => void;
    onDeleteMultiple: (ids: string[]) => void;
    onSetDefault: (id: string | null) => void;
    onToggleIncludeDefault: (enabled: boolean) => void;
    onRotationModeChange: (mode: 'round-robin' | 'random') => void;
}

const ProxiesPanel: React.FC<ProxiesPanelProps> = ({
    proxies,
    defaultProxyId,
    includeDefaultInRotation,
    rotationMode,
    loading,
    onRefresh,
    onAdd,
    onImport,
    onUpdate,
    onDelete,
    onDeleteMultiple,
    onSetDefault,
    onToggleIncludeDefault,
    onRotationModeChange
}) => {
    const [server, setServer] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [label, setLabel] = useState('');
    const [isRotatingPool, setIsRotatingPool] = useState(false);
    const [estimatedPoolSize, setEstimatedPoolSize] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editServer, setEditServer] = useState('');
    const [editUsername, setEditUsername] = useState('');
    const [editPassword, setEditPassword] = useState('');
    const [editLabel, setEditLabel] = useState('');
    const [editIsRotatingPool, setEditIsRotatingPool] = useState(false);
    const [editEstimatedPoolSize, setEditEstimatedPoolSize] = useState('');
    const [importError, setImportError] = useState('');
    const [addError, setAddError] = useState('');
    const [editError, setEditError] = useState('');
    const [selectedProxyIds, setSelectedProxyIds] = useState<Set<string>>(new Set());
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const submit = () => {
        if (!server.trim()) {
            setAddError('Server address is required.');
            return;
        }
        setAddError('');
        onAdd({
            server: server.trim(),
            username: username.trim() || undefined,
            password: password.trim() || undefined,
            label: label.trim() || undefined,
            isRotatingPool,
            estimatedPoolSize: estimatedPoolSize ? parseInt(estimatedPoolSize, 10) : undefined
        });
        setServer('');
        setUsername('');
        setPassword('');
        setLabel('');
        setIsRotatingPool(false);
        setEstimatedPoolSize('');
    };

    const startEdit = (proxy: ProxyEntry) => {
        setEditError('');
        setEditingId(proxy.id);
        setEditServer(proxy.server);
        setEditUsername(proxy.username || '');
        setEditPassword('');
        setEditLabel(proxy.label || '');
        setEditIsRotatingPool(!!proxy.isRotatingPool);
        setEditEstimatedPoolSize(proxy.estimatedPoolSize ? String(proxy.estimatedPoolSize) : '');
    };

    const cancelEdit = () => {
        setEditError('');
        setEditingId(null);
        setEditServer('');
        setEditUsername('');
        setEditPassword('');
        setEditLabel('');
        setEditIsRotatingPool(false);
        setEditEstimatedPoolSize('');
    };

    const saveEdit = () => {
        if (!editingId) return;
        if (!editServer.trim()) {
            setEditError('Server address is required.');
            return;
        }
        setEditError('');
        onUpdate(editingId, {
            server: editServer.trim(),
            username: editUsername.trim() || undefined,
            password: editPassword.trim() || undefined,
            label: editLabel.trim() || undefined,
            isRotatingPool: editIsRotatingPool,
            estimatedPoolSize: editEstimatedPoolSize ? parseInt(editEstimatedPoolSize, 10) : undefined
        });
        cancelEdit();
    };

    const parseProxyLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        if (trimmed.includes('://')) {
            try {
                const parsed = new URL(trimmed);
                return {
                    server: `${parsed.protocol}//${parsed.host}`,
                    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
                    password: parsed.password ? decodeURIComponent(parsed.password) : undefined
                };
            } catch {
                return { server: trimmed };
            }
        }
        const parts = trimmed.split(':');
        if (parts.length < 2) return null;
        const host = parts[0]?.trim();
        const port = parts[1]?.trim();
        if (!host || !port) return null;
        const usernamePart = parts[2] ? parts[2].trim() : '';
        const passwordPart = parts.length > 3 ? parts.slice(3).join(':').trim() : '';
        return {
            server: `${host}:${port}`,
            username: usernamePart || undefined,
            password: passwordPart || undefined
        };
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length) return;
        try {
            const contents = await Promise.all(files.map((file) => file.text()));
            const rawLines = contents
                .join('\n')
                .split(/\r?\n/)
                .flatMap((line) => line.split(/[,;]+/));
            const entries = rawLines.map(parseProxyLine).filter(Boolean) as {
                server: string;
                username?: string;
                password?: string;
                label?: string;
                isRotatingPool?: boolean;
                estimatedPoolSize?: number;
            }[];
            if (entries.length === 0) {
                setImportError('No valid proxies found in file.');
                return;
            }
            setImportError('');
            onImport(entries);
        } catch {
            setImportError('Failed to read file.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const toggleSelection = (id: string, e?: React.MouseEvent) => {
        setSelectedProxyIds(prev => {
            const next = new Set(prev);
            if (e?.shiftKey && lastSelectedId) {
                const selectable = proxies.filter(p => p.id !== 'host');
                const startIdx = selectable.findIndex(p => p.id === lastSelectedId);
                const endIdx = selectable.findIndex(p => p.id === id);
                if (startIdx !== -1 && endIdx !== -1) {
                    const MathMin = Math.min(startIdx, endIdx);
                    const MathMax = Math.max(startIdx, endIdx);
                    for (let i = MathMin; i <= MathMax; i++) {
                        next.add(selectable[i].id);
                    }
                    return next;
                }
            }

            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setLastSelectedId(id);
    };

    const toggleAllSelection = () => {
        const selectable = proxies.filter(p => p.id !== 'host');
        if (selectedProxyIds.size >= selectable.length && selectable.length > 0) {
            setSelectedProxyIds(new Set());
        } else {
            setSelectedProxyIds(new Set(selectable.map(p => p.id)));
        }
    };

    const handleBulkDelete = () => {
        if (selectedProxyIds.size > 0) {
            onDeleteMultiple(Array.from(selectedProxyIds));
            setSelectedProxyIds(new Set());
        }
    };

    const selectableProxies = proxies.filter(p => p.id !== 'host');
    const allSelected = selectableProxies.length > 0 && selectedProxyIds.size >= selectableProxies.length;

    return (
        <PanelShell
            icon="security"
            title="Proxies"
            description="Set defaults and rotate per task"
            headerActions={(
                <button
                    onClick={onRefresh}
                    disabled={loading}
                    className="px-4 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all disabled:opacity-50 inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    title="Refresh proxy list"
                    aria-label="Refresh proxy list"
                >
                    <MaterialIcon name="sync" className={`text-base ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            )}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                    type="text"
                    placeholder="Proxy server (host:port or scheme://host:port)"
                    value={server}
                    onChange={(e) => setServer(e.target.value)}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                    aria-label="Proxy server address"
                />
                <input
                    type="text"
                    placeholder="Label (optional)"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                    aria-label="Proxy label"
                />
                <input
                    type="text"
                    placeholder="Username (optional)"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                    aria-label="Proxy username"
                />
                <input
                    type="password"
                    placeholder="Password (optional)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                    aria-label="Proxy password"
                />
                <label className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 group cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isRotatingPool}
                        onChange={(e) => setIsRotatingPool(e.target.checked)}
                        className="w-4 h-4 rounded border-white/20 bg-transparent"
                    />
                    <span className="text-xs text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">Rotating pool</span>
                </label>
                {isRotatingPool && (
                    <input
                        type="number"
                        placeholder="Estimated size (optional)"
                        value={estimatedPoolSize}
                        onChange={(e) => setEstimatedPoolSize(e.target.value)}
                        className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3 text-xs text-white"
                        aria-label="Estimated pool size"
                        min="1"
                    />
                )}
            </div>
            {addError && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{addError}</p>
            )}
            <div className="flex items-center gap-3">
                <button
                    onClick={submit}
                    disabled={loading}
                    className="px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest bg-white text-black hover:scale-105 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {loading && <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />}
                    Add Proxy
                </button>
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest border border-white/10 text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                    Import
                </button>
                <button
                    onClick={() => onSetDefault('host')}
                    className={`px-6 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest border border-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${defaultProxyId ? 'text-white hover:bg-white/5' : 'bg-white/10 text-white'}`}
                >
                    Use Host IP
                </button>
            </div>

            {(selectedProxyIds.size > 0 || selectableProxies.length > 0) && (
                <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleAllSelection}
                            disabled={selectableProxies.length === 0}
                            className="w-4 h-4 rounded border-white/20 bg-transparent disabled:opacity-50"
                        />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest group-hover:text-white transition-colors">
                            {selectedProxyIds.size > 0 ? `${selectedProxyIds.size} Selected` : 'Select All'}
                        </span>
                    </label>

                    {selectedProxyIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold uppercase tracking-widest text-red-400 hover:bg-red-500/20 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        >
                            <MaterialIcon name="delete" className="text-base" />
                            Delete Selected
                        </button>
                    )}
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                onChange={handleImport}
                className="hidden"
            />
            {importError && (
                <div className="text-xs text-red-400 uppercase tracking-widest">{importError}</div>
            )}
            <label className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all group">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Rotation mode</span>
                <select
                    value={rotationMode}
                    onChange={(e) => onRotationModeChange(e.target.value === 'random' ? 'random' : 'round-robin')}
                    className="bg-white/[0.05] border border-white/10 rounded-xl px-3 py-2 text-xs text-white uppercase tracking-widest"
                    aria-label="Rotation mode"
                >
                    <option value="round-robin">Round robin</option>
                    <option value="random">Random</option>
                </select>
            </label>
            <label className="flex items-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-all cursor-pointer group">
                <input
                    type="checkbox"
                    checked={includeDefaultInRotation}
                    onChange={(e) => onToggleIncludeDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-transparent"
                />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest group-hover:text-white">Include default IP in rotation pool</span>
            </label>

            <div className="space-y-3">
                {loading && <LoadingState label="proxies" />}
                {!loading && proxies.length === 0 && <EmptyState label="proxies" />}
                {!loading && proxies.map((proxy) => {
                    const isDefault = proxy.id === defaultProxyId;
                    const isEditing = proxy.id === editingId;
                    return (
                        <div key={proxy.id} className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
                            {isEditing ? (
                                <div className="w-full space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <input
                                            type="text"
                                            value={editServer}
                                            onChange={(e) => setEditServer(e.target.value)}
                                            className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                                            placeholder="Proxy server"
                                            aria-label="Proxy server"
                                        />
                                        <input
                                            type="text"
                                            value={editLabel}
                                            onChange={(e) => setEditLabel(e.target.value)}
                                            className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                                            placeholder="Label"
                                            aria-label="Label"
                                        />
                                        <input
                                            type="text"
                                            value={editUsername}
                                            onChange={(e) => setEditUsername(e.target.value)}
                                            className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                                            placeholder="Username"
                                            aria-label="Username"
                                        />
                                        <input
                                            type="password"
                                            value={editPassword}
                                            onChange={(e) => setEditPassword(e.target.value)}
                                            placeholder="Password (leave blank to keep)"
                                            className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                                            aria-label="Password"
                                        />
                                        <label className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 group cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={editIsRotatingPool}
                                                onChange={(e) => setEditIsRotatingPool(e.target.checked)}
                                                className="w-3.5 h-3.5 rounded border-white/20 bg-transparent"
                                            />
                                            <span className="text-xs text-gray-400 uppercase tracking-widest group-hover:text-white transition-colors">Rotating pool</span>
                                        </label>
                                        {editIsRotatingPool && (
                                            <input
                                                type="number"
                                                placeholder="Estimated size"
                                                value={editEstimatedPoolSize}
                                                onChange={(e) => setEditEstimatedPoolSize(e.target.value)}
                                                className="bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2 text-xs text-white"
                                                aria-label="Estimated pool size"
                                                min="1"
                                            />
                                        )}
                                    </div>
                                    {editError && (
                                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{editError}</p>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={saveEdit}
                                            className="px-3 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                            title="Save proxy changes"
                                            aria-label="Save proxy changes"
                                        >
                                            Save
                                        </button>
                                        <button
                                            onClick={cancelEdit}
                                            className="px-3 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white/70 hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                            title="Cancel editing"
                                            aria-label="Cancel editing"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-4 border-r border-white/10 pr-4 w-12 justify-center">
                                        {proxy.id !== 'host' ? (
                                            <input
                                                type="checkbox"
                                                checked={selectedProxyIds.has(proxy.id)}
                                                onChange={() => { }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleSelection(proxy.id, e);
                                                }}
                                                className="w-4 h-4 rounded border-white/20 bg-transparent"
                                            />
                                        ) : (
                                            <div title="Host IP (Cannot be deleted)" className="flex items-center justify-center opacity-70">
                                                <MaterialIcon name="computer" className="text-lg text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 space-y-1">
                                        <div className="text-xs font-bold text-white uppercase tracking-widest">
                                            {getProxyDisplayLabel(proxy)}
                                        </div>
                                        <div className="text-xs text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                            <span>{proxy.server}</span>
                                            {proxy.isRotatingPool && (
                                                <span className="px-1.5 py-0.5 rounded bg-white/10 text-white font-bold inline-flex items-center gap-1">
                                                    <MaterialIcon name="autorenew" className="text-xs" />
                                                    Pool
                                                    {proxy.estimatedPoolSize ? `(~${proxy.estimatedPoolSize})` : ''}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onSetDefault(proxy.id)}
                                            className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 ${isDefault ? 'bg-white text-black border-white focus-visible:ring-blue-500' : 'border-white/10 text-white hover:bg-white/5 focus-visible:ring-white/50'}`}
                                            title={isDefault ? "Current default proxy" : "Set as default proxy"}
                                            aria-label={isDefault ? "Current default proxy" : "Set as default proxy"}
                                        >
                                            {isDefault ? <MaterialIcon name="star" className="text-base" /> : <MaterialIcon name="star_outline" className="text-base" />}
                                            {isDefault ? 'Default' : 'Set Default'}
                                        </button>
                                        {proxy.id !== 'host' && (
                                            <>
                                                <button
                                                    onClick={() => startEdit(proxy)}
                                                    className="px-3 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    title="Edit proxy"
                                                    aria-label="Edit proxy"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => onDelete(proxy.id)}
                                                    className="px-3 py-2 rounded-xl border border-red-500/20 text-xs font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/10 transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                                    title="Delete proxy"
                                                    aria-label="Delete proxy"
                                                >
                                                    <MaterialIcon name="delete" className="text-base" />
                                                    Delete
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </PanelShell>
    );
};

export default ProxiesPanel;
