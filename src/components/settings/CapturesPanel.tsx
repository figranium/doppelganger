import { useMemo } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { CaptureEntry } from '../../types';

interface CapturesPanelProps {
    captures: CaptureEntry[];
    loading: boolean;
    onRefresh: () => void;
    onDelete: (name: string) => void;
}

const CAPTURE_ROW_HEIGHT = 72;
const CAPTURE_ROW_SPACING = 6;
const CAPTURE_ROW_ITEM_SIZE = CAPTURE_ROW_HEIGHT + CAPTURE_ROW_SPACING;
const CAPTURE_ROW_MAX_VISIBLE = 5;
const CAPTURE_ROW_OVERSCAN = 2;

interface CapturesPanelListData {
    captures: CaptureEntry[];
    onDelete: (name: string) => void;
}

const renderCaptureRow = ({ index, style, data }: ListChildComponentProps<CapturesPanelListData>) => {
    const capture = data.captures[index];
    if (!capture) return null;
    return (
        <div style={{ ...style, paddingBottom: CAPTURE_ROW_SPACING }}>
            <div className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.02]">
                <div className="space-y-1">
                    <div className="text-[10px] font-bold text-white uppercase tracking-widest">
                        {capture.type === 'recording' ? 'Recording' : 'Screenshot'}
                    </div>
                    <div className="text-[9px] text-gray-500 uppercase tracking-widest">{capture.name}</div>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={capture.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-2 rounded-xl border border-white/10 text-[9px] font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label={`Open ${capture.name}`}
                        title={`Open ${capture.name}`}
                    >
                        Open
                    </a>
                    <button
                        type="button"
                        onClick={() => data.onDelete(capture.name)}
                        className="px-3 py-2 rounded-xl border border-red-500/20 text-[9px] font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50"
                        aria-label={`Delete ${capture.name}`}
                        title={`Delete ${capture.name}`}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

const CapturesPanel: React.FC<CapturesPanelProps> = ({ captures, loading, onRefresh, onDelete }) => {
    const listHeight = Math.min(
        Math.max(CAPTURE_ROW_ITEM_SIZE, captures.length * CAPTURE_ROW_ITEM_SIZE),
        CAPTURE_ROW_ITEM_SIZE * CAPTURE_ROW_MAX_VISIBLE
    );

    const itemData = useMemo(() => ({ captures, onDelete }), [captures, onDelete]);

    return (
        <div className="glass-card p-8 rounded-[40px] space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest">Captures</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Recordings and screenshots</p>
                </div>
                <button
                    type="button"
                    onClick={onRefresh}
                    disabled={loading}
                    className="px-4 py-2 border border-white/10 text-[9px] font-bold rounded-xl uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-all disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                    aria-label="Refresh captures list"
                    title="Refresh captures list"
                >
                    Refresh
                </button>
            </div>
            {loading && (
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Loading captures...</div>
            )}
            {!loading && captures.length === 0 && (
                <div className="text-[9px] text-gray-600 uppercase tracking-widest">No captures found.</div>
            )}
            {!loading && captures.length > 0 && (
                <FixedSizeList
                    height={listHeight}
                    width="100%"
                    itemCount={captures.length}
                    itemSize={CAPTURE_ROW_ITEM_SIZE}
                    overscanCount={CAPTURE_ROW_OVERSCAN}
                    itemData={itemData}
                >
                    {renderCaptureRow}
                </FixedSizeList>
            )}
        </div>
    );
};

export default CapturesPanel;
