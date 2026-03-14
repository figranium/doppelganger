import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MaterialIcon from '../MaterialIcon';
import CopyButton from '../CopyButton';

export interface ProviderConfig {
    id: string;
    name: string;
    iconComponent?: React.FC<{ className?: string }>;
    iconUrl?: string;
    disabled?: boolean;
}

export interface DbProviderConfig {
    providerKey: 'baserow';
    name: string;
    iconUrl?: string;
    disabled?: boolean;
}

export interface ApiKeyConfig {
    id: string;
    name: string;
    description: string;
    icon?: string;
    iconComponent?: React.FC<{ className?: string }>;
    iconUrl?: string;
    value: string | null;
    saving: boolean;
    loading: boolean;
    showCopyButton?: boolean;
    onSave: (val: string) => Promise<void>;
    onRegenerate?: () => Promise<void>;
    onDelete?: () => Promise<void>;
    readOnly?: boolean;
    startEditing?: boolean;
    badge?: string;
}

interface ApiKeysPanelProps {
    keys: ApiKeyConfig[];
    availableProviders?: ProviderConfig[];
    onAddProvider?: (providerId: string) => void;
    dbProviders?: DbProviderConfig[];
    onAddDbCredential?: (cred: { name: string; provider: 'baserow'; config: { baseUrl: string; token: string } }) => Promise<boolean>;
    onConfirm?: (msg: string) => Promise<boolean>;
}

const ApiKeyRow: React.FC<{
    config: ApiKeyConfig;
    onConfirm?: (msg: string) => Promise<boolean>;
}> = ({ config, onConfirm }) => {
    const [isEditing, setIsEditing] = useState(config.startEditing || false);
    const [editValue, setEditValue] = useState(config.startEditing ? (config.value || '') : '');
    const [showPlaintext, setShowPlaintext] = useState(false);

    const handleEditStart = () => {
        setEditValue(config.value || '');
        setShowPlaintext(false);
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditValue('');
        setShowPlaintext(false);
    };

    const handleSave = async () => {
        const val = editValue.trim();
        await config.onSave(val);
        setIsEditing(false);
    };

    const handleRegenerate = async () => {
        if (config.onRegenerate) {
            await config.onRegenerate();
        }
    };

    const displayValue = config.loading
        ? 'Loading...'
        : (config.value ? '••••••••••••••••••••••••••••••••••••••••' : 'No key set');

    return (
        <div className="flex flex-col gap-4 py-4 border-b border-white/5 last:border-0">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-blue-400 overflow-hidden">
                    {config.iconUrl ? (
                        <img src={config.iconUrl} alt={config.name} className="w-6 h-6 object-contain" />
                    ) : config.iconComponent ? (
                        <config.iconComponent className="w-5 h-5" />
                    ) : (
                        <MaterialIcon name={config.icon || "key"} className="text-xl" />
                    )}
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white uppercase tracking-widest">{config.name}</h4>
                        {config.badge && (
                            <span className={`text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${config.badge === 'Primary'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                    : 'bg-white/10 text-white/50 border border-white/10'
                                }`}>{config.badge}</span>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">{config.description}</p>
                </div>
            </div>

            {!isEditing ? (
                <div className="flex items-center gap-3">
                    <div className="flex-1 rounded-2xl bg-black/40 border border-white/10 px-4 py-3 font-mono text-[10px] text-blue-200/80 break-all min-h-[44px] flex items-center">
                        <span className="opacity-80 select-none">
                            {displayValue}
                        </span>
                    </div>
                    {!config.readOnly && (
                        <button
                            onClick={handleEditStart}
                            disabled={config.loading || config.saving}
                            className="px-6 py-3 rounded-2xl text-[9px] font-bold uppercase tracking-widest bg-white/10 text-white hover:bg-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <MaterialIcon name="edit" className="text-base" />
                            Edit
                        </button>
                    )}
                    {config.onRegenerate && (
                        <button
                            onClick={handleRegenerate}
                            disabled={config.loading || config.saving}
                            className="px-6 py-3 rounded-2xl text-[9px] font-bold uppercase tracking-widest bg-white text-black hover:scale-105 transition-all disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            <MaterialIcon name="autorenew" className="text-base" />
                            {config.saving ? 'Generating...' : 'Regenerate'}
                        </button>
                    )}
                    {config.showCopyButton && config.value && (
                        <CopyButton
                            text={config.value}
                            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                            iconClassName="text-base"
                        />
                    )}
                    {config.onDelete && (
                        <button
                            onClick={async () => {
                                const confirmed = onConfirm
                                    ? await onConfirm(`Are you sure you want to delete the ${config.name}?`)
                                    : confirm(`Are you sure you want to delete the ${config.name}?`);
                                if (confirmed) {
                                    await config.onDelete?.();
                                }
                            }}
                            disabled={config.loading || config.saving}
                            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete Key"
                            aria-label="Delete Key"
                        >
                            <MaterialIcon name="delete" className="text-base" />
                        </button>
                    )}
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <div className="flex-1 flex items-center gap-3 rounded-2xl bg-black/40 border border-white/30 focus-within:border-white px-4 py-2 transition-all">
                        <input
                            type={showPlaintext ? 'text' : 'password'}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            disabled={config.saving}
                            placeholder="Enter new API key..."
                            className="flex-1 bg-transparent text-[10px] text-white font-mono focus:outline-none"
                            autoFocus
                        />
                        <button
                            onClick={() => setShowPlaintext(!showPlaintext)}
                            type="button"
                            className="p-2 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition-all"
                            title={showPlaintext ? 'Hide value' : 'Show value'}
                            aria-label={showPlaintext ? 'Hide value' : 'Show value'}
                        >
                            <MaterialIcon name={showPlaintext ? 'visibility_off' : 'visibility'} className="text-base" />
                        </button>
                    </div>
                    <button
                        onClick={handleCancel}
                        disabled={config.saving}
                        className="px-6 py-3 rounded-2xl text-[9px] font-bold uppercase tracking-widest bg-transparent border border-white/20 text-white hover:bg-white/10 transition-all disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={config.saving}
                        className="px-6 py-3 rounded-2xl text-[9px] font-bold uppercase tracking-widest bg-blue-500 text-white hover:bg-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <MaterialIcon name="save" className="text-base" />
                        {config.saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            )}
        </div>
    );
};

type ModalView = 'list' | 'db-form';

const ApiKeysPanel: React.FC<ApiKeysPanelProps> = ({ keys, availableProviders, onAddProvider, dbProviders, onAddDbCredential, onConfirm }) => {
    const [showAddMenu, setShowAddMenu] = useState(false);
    const [modalView, setModalView] = useState<ModalView>('list');
    const [selectedDb, setSelectedDb] = useState<DbProviderConfig | null>(null);
    const [dbForm, setDbForm] = useState({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
    const [dbSaving, setDbSaving] = useState(false);
    const [dbError, setDbError] = useState<string | null>(null);

    const hasAnything = (availableProviders && availableProviders.length > 0 && onAddProvider) || (dbProviders && dbProviders.length > 0 && onAddDbCredential);

    const closeModal = () => {
        setShowAddMenu(false);
        setModalView('list');
        setSelectedDb(null);
        setDbForm({ name: '', baseUrl: 'https://api.baserow.io', token: '' });
        setDbError(null);
    };

    const handleDbProviderClick = (p: DbProviderConfig) => {
        setSelectedDb(p);
        setModalView('db-form');
        setDbError(null);
    };

    const handleDbSave = async () => {
        if (!selectedDb || !dbForm.name || !dbForm.token || !onAddDbCredential) return;
        setDbSaving(true);
        setDbError(null);
        try {
            const ok = await onAddDbCredential({
                name: dbForm.name,
                provider: selectedDb.providerKey,
                config: { baseUrl: dbForm.baseUrl, token: dbForm.token }
            });
            if (ok) {
                closeModal();
            } else {
                setDbError('Failed to save credential. Check the server console for details.');
            }
        } catch (err) {
            console.error('[ApiKeysPanel] handleDbSave error:', err);
            setDbError('An unexpected error occurred.');
        } finally {
            setDbSaving(false);
        }
    };

    // Prevent scroll when modal is open
    useEffect(() => {
        if (showAddMenu) {
            document.body.style.overflow = 'hidden';
            const mainEl = document.querySelector('main');
            if (mainEl) mainEl.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
            const mainEl = document.querySelector('main');
            if (mainEl) mainEl.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
            const mainEl = document.querySelector('main');
            if (mainEl) mainEl.style.overflow = '';
        };
    }, [showAddMenu]);

    return (
        <div className="glass-card p-8 rounded-[40px]">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-white uppercase tracking-widest">API Keys</h3>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Manage external integrations and API access</p>
                </div>

                {hasAnything && (
                    <div>
                        <button
                            onClick={() => setShowAddMenu(true)}
                            className="px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all flex items-center gap-2 border border-blue-500/10"
                        >
                            <MaterialIcon name="add" className="text-base" />
                            Add API Key
                        </button>

                        {showAddMenu && createPortal(
                            <div
                                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                                style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
                                onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
                            >
                                <div className="glass-card max-w-2xl w-full p-10 rounded-[40px] shadow-2xl relative border border-white/10 animate-in zoom-in-95 duration-300 bg-gray-900/80">
                                    <button
                                        onClick={closeModal}
                                        className="absolute top-6 right-6 p-3 rounded-2xl text-white/50 hover:text-white hover:bg-white/10 transition-all"
                                        aria-label="Close"
                                    >
                                        <MaterialIcon name="close" className="text-2xl" />
                                    </button>

                                    {modalView === 'list' && (
                                        <>
                                            <h3 className="text-2xl font-bold text-white tracking-wide mb-2">Add Key</h3>
                                            <p className="text-sm text-white/50 mb-8">Choose what you'd like to add.</p>

                                            {availableProviders && availableProviders.length > 0 && onAddProvider && (
                                                <div className="mb-8">
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">AI Providers</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {availableProviders.map(provider => (
                                                            <button
                                                                key={provider.id}
                                                                onClick={() => {
                                                                    if (!provider.disabled) {
                                                                        onAddProvider(provider.id);
                                                                        closeModal();
                                                                    }
                                                                }}
                                                                disabled={provider.disabled}
                                                                className={`flex items-start gap-4 p-5 rounded-3xl border transition-all text-left ${provider.disabled
                                                                    ? 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed grayscale'
                                                                    : 'border-white/10 hover:border-blue-400/30 hover:bg-blue-500/5 cursor-pointer group'
                                                                    }`}
                                                            >
                                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden ${provider.disabled ? 'bg-black/20' : 'bg-white/5 group-hover:scale-110 transition-transform'}`}>
                                                                    {provider.iconUrl ? (
                                                                        <img src={provider.iconUrl} alt={provider.name} className="w-8 h-8 object-contain drop-shadow-md" />
                                                                    ) : provider.iconComponent ? (
                                                                        <provider.iconComponent className="w-6 h-6 text-white" />
                                                                    ) : (
                                                                        <MaterialIcon name="api" className="text-xl text-white" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="text-base font-bold text-white mb-1">{provider.name}</div>
                                                                    <div className="text-[10px] text-white/50 uppercase tracking-widest">{provider.disabled ? 'Coming Soon' : 'Available'}</div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {dbProviders && dbProviders.length > 0 && onAddDbCredential && (
                                                <div>
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-4">Database / Output</p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {dbProviders.map(p => (
                                                            <button
                                                                key={p.providerKey}
                                                                onClick={() => !p.disabled && handleDbProviderClick(p)}
                                                                disabled={p.disabled}
                                                                className={`flex items-start gap-4 p-5 rounded-3xl border transition-all text-left ${p.disabled
                                                                    ? 'border-white/5 bg-white/5 opacity-40 cursor-not-allowed grayscale'
                                                                    : 'border-white/10 hover:border-emerald-400/30 hover:bg-emerald-500/5 cursor-pointer group'
                                                                    }`}
                                                            >
                                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden ${p.disabled ? 'bg-black/20' : 'bg-white/5 group-hover:scale-110 transition-transform'}`}>
                                                                    {p.iconUrl ? (
                                                                        <img src={p.iconUrl} alt={p.name} className="w-8 h-8 object-contain drop-shadow-md" />
                                                                    ) : (
                                                                        <MaterialIcon name="database" className="text-xl text-white" />
                                                                    )}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="text-base font-bold text-white mb-1">{p.name}</div>
                                                                    <div className="text-[10px] text-white/50 uppercase tracking-widest">{p.disabled ? 'Coming Soon' : 'Available'}</div>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {modalView === 'db-form' && selectedDb && (
                                        <>
                                            <button
                                                onClick={() => setModalView('list')}
                                                className="flex items-center gap-2 text-[10px] font-bold text-gray-500 hover:text-white uppercase tracking-widest mb-6 transition-colors"
                                            >
                                                <MaterialIcon name="arrow_back" className="text-sm" />
                                                Back
                                            </button>
                                            <h3 className="text-2xl font-bold text-white tracking-wide mb-2">Add {selectedDb.name}</h3>
                                            <p className="text-sm text-white/50 mb-8">Enter your {selectedDb.name} credentials.</p>

                                            <div className="space-y-4">
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em]">Name</label>
                                                    <input
                                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
                                                        placeholder="e.g. My Baserow"
                                                        value={dbForm.name}
                                                        onChange={e => setDbForm(v => ({ ...v, name: e.target.value }))}
                                                        autoFocus
                                                    />
                                                </div>
                                                {selectedDb.providerKey === 'baserow' && (
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em]">Base URL</label>
                                                        <input
                                                            className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors"
                                                            placeholder="https://api.baserow.io"
                                                            value={dbForm.baseUrl}
                                                            onChange={e => setDbForm(v => ({ ...v, baseUrl: e.target.value }))}
                                                        />
                                                    </div>
                                                )}
                                                <div className="space-y-1">
                                                    <label className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em]">API Token</label>
                                                    <input
                                                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/30 transition-colors font-mono"
                                                        placeholder="Token"
                                                        type="password"
                                                        value={dbForm.token}
                                                        onChange={e => setDbForm(v => ({ ...v, token: e.target.value }))}
                                                    />
                                                </div>
                                            </div>

                                            {dbError && (
                                                <p className="mt-4 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{dbError}</p>
                                            )}

                                            <div className="flex gap-3 mt-4">
                                                <button
                                                    onClick={closeModal}
                                                    className="px-6 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest bg-transparent border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleDbSave}
                                                    disabled={dbSaving || !dbForm.name || !dbForm.token}
                                                    className="flex-1 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest bg-white text-black hover:bg-white/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    {dbSaving ? 'Saving…' : 'Save Credential'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                )}
            </div>
            <div className="flex flex-col">
                {keys.map((k) => (
                    <ApiKeyRow key={k.id} config={k} onConfirm={onConfirm} />
                ))}
            </div>
        </div>
    );
};

export default ApiKeysPanel;
