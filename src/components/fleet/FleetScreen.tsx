import React, { useState, useEffect, useCallback } from 'react';
import MaterialIcon from '../MaterialIcon';
import FleetSidebar from './FleetSidebar';
import TaskMatrixTab from './tabs/TaskMatrixTab';
import VariableTablesTab from './tabs/VariableTablesTab';
import SchedulesDropsTab from './tabs/SchedulesDropsTab';
import InfrastructureTab from './tabs/InfrastructureTab';
import { FleetTab, FleetWorkerState, ProxyPreset } from '../../types';

interface FleetScreenProps {
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const FleetScreen: React.FC<FleetScreenProps> = ({ onNotify }) => {
    const [activeTab, setActiveTab] = useState<FleetTab>('matrix');
    const [selectedTaskId] = useState<string | null>(null);
    const [workers, setWorkers] = useState<FleetWorkerState[]>([]);
    const [rows, setRows] = useState<any[]>([]);
    const [proxies, setProxies] = useState<ProxyPreset[]>([]);
    const [fleetConfig, setFleetConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // ── Data loading ──────────────────────────────────────────────────
    const loadFleetData = useCallback(async () => {
        try {
            const [workersRes, rowsRes, proxiesRes, signalsRes, configRes] = await Promise.all([
                fetch('/api/fleet/workers', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/fleet/rows', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/fleet/proxies', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/fleet/signals', { credentials: 'include' }).then(r => r.json()),
                fetch('/api/fleet/config', { credentials: 'include' }).then(r => r.json()),
            ]);
            setWorkers(workersRes.workers || []);
            setRows(rowsRes.rows || []);
            setProxies(proxiesRes.proxies || []);
            // Signals data is fetched but unused in the UI
            void signalsRes;
            setFleetConfig(configRes.config || null);
        } catch (e: any) {
            onNotify(`Failed to load fleet data: ${e.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [onNotify]);

    useEffect(() => {
        loadFleetData();
        const interval = setInterval(() => {
            // Poll for live updates of workers and signals
            fetch('/api/fleet/workers', { credentials: 'include' }).then(r => r.json()).then(d => setWorkers(d.workers || [])).catch(() => {});
            // Signals data is fetched but unused in the UI
            fetch('/api/fleet/signals', { credentials: 'include' }).then(() => {}).catch(() => {});
        }, 2000);
        return () => clearInterval(interval);
    }, [loadFleetData]);

    // ── Viewport sync: center canvas on a worker's active node ─────────
    const handleRowCenter = useCallback((workerId: string) => {
        const worker = workers.find(w => w.id === workerId);
        if (!worker || !worker.activeActionId) return;
        // Dispatch a custom event that CanvasView listens for
        window.dispatchEvent(new CustomEvent('fleet:centerNode', {
            detail: { actionId: worker.activeActionId, workerId },
        }));
    }, [workers]);

    // ── Proxy binding helpers ─────────────────────────────────────────
    const handleProxyBind = useCallback(async (mode: 'STICKY_AUTO_BIND' | 'POOL_ROTATION') => {
        try {
            await fetch('/api/fleet/proxy-bind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ mode }),
            });
            onNotify(`Proxy binding mode set to ${mode}`, 'success');
            loadFleetData();
        } catch (e: any) {
            onNotify(`Failed to update proxy binding: ${e.message}`, 'error');
        }
    }, [onNotify, loadFleetData]);

    const handleFallbackStrategy = useCallback(async (strategy: 'STOP' | 'LOOP' | 'REVERSE_LOOP' | 'RANDOM') => {
        try {
            await fetch('/api/fleet/fallback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ strategy }),
            });
            onNotify(`Under-row fallback strategy set to ${strategy}`, 'success');
            loadFleetData();
        } catch (e: any) {
            onNotify(`Failed to update fallback strategy: ${e.message}`, 'error');
        }
    }, [onNotify, loadFleetData]);

    // ── Render ────────────────────────────────────────────────────────
    const tabComponents: Record<FleetTab, React.ReactNode> = {
        matrix: <TaskMatrixTab
            workers={workers}
            rows={rows}
            fleetConfig={fleetConfig}
            onRowCenter={handleRowCenter}
            onProxyBind={handleProxyBind}
            onFallbackStrategy={handleFallbackStrategy}
            onNotify={onNotify}
        />,
        variables: <VariableTablesTab rows={rows} fleetConfig={fleetConfig} onNotify={onNotify} />,
        schedules: <SchedulesDropsTab fleetConfig={fleetConfig} onNotify={onNotify} />,
        infrastructure: <InfrastructureTab proxies={proxies} fleetConfig={fleetConfig} onNotify={onNotify} />,
    };

    return (
        <div className="flex-1 flex overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 bg-black relative">
            {/* Top Bar */}
            <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 border-b border-white/10 z-30 bg-black/80 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <MaterialIcon name="layers" className="text-cyan-400 text-xl drop-shadow-[0_0_8px_rgba(34,211,238,0.6)]" />
                    <h1 className="text-sm font-bold tracking-[0.2em] uppercase text-cyan-400 font-questrial">FLEET</h1>
                </div>
                {selectedTaskId && (
                    <span className="text-[9px] text-white/40 font-mono">Task: {selectedTaskId}</span>
                )}
                {loading && (
                    <span className="text-[9px] text-gray-500 font-mono">initializing…</span>
                )}
            </div>

            <div className="h-full flex pt-12">
                <FleetSidebar activeTab={activeTab} onTabChange={setActiveTab} />
                <div className="flex-1 h-full overflow-hidden">
                    {tabComponents[activeTab]}
                </div>
            </div>
        </div>
    );
};

export default FleetScreen;
