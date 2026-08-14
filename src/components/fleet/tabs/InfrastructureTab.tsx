import React, { useState, useCallback } from 'react';
import MaterialIcon from '../../MaterialIcon';
import { ProxyPreset } from '../../../types';

interface InfrastructureTabProps {
    proxies: ProxyPreset[];
    fleetConfig: any;
    onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const InfrastructureTab: React.FC<InfrastructureTabProps> = ({ proxies, fleetConfig, onNotify }) => {
    const [newProxyName, setNewProxyName] = useState('');
    const [newProxyHost, setNewProxyHost] = useState('');
    const [newProxyPort, setNewProxyPort] = useState('');
    const [newProxyUser, setNewProxyUser] = useState('');
    const [newProxyPass, setNewProxyPass] = useState('');

    const handleAddProxy = useCallback(async () => {
        if (!newProxyHost || !newProxyPort) {
            onNotify('Host and port are required', 'error');
            return;
        }
        try {
            await fetch('/api/settings/proxies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    label: newProxyName || `${newProxyHost}:${newProxyPort}`,
                    server: `http://${newProxyHost}:${parseInt(newProxyPort)}`,
                    username: newProxyUser || undefined,
                    password: newProxyPass || undefined,
                }),
            });
            onNotify(`Proxy preset added: ${newProxyName || `${newProxyHost}:${newProxyPort}`}`, 'success');
            setNewProxyName('');
            setNewProxyHost('');
            setNewProxyPort('');
            setNewProxyUser('');
            setNewProxyPass('');
        } catch (e: any) {
            onNotify(`Failed to add proxy: ${e.message}`, 'error');
        }
    }, [newProxyName, newProxyHost, newProxyPort, newProxyUser, newProxyPass, onNotify]);

    const handleTestProxy = useCallback(async (proxy: ProxyPreset) => {
        try {
            const res = await fetch('/api/settings/proxies/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ proxyId: proxy.id }),
            });
            const data = await res.json();
            if (data.success) {
                onNotify(`Proxy test passed: ${proxy.name}`, 'success');
            } else {
                onNotify(`Proxy test failed: ${data.error || 'unknown'}`, 'error');
            }
        } catch (e: any) {
            onNotify(`Proxy test error: ${e.message}`, 'error');
        }
    }, [onNotify]);

    const handleDeleteProxy = useCallback(async (id: string) => {
        try {
            await fetch(`/api/settings/proxies/${id}`, { method: 'DELETE', credentials: 'include' });
            onNotify('Proxy deleted', 'success');
        } catch (e: any) {
            onNotify(`Delete failed: ${e.message}`, 'error');
        }
    }, [onNotify]);

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-6 font-questrial">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase text-gray-500">Proxy Presets</h3>
                    <span className="text-xs text-gray-500 font-space-mono">{proxies.length} preset(s)</span>
                </div>

                <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase text-gray-600 tracking-widest">Add Proxy Preset</h4>
                    <div className="grid grid-cols-2 gap-3">
                        <input
                            type="text"
                            value={newProxyName}
                            onChange={(e) => setNewProxyName(e.target.value)}
                            placeholder="Label (optional)"
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all"
                        />
                        <div />
                        <input
                            type="text"
                            value={newProxyHost}
                            onChange={(e) => setNewProxyHost(e.target.value)}
                            placeholder="Host / IP"
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all"
                        />
                        <input
                            type="number"
                            value={newProxyPort}
                            onChange={(e) => setNewProxyPort(e.target.value)}
                            placeholder="Port"
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all"
                        />
                        <input
                            type="text"
                            value={newProxyUser}
                            onChange={(e) => setNewProxyUser(e.target.value)}
                            placeholder="Username (optional)"
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all"
                        />
                        <input
                            type="password"
                            value={newProxyPass}
                            onChange={(e) => setNewProxyPass(e.target.value)}
                            placeholder="Password (optional)"
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all"
                        />
                    </div>
                    <button
                        onClick={handleAddProxy}
                        className="w-full py-2 rounded-xl bg-cyan-400 text-black text-xs font-bold uppercase tracking-widest hover:scale-[1.02] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                    >
                        Add Preset
                    </button>
                </div>

                <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase text-gray-600 tracking-widest">Saved Presets</h4>
                    {proxies.length === 0 ? (
                        <p className="text-xs text-gray-600">No proxy presets configured. Add one above.</p>
                    ) : (
                        proxies.map((p) => (
                            <div key={p.id} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl px-3 py-2">
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-bold text-white/80 truncate">{p.name}</div>
                                    <div className="text-xs text-gray-500 font-mono">
                                        {p.proxies?.length || 0} proxy(ies) · {p.rotationMode} · {p.stickyBinding ? 'sticky' : 'floating'}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleTestProxy(p)}
                                        className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-cyan-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        title="Test"
                                    >
                                        <MaterialIcon name="wifi" className="text-xs" />
                                    </button>
                                    <button
                                        onClick={() => handleDeleteProxy(p.id)}
                                        className="p-1 rounded-lg hover:bg-white/5 text-white/40 hover:text-red-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        title="Delete"
                                    >
                                        <MaterialIcon name="delete" className="text-xs" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="space-y-2 pt-2 border-t border-white/5">
                    <h4 className="text-xs font-bold uppercase text-gray-600 tracking-widest">Infrastructure Config</h4>
                    <div className="grid grid-cols-[120px_1fr] gap-2 text-xs">
                        <span className="text-gray-500">Browser pool size</span>
                        <span className="text-white/60 font-mono">{fleetConfig?.poolSize || 10}</span>
                        <span className="text-gray-500">Worker limit</span>
                        <span className="text-white/60 font-mono">{fleetConfig?.maxWorkers || 50}</span>
                        <span className="text-gray-500">Proxy bind mode</span>
                        <span className="text-cyan-400 font-mono">{fleetConfig?.proxyBindingMode || 'STICKY_AUTO_BIND'}</span>
                        <span className="text-gray-500">Fallback strategy</span>
                        <span className="text-white/60 font-mono">{fleetConfig?.fallbackStrategy || 'LOOP'}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InfrastructureTab;
