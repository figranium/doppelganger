import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmRequest, CaptureEntry } from '../types';
import CaptureCard from './CaptureCard';
import MaterialIcon from './MaterialIcon';

interface CapturesScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const CapturesScreen: React.FC<CapturesScreenProps> = ({ onConfirm, onNotify }) => {
    const navigate = useNavigate();
    const [captures, setCaptures] = useState<CaptureEntry[]>([]);
    const [loading, setLoading] = useState(false);

    const loadCaptures = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/data/captures');
            const data = res.ok ? await res.json() : { captures: [] };
            setCaptures(Array.isArray(data.captures) ? data.captures : []);
        } catch {
            setCaptures([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearCaptures = useCallback(async () => {
        const confirmed = await onConfirm('Clear all captures?');
        if (!confirmed) return;
        const res = await fetch('/api/clear-screenshots', { method: 'POST' });
        if (res.ok) {
            onNotify('Captures cleared.', 'success');
            loadCaptures();
        } else {
            onNotify('Clear failed.', 'error');
        }
    }, [loadCaptures, onConfirm, onNotify]);

    const deleteCapture = useCallback(async (name: string) => {
        const confirmed = await onConfirm(`Delete capture ${name}?`);
        if (!confirmed) return;
        const res = await fetch(`/api/data/captures/${encodeURIComponent(name)}`, { method: 'DELETE' });
        if (res.ok) {
            setCaptures((prev) => prev.filter((c) => c.name !== name));
            onNotify('Capture deleted.', 'success');
        } else {
            onNotify('Delete failed.', 'error');
        }
    }, [onConfirm, onNotify]);

    useEffect(() => {
        loadCaptures();
    }, [loadCaptures]);

    return (
        <main className="app-page custom-scrollbar animate-in fade-in duration-500">
            <div className="app-page-inner">
                <header className="app-page-header">
                    <div>
                        <h1 className="app-page-title">Captures</h1>
                        <p className="app-page-subtitle">Recordings and screenshots from every run</p>
                    </div>
                    <div className="app-toolbar">
                        <button
                            onClick={loadCaptures}
                            disabled={loading}
                            aria-busy={loading}
                            className="app-button-secondary disabled:opacity-50"
                            title="Refresh captures"
                            aria-label="Refresh captures"
                        >
                            <MaterialIcon name="sync" className={`text-base ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button onClick={clearCaptures} className="app-button-danger"
                            title="Clear all"
                            aria-label="Clear all captures"
                        >
                            <MaterialIcon name="delete" className="text-base" /> Clear all
                        </button>
                        <button
                            onClick={() => navigate('/executions')}
                            className="app-button-secondary"
                            title="Go to Executions (Alt + 3)"
                            aria-label="Go to Executions (Alt + 3)"
                        >
                            <MaterialIcon name="history" className="text-[16px]" />
                            Executions
                        </button>
                    </div>
                </header>

                <section className="app-panel overflow-hidden">
                    <div className="app-panel-header"><div><h2 className="text-sm font-bold theme-text">Media library</h2><p className="mt-1 text-[10px] uppercase tracking-[0.14em] theme-text-faint">{captures.length} captures</p></div></div>
                    {loading && (
                        <div className="app-empty-state min-h-[220px]">
                            <MaterialIcon name="sync" className="text-base animate-spin" />
                            <p className="text-xs theme-text-faint">Loading captures…</p>
                        </div>
                    )}
                    {!loading && captures.length === 0 && (
                        <div className="app-empty-state">
                            <div className="app-empty-icon"><MaterialIcon name="image" className="text-2xl" /></div>
                            <div>
                                <h3 className="text-sm font-bold theme-text">No captures found</h3>
                                <p className="text-xs theme-text-faint max-w-[320px] mx-auto leading-relaxed mt-2">
                                    Recordings and screenshots will appear here once you run your Tasks.
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="app-button-primary"
                            >
                                Go to Dashboard
                            </button>
                        </div>
                    )}
                    {!loading && captures.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-[var(--app-border)]">
                            {captures.map((capture) => (
                                <CaptureCard key={capture.name} capture={capture} onDelete={deleteCapture} />
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </main>
    );
};

export default CapturesScreen;
