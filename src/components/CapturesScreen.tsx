import { useCallback, useEffect, useMemo, useState } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { useNavigate } from 'react-router-dom';
import { ConfirmRequest, CaptureEntry } from '../types';
import CaptureCard from './CaptureCard';
import MaterialIcon from './MaterialIcon';

interface CapturesScreenProps {
    onConfirm: (request: string | ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
}

const CAPTURE_CARD_HEIGHT = 360;
const CAPTURE_CARD_SPACING = 12;
const CAPTURE_LIST_ITEM_SIZE = CAPTURE_CARD_HEIGHT + CAPTURE_CARD_SPACING;
const CAPTURE_LIST_MAX_VISIBLE = 6;
const CAPTURE_OVERSCAN = 4;

interface CaptureListData {
    captures: CaptureEntry[];
    onDelete: (name: string) => void;
}

const renderCaptureItem = ({ index, style, data }: ListChildComponentProps<CaptureListData>) => {
    const capture = data.captures[index];
    if (!capture) return null;
    return (
        <div style={{ ...style, paddingBottom: CAPTURE_CARD_SPACING }}>
            <CaptureCard capture={capture} onDelete={data.onDelete} />
        </div>
    );
};

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

    // Memoize itemData to prevent FixedSizeList from re-rendering all rows on every render
    const itemData = useMemo(() => ({
        captures,
        onDelete: deleteCapture
    }), [captures, deleteCapture]);

    return (
        <main className="flex-1 p-12 overflow-y-auto custom-scrollbar animate-in fade-in duration-500">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-end justify-between">
                    <div className="flex items-center gap-4">
                        <div className="space-y-2">
                            <h2 className="text-4xl font-bold text-white">All Captures</h2>
                            <div className="text-xs text-gray-500 uppercase tracking-[0.2em]">
                                Recordings and screenshots from every run
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={loadCaptures}
                            disabled={loading}
                            aria-busy={loading}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all disabled:opacity-50 inline-flex items-center gap-2"
                            title="Refresh captures"
                            aria-label="Refresh captures"
                        >
                            <MaterialIcon name="sync" className={`text-base ${loading ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>
                        <button
                            onClick={clearCaptures}
                            className="w-10 h-10 rounded-2xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            title="Clear all"
                            aria-label="Clear all captures"
                        >
                            <MaterialIcon name="delete" className="text-xl" />
                        </button>
                        <button
                            onClick={() => navigate('/executions')}
                            className="px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all inline-flex items-center gap-2"
                            title="Go to Executions (Alt + 3)"
                            aria-label="Go to Executions (Alt + 3)"
                        >
                            <MaterialIcon name="history" className="text-[16px]" />
                            Executions
                        </button>
                    </div>
                </div>

                <div className="glass-card rounded-[32px] p-8">
                    {loading && (
                        <div className="text-xs text-gray-500 uppercase tracking-widest flex items-center gap-3">
                            <MaterialIcon name="sync" className="text-base animate-spin" />
                            Loading captures...
                        </div>
                    )}
                    {!loading && captures.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center text-center space-y-6">
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/5">
                                <MaterialIcon name="image" className="text-4xl text-white/10" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-lg font-bold text-white/80 uppercase tracking-widest">No captures found</h3>
                                <p className="text-xs text-gray-500 max-w-[280px] mx-auto leading-relaxed uppercase tracking-wider">
                                    Recordings and screenshots will appear here once you run your automation tasks.
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="px-8 py-3 bg-white text-black rounded-2xl text-xs font-bold uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all"
                            >
                                Go to Dashboard
                            </button>
                        </div>
                    )}
                    {!loading && captures.length > 0 && (
                        <div className="space-y-4">
                            <FixedSizeList
                                height={Math.min(
                                    Math.max(CAPTURE_LIST_ITEM_SIZE, captures.length * CAPTURE_LIST_ITEM_SIZE),
                                    CAPTURE_LIST_ITEM_SIZE * CAPTURE_LIST_MAX_VISIBLE
                                )}
                                width="100%"
                                itemCount={captures.length}
                                itemSize={CAPTURE_LIST_ITEM_SIZE}
                                overscanCount={CAPTURE_OVERSCAN}
                                itemData={itemData}
                                className="custom-scrollbar"
                            >
                                {renderCaptureItem}
                            </FixedSizeList>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
};

export default CapturesScreen;
