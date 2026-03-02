import { useEffect, useRef, useState, useMemo, memo } from 'react';
import MaterialIcon from '../MaterialIcon';
import { ConfirmRequest, Results, CaptureEntry } from '../../types';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import CaptureCard from '../CaptureCard';
import CodeEditor from '../CodeEditor';
import JSZip from 'jszip';
import { SyntaxLanguage } from '../../utils/syntaxHighlight';

const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    switch (ext) {
        case 'pdf': return 'picture_as_pdf';
        case 'csv':
        case 'xls':
        case 'xlsx': return 'table_view';
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg': return 'image';
        case 'txt':
        case 'md': return 'description';
        case 'json': return 'data_object';
        case 'zip':
        case 'tar':
        case 'gz': return 'folder_zip';
        default: return 'insert_drive_file';
    }
};

interface ResultsPaneProps {
    results: Results | null;
    pinnedResults?: Results | null;
    isExecuting: boolean;
    isHeadful?: boolean;
    runId?: string | null;
    onConfirm: (request: ConfirmRequest) => Promise<boolean>;
    onNotify: (message: string, tone?: 'success' | 'error') => void;
    onPin?: (results: Results) => void;
    onUnpin?: () => void;
    fullWidth?: boolean;
}

const MAX_PREVIEW_CHARS = 60000;
const MAX_PREVIEW_ITEMS = 200;
const MAX_PREVIEW_KEYS = 200;
const MAX_COPY_CHARS = 1000000;
const MAX_COPY_ITEMS = 2000;
const MAX_COPY_KEYS = 2000;
const CAPTURE_MODAL_ITEM_HEIGHT = 360;
const CAPTURE_MODAL_ITEM_SPACING = 12;
const CAPTURE_MODAL_ITEM_SIZE = CAPTURE_MODAL_ITEM_HEIGHT + CAPTURE_MODAL_ITEM_SPACING;
const CAPTURE_MODAL_MAX_VISIBLE = 4;
const CAPTURE_MODAL_OVERSCAN = 4;

const renderCaptureModalItem = ({ index, style, data }: ListChildComponentProps<CaptureEntry[]>) => {
    const capture = data[index];
    if (!capture) return null;
    return (
        <div style={{ ...style, paddingBottom: CAPTURE_MODAL_ITEM_SPACING }}>
            <CaptureCard capture={capture} />
        </div>
    );
};

const formatSize = (chars: number) => `${(chars / (1024 * 1024)).toFixed(2)} MB`;
const normalizeBoolean = (value: any) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
    }
    return null;
};

const clampText = (text: string, limit: number) => {
    if (text.length <= limit) return { text, truncated: false };
    return { text: text.slice(0, limit), truncated: true };
};

const getResultsCopyPayload = (payload: Results | null) => {
    if (!payload || payload.data === undefined || payload.data === null) return { reason: 'No data to copy.' };
    return { raw: payload.data };
};

const clampWithReason = (text: string, limit: number, reasons: string[]) => {
    if (text.length <= limit) return text;
    reasons.push(`first ${limit.toLocaleString()} chars`);
    return text.slice(0, limit);
};

const getTruncatedCopyText = (raw: any) => {
    const reasons: string[] = [];
    if (typeof raw === 'string') {
        const text = clampWithReason(raw, MAX_COPY_CHARS, reasons);
        return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
    }
    if (Array.isArray(raw)) {
        let snapshot = raw;
        if (raw.length > MAX_COPY_ITEMS) {
            snapshot = raw.slice(0, MAX_COPY_ITEMS);
            reasons.push(`first ${MAX_COPY_ITEMS.toLocaleString()} items`);
        }
        let text = '';
        try {
            text = JSON.stringify(snapshot, null, 2);
        } catch {
            text = String(snapshot);
        }
        text = clampWithReason(text, MAX_COPY_CHARS, reasons);
        return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
    }
    if (raw && typeof raw === 'object') {
        let snapshot = raw;
        const keys = Object.keys(raw);
        if (keys.length > MAX_COPY_KEYS) {
            snapshot = keys.slice(0, MAX_COPY_KEYS).reduce<Record<string, any>>((acc, key) => {
                acc[key] = (raw as Record<string, any>)[key];
                return acc;
            }, {});
            reasons.push(`first ${MAX_COPY_KEYS.toLocaleString()} keys`);
        }
        let text = '';
        try {
            text = JSON.stringify(snapshot, null, 2);
        } catch {
            text = String(snapshot);
        }
        text = clampWithReason(text, MAX_COPY_CHARS, reasons);
        return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
    }
    const text = clampWithReason(String(raw), MAX_COPY_CHARS, reasons);
    return { text, truncated: reasons.length > 0, reason: reasons.join(', ') };
};

const getFullCopyText = (raw: any) => {
    if (typeof raw === 'string') return raw;
    try {
        return JSON.stringify(raw, null, 2);
    } catch {
        return String(raw);
    }
};

const getResultsPreview = (payload: Results | null): { text: string; truncated: boolean; language: SyntaxLanguage } => {
    if (!payload || payload.data === undefined || payload.data === null || payload.data === '') {
        return { text: '', truncated: false, language: 'plain' as const };
    }
    const raw = payload.data;
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        const language: SyntaxLanguage = trimmed.startsWith('<') && trimmed.includes('>')
            ? 'html'
            : (trimmed.startsWith('{') || trimmed.startsWith('['))
                ? 'json'
                : 'plain';
        const clamped = clampText(raw, MAX_PREVIEW_CHARS);
        return { text: clamped.text, truncated: clamped.truncated, language };
    }
    if (Array.isArray(raw)) {
        const sliced = raw.length > MAX_PREVIEW_ITEMS ? raw.slice(0, MAX_PREVIEW_ITEMS) : raw;
        const text = JSON.stringify(sliced, null, 2);
        const clamped = clampText(text, MAX_PREVIEW_CHARS);
        return { text: clamped.text, truncated: clamped.truncated || raw.length > MAX_PREVIEW_ITEMS, language: 'json' as const };
    }
    if (raw && typeof raw === 'object') {
        const keys = Object.keys(raw);
        let snapshot = raw;
        let truncated = false;
        if (keys.length > MAX_PREVIEW_KEYS) {
            truncated = true;
            snapshot = keys.slice(0, MAX_PREVIEW_KEYS).reduce<Record<string, any>>((acc, key) => {
                acc[key] = (raw as Record<string, any>)[key];
                return acc;
            }, {});
        }
        const text = JSON.stringify(snapshot, null, 2);
        const clamped = clampText(text, MAX_PREVIEW_CHARS);
        return { text: clamped.text, truncated: clamped.truncated || truncated, language: 'json' as const };
    }
    const clamped = clampText(String(raw), MAX_PREVIEW_CHARS);
    return { text: clamped.text, truncated: clamped.truncated, language: 'plain' as const };
};

const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    current += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                row.push(current);
                current = '';
            } else if (char === '\n') {
                row.push(current);
                rows.push(row);
                row = [];
                current = '';
            } else if (char === '\r') {
                // ignore CR
            } else {
                current += char;
            }
        }
    }
    row.push(current);
    if (row.length > 1 || row[0] !== '' || rows.length > 0) rows.push(row);
    return rows;
};

const getTableData = (raw: any) => {
    if (!raw) return null;
    if (typeof raw === 'string') {
        const text = raw.trim();
        if (!text.includes(',') || !text.includes('\n')) return null;
        const rows = parseCsvRows(text).filter((r) => r.some((cell) => String(cell || '').trim() !== ''));
        if (rows.length < 2) return null;
        const header = rows[0].map((cell, idx) => {
            const trimmed = String(cell || '').trim();
            return trimmed || `column_${idx + 1}`;
        });
        const body = rows.slice(1);
        if (header.length < 2) return null;
        return { headers: header, rows: body };
    }
    if (Array.isArray(raw)) {
        if (raw.length === 0) return null;
        if (raw.every((item) => item && typeof item === 'object' && !Array.isArray(item))) {
            const headers: string[] = [];
            raw.forEach((item) => {
                Object.keys(item).forEach((key) => {
                    if (!headers.includes(key)) headers.push(key);
                });
            });
            if (headers.length === 0) return null;
            const rows = raw.map((item) => headers.map((key) => item[key] ?? ''));
            return { headers, rows };
        }
        if (raw.every((item) => Array.isArray(item))) {
            const maxCols = Math.max(...raw.map((item) => item.length));
            const headers = Array.from({ length: maxCols }, (_, idx) => `column_${idx + 1}`);
            return { headers, rows: raw };
        }
        return null;
    }
    if (raw && typeof raw === 'object') {
        const headers = Object.keys(raw);
        if (headers.length === 0) return null;
        return { headers, rows: [headers.map((key) => raw[key] ?? '')] };
    }
    return null;
};

const getExportPayload = (raw: any, tableData: { headers: string[]; rows: any[][] } | null) => {
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'string') {
        if (tableData) {
            return { content: raw, mime: 'text/csv', ext: 'csv' };
        }
        return { content: raw, mime: 'application/json', ext: 'json' };
    }
    return { content: JSON.stringify(raw, null, 2), mime: 'application/json', ext: 'json' };
};

const downloadText = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const ResultsPane: React.FC<ResultsPaneProps> = ({ results, pinnedResults, isExecuting, isHeadful, runId, onConfirm, onNotify, onPin, onUnpin, fullWidth }) => {
    const [copied, setCopied] = useState<string | null>(null);
    const [dataView, setDataView] = useState<'raw' | 'table'>('raw');
    const [mainView, setMainView] = useState<'data' | 'downloads'>('data');
    const [resultView, setResultView] = useState<'latest' | 'pinned'>(() => (pinnedResults && !results ? 'pinned' : 'latest'));
    const [headfulViewer, setHeadfulViewer] = useState<'checking' | 'native' | 'novnc'>('checking');
    const [capturesOpen, setCapturesOpen] = useState(false);
    const [capturesLoading, setCapturesLoading] = useState(false);
    const [captures, setCaptures] = useState<CaptureEntry[]>([]);
    const headfulFrameRef = useRef<HTMLDivElement | null>(null);
    const activeResults = resultView === 'pinned' && pinnedResults ? pinnedResults : results;
    const tableData = useMemo(() => getTableData(activeResults?.data), [activeResults?.data]);
    const preview = useMemo(() => activeResults && activeResults.data !== undefined && activeResults.data !== null && activeResults.data !== ''
        ? getResultsPreview(activeResults)
        : null, [activeResults]);
    const screenshotSrc = useMemo(() => activeResults?.screenshotUrl
        ? `${activeResults.screenshotUrl}${resultView === 'latest' ? `?t=${Date.now()}` : ''}`
        : null, [activeResults, resultView]);
    const renderCellValue = (value: any) => {
        const boolValue = normalizeBoolean(value);
        if (boolValue !== null) {
            if (!boolValue) return '';
            return <MaterialIcon name="check" className="text-xs text-blue-400" />;
        }
        return value ?? '';
    };

    const loadCaptures = async () => {
        setCapturesLoading(true);
        try {
            const query = runId ? `?runId=${encodeURIComponent(runId)}` : '';
            const res = await fetch(`/api/data/captures${query}`);
            const data = res.ok ? await res.json() : { captures: [] };
            setCaptures(Array.isArray(data.captures) ? data.captures : []);
        } catch {
            setCaptures([]);
        } finally {
            setCapturesLoading(false);
        }
    };

    useEffect(() => {
        if (tableData) {
            setDataView('table');
        } else {
            setDataView('raw');
        }
        if (!activeResults?.downloads || activeResults.downloads.length === 0) {
            setMainView('data');
        } else if (!activeResults?.data) {
            setMainView('downloads');
        }
    }, [activeResults]);

    useEffect(() => {
        if (results) {
            setResultView('latest');
            return;
        }
        if (pinnedResults) setResultView('pinned');
    }, [results, pinnedResults]);

    useEffect(() => {
        if (!pinnedResults && resultView === 'pinned') {
            setResultView('latest');
        }
    }, [pinnedResults, resultView]);

    useEffect(() => {
        if (!isHeadful || resultView !== 'latest') return;
        let cancelled = false;
        const checkHeadful = async () => {
            try {
                const test = await fetch('/novnc/core/rfb.js', { method: 'HEAD', cache: 'no-store' });
                if (!cancelled) setHeadfulViewer(test.ok ? 'novnc' : 'native');
            } catch {
                if (!cancelled) setHeadfulViewer('native');
            }
        };
        checkHeadful();
        return () => {
            cancelled = true;
        };
    }, [isHeadful, resultView]);

    const handleCopy = async (text: string, id: string, options?: { skipSizeConfirm?: boolean; truncatedNotice?: boolean }) => {
        if (!text) {
            onNotify('Nothing to copy.', 'error');
            return;
        }
        let copyText = text;
        if (!options?.skipSizeConfirm && text.length > MAX_COPY_CHARS) {
            const confirmed = await onConfirm({
                message: `Copying ${formatSize(text.length)} may freeze your browser.`,
                confirmLabel: 'Copy full',
                cancelLabel: 'Copy segment'
            });
            if (!confirmed) {
                copyText = text.slice(0, MAX_COPY_CHARS);
            }
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(copyText);
            } else {
                const textArea = document.createElement('textarea');
                textArea.value = copyText;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                textArea.remove();
            }
            setCopied(id);
            setTimeout(() => setCopied(null), 2000);
            if (options?.truncatedNotice) {
                onNotify('Copied truncated data.', 'success');
            } else if (copyText.length !== text.length) {
                onNotify('Copied a truncated preview.', 'success');
            }
        } catch (err) {
            console.error('Copy failed:', err);
            onNotify('Copy failed.', 'error');
        }
    };

    if (isHeadful && resultView === 'latest') {
        const { origin, hostname } = window.location;
        const headfulUrl = `${origin}/novnc.html?host=${hostname}&path=websockify`;
        const requestFullscreen = () => {
            const target = headfulFrameRef.current;
            if (!target) return;
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {
                    // ignore
                });
                return;
            }
            target.requestFullscreen?.().catch(() => {
                // ignore
            });
        };
        if (headfulViewer === 'native') {
            return (
                <div className="glass-card rounded-[32px] overflow-hidden h-[80vh] w-full relative flex flex-col items-center justify-center p-8 text-center gap-4">
                    <div className="text-[12px] font-bold uppercase tracking-widest text-white">
                        Headful Session Active
                    </div>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80 max-w-lg leading-relaxed">
                        Doppelganger is not optimized for native browser windows. Please install the proper tools for stability (Xvfb, x11vnc, websockify) or simply use the Docker version.
                    </div>
                </div>
            );
        }
        if (headfulViewer === 'checking') {
            return (
                <div className="glass-card rounded-[32px] overflow-hidden h-[80vh] w-full relative flex items-center justify-center">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                        Checking headful viewer...
                    </div>
                </div>
            );
        }
        return (
            <div ref={headfulFrameRef} className="glass-card rounded-[32px] overflow-hidden h-[80vh] w-full relative">
                <button
                    type="button"
                    onClick={requestFullscreen}
                    className="absolute top-4 right-4 z-10 px-3 py-2 rounded-xl border border-white/20 bg-black/40 text-[9px] font-bold uppercase tracking-widest text-white/80 hover:bg-black/60 transition-all"
                    title="Toggle fullscreen"
                >
                    Fullscreen
                </button>
                <iframe
                    src={headfulUrl}
                    className="absolute inset-0 w-full h-full"
                    title="Headful Browser"
                />
            </div>
        );
    }

    if (!activeResults && !(isExecuting && resultView === 'latest')) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-20">
                <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center">
                    <MaterialIcon name="terminal" className="text-2xl text-white" />
                </div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em]">Ready</p>
            </div>
        );
    }

    const containerClassName = fullWidth ? 'space-y-12 relative z-10 w-full' : 'space-y-12 relative z-10 max-w-5xl mx-auto';

    return (
        <div className={containerClassName}>
            <div className="flex items-end justify-between border-b border-white/5 pb-10">
                <div className="space-y-4">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.3em]">Preview</p>
                    <h2 className="text-xl font-mono text-white truncate max-w-xl tracking-tight italic">
                        {activeResults?.finalUrl || activeResults?.url || ''}
                    </h2>
                </div>
                <div className={`px-4 py-2 rounded-xl text-[9px] font-bold uppercase tracking-[0.2em] ${resultView === 'pinned'
                    ? 'bg-amber-500/10 text-amber-300'
                    : isExecuting
                        ? 'bg-blue-500/10 text-blue-400 animate-pulse'
                        : 'bg-green-500/10 text-green-400'
                    }`}>
                    {resultView === 'pinned' ? 'Pinned' : (isExecuting ? 'Running' : 'Finished')}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                <div className="glass-card rounded-[32px] overflow-hidden flex flex-col min-h-[400px]">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                        <span>Screenshot</span>
                        <div className="flex items-center gap-2">
                            <span className="text-white/20">{activeResults?.timestamp || '--:--:--'}</span>
                            <button
                                type="button"
                                onClick={() => {
                                    setCapturesOpen(true);
                                    loadCaptures();
                                }}
                                className="px-3 py-2 rounded-xl border border-white/10 text-[8px] font-bold uppercase tracking-widest text-white/70 hover:text-white hover:bg-white/5 transition-all"
                            >
                                View All Captures
                            </button>
                        </div>
                    </div>
                    <div className="relative bg-black flex-1 flex items-center justify-center overflow-hidden">
                        {screenshotSrc ? (
                            <img
                                src={screenshotSrc}
                                className="absolute inset-0 w-full h-full object-contain transition-opacity duration-1000"
                            />
                        ) : (
                            <div className="text-[8px] font-bold text-white/5 uppercase tracking-widest">Waiting for Frame...</div>
                        )}
                    </div>
                </div>
                <div className="glass-card rounded-[32px] p-8 flex flex-col h-[400px]">
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mb-6 border-b border-white/5 pb-4">Activity Log</span>
                    <div className="flex-1 font-mono text-[10px] text-gray-400 space-y-2 overflow-y-auto custom-scrollbar pr-2">
                        {activeResults?.logs?.map((log: string, i: number) => (
                            <div key={i} className="flex gap-2">
                                <span className="text-white/10 shrink-0">›</span> <span>{log}</span>
                            </div>
                        ))}
                        {isExecuting && resultView === 'latest' && (!activeResults?.logs || activeResults?.logs.length === 0) && <div className="animate-pulse">Connecting to kernel...</div>}
                    </div>
                </div>
            </div>

            {capturesOpen && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
                    <div className="glass-card rounded-[32px] w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-white/10 flex items-center justify-between">
                            <div>
                                <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Captures</div>
                                <div className="text-sm font-bold text-white">Recordings and Screenshots</div>
                            </div>
                            <button
                                onClick={() => setCapturesOpen(false)}
                                className="px-3 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all bg-white/5 border-white/10 text-white hover:bg-white/10"
                            >
                                Close
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            {capturesLoading && (
                                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Loading captures...</div>
                            )}
                            {!capturesLoading && captures.length === 0 && (
                                <div className="text-[9px] text-gray-600 uppercase tracking-widest">No captures found.</div>
                            )}
                            {!capturesLoading && captures.length > 0 && (
                                <FixedSizeList
                                    height={Math.min(
                                        Math.max(CAPTURE_MODAL_ITEM_SIZE, captures.length * CAPTURE_MODAL_ITEM_SIZE),
                                        CAPTURE_MODAL_ITEM_SIZE * CAPTURE_MODAL_MAX_VISIBLE
                                    )}
                                    width="100%"
                                    itemCount={captures.length}
                                    itemSize={CAPTURE_MODAL_ITEM_SIZE}
                                    overscanCount={CAPTURE_MODAL_OVERSCAN}
                                    itemData={captures}
                                    className="custom-scrollbar"
                                >
                                    {renderCaptureModalItem}
                                </FixedSizeList>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="glass-card rounded-[32px] p-8 flex flex-col relative">
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6">
                    <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                        {mainView === 'downloads' ? 'Downloads' : 'Data'}
                    </span>
                    <div className="flex items-center gap-2">
                        {activeResults?.downloads && activeResults.downloads.length > 0 && (
                            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                                {(['data', 'downloads'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setMainView(mode)}
                                        className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${mainView === mode ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        )}
                        {pinnedResults && (
                            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                                {(['latest', 'pinned'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setResultView(mode)}
                                        className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${resultView === mode ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        )}
                        {tableData && mainView === 'data' && (
                            <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                                {(['table', 'raw'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => setDataView(mode)}
                                        className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${dataView === mode ? 'bg-white text-black' : 'text-gray-500 hover:text-white'}`}
                                    >
                                        {mode}
                                    </button>
                                ))}
                            </div>
                        )}
                        {resultView === 'pinned' ? (
                            <button
                                onClick={() => {
                                    onUnpin?.();
                                    setResultView('latest');
                                }}
                                className="px-3 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 bg-white/5 border-white/10 text-amber-200 hover:bg-white/10"
                                title="Unpin data"
                            >
                                Unpin
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    if (!activeResults) {
                                        onNotify('No data to pin.', 'error');
                                        return;
                                    }
                                    onPin?.(activeResults);
                                    setResultView('pinned');
                                }}
                                className="px-3 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                title="Pin data"
                            >
                                {pinnedResults ? 'Update Pin' : 'Pin'}
                            </button>
                        )}
                        {mainView === 'data' && (
                            <button
                                onClick={() => {
                                    const payload = getExportPayload(activeResults?.data, tableData);
                                    if (!payload) {
                                        onNotify('No data to export.', 'error');
                                        return;
                                    }
                                    const name = `doppelganger-data-${new Date().toISOString().replace(/[:.]/g, '-')}.${payload.ext}`;
                                    downloadText(name, payload.content, payload.mime);
                                    onNotify(`Exported ${payload.ext.toUpperCase()}.`, 'success');
                                }}
                                className="px-3 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                title="Export extracted data"
                            >
                                Export
                            </button>
                        )}
                        {mainView === 'downloads' && (
                            <button
                                onClick={async () => {
                                    if (!activeResults?.downloads || activeResults.downloads.length === 0) return;
                                    if (activeResults.downloads.length === 1) {
                                        const file = activeResults.downloads[0];
                                        const link = document.createElement('a');
                                        link.href = file.path;
                                        link.download = file.name;
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                        onNotify(`Downloading ${file.name}`, 'success');
                                        return;
                                    }
                                    onNotify('Generating ZIP...', 'success');
                                    try {
                                        const zip = new JSZip();
                                        for (const file of activeResults.downloads) {
                                            const res = await fetch(file.path);
                                            const blob = await res.blob();
                                            zip.file(file.name, blob);
                                        }
                                        const content = await zip.generateAsync({ type: 'blob' });
                                        const url = URL.createObjectURL(content);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `doppelganger-downloads-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
                                        document.body.appendChild(link);
                                        link.click();
                                        link.remove();
                                        URL.revokeObjectURL(url);
                                    } catch (err) {
                                        console.error('Failed to zip files:', err);
                                        onNotify('Failed to zip files.', 'error');
                                    }
                                }}
                                className="px-3 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                title={activeResults?.downloads?.length === 1 ? 'Download File' : 'Download ZIP'}
                            >
                                <MaterialIcon name="folder_zip" className="text-[14px]" />
                                {activeResults?.downloads?.length === 1 ? 'Download' : 'Download ZIP'}
                            </button>
                        )}
                        {mainView === 'data' && (
                            <button
                                onClick={async () => {
                                    const payload = getResultsCopyPayload(activeResults);
                                    if (payload.reason) {
                                        onNotify(payload.reason || 'Data too large to copy safely.', 'error');
                                        return;
                                    }
                                    const preview = getResultsPreview(activeResults);
                                    const fullText = getFullCopyText(payload.raw);
                                    let copyText = fullText;
                                    let usedTruncated = false;

                                    if (preview.truncated) {
                                        const confirmed = await onConfirm({
                                            message: 'Preview is truncated for performance.',
                                            confirmLabel: 'Copy full',
                                            cancelLabel: 'Copy preview'
                                        });
                                        if (!confirmed) {
                                            copyText = preview.text || '';
                                            usedTruncated = true;
                                        }
                                    }

                                    if (copyText.length > MAX_COPY_CHARS) {
                                        const proceed = await onConfirm({
                                            message: `Copying ${formatSize(copyText.length)} may freeze your browser.`,
                                            confirmLabel: 'Copy full',
                                            cancelLabel: usedTruncated ? 'Copy preview' : 'Copy truncated'
                                        });
                                        if (!proceed) {
                                            const truncated = getTruncatedCopyText(payload.raw);
                                            copyText = truncated.text;
                                            usedTruncated = true;
                                        }
                                    }

                                    void handleCopy(copyText, 'data', { skipSizeConfirm: true, truncatedNotice: usedTruncated });
                                }}
                                className={`px-3 py-2 border text-[9px] font-bold rounded-xl uppercase transition-all flex items-center gap-2 ${copied === 'data' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                title="Copy extracted data"
                            >
                                {copied === 'data' ? <MaterialIcon name="check" className="text-sm" /> : <MaterialIcon name="content_copy" className="text-sm" />}
                                {copied === 'data' ? 'Copied' : 'Copy'}
                            </button>
                        )}
                    </div>
                </div>
                {preview?.truncated && (
                    <button
                        type="button"
                        onClick={() => onNotify('Preview truncated for performance.', 'error')}
                        className="absolute top-5 right-5 h-2.5 w-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                        title="Preview truncated"
                        aria-label="Preview truncated"
                    />
                )}
                <div className="max-h-[70vh] overflow-y-auto custom-scrollbar pr-2 relative">
                    {(() => {
                        const hasData = activeResults && activeResults.data !== undefined && activeResults.data !== null && activeResults.data !== '';
                        const hasDownloads = activeResults && activeResults.downloads && activeResults.downloads.length > 0;
                        if (isExecuting && resultView === 'latest' && (!activeResults || (!hasData && !hasDownloads))) {
                            return <pre className="font-mono text-[10px] text-blue-300/60 whitespace-pre-wrap leading-relaxed">Buffering data stream...</pre>;
                        }
                        if (!activeResults || (!hasData && !hasDownloads)) {
                            return <pre className="font-mono text-[10px] text-blue-300/60 whitespace-pre-wrap leading-relaxed">No data available.</pre>;
                        }
                        return (
                            <div className="h-full">
                                {mainView === 'downloads' ? (
                                    <div className="space-y-2">
                                        {activeResults.downloads!.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:bg-white/[0.04] transition-colors">
                                                <div className="flex items-center gap-4 overflow-hidden pr-4">
                                                    <div className="p-3 bg-white/5 rounded-lg border border-white/10 shrink-0">
                                                        <MaterialIcon name={getFileIcon(file.name)} className="text-2xl text-white/70" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-sm font-bold text-white truncate">{file.name}</h4>
                                                        <p className="text-[10px] text-gray-500 truncate mt-1">{file.url}</p>
                                                    </div>
                                                </div>
                                                <a
                                                    href={file.path}
                                                    download={file.name}
                                                    className="shrink-0 p-3 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center"
                                                    title="Download file"
                                                >
                                                    <MaterialIcon name="download" className="text-[18px]" />
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                ) : tableData && dataView === 'table' ? (
                                    <div className="overflow-auto custom-scrollbar rounded-2xl border border-white/10">
                                        <table className="min-w-full table-auto text-[10px] text-left text-white/80 font-mono">
                                            <thead className="bg-white/5 text-[9px] uppercase tracking-widest text-white/50">
                                                <tr>
                                                    {tableData.headers.map((header) => (
                                                        <th key={header} className="px-3 py-2 border-b border-white/10 whitespace-nowrap">
                                                            {header}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tableData.rows.map((row, rowIndex) => (
                                                    <tr key={rowIndex} className="odd:bg-white/[0.02]">
                                                        {tableData.headers.map((_, colIndex) => (
                                                            <td key={`${rowIndex}-${colIndex}`} className="px-3 py-2 border-b border-white/5 align-top whitespace-normal break-words">
                                                                {renderCellValue(row[colIndex])}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <CodeEditor readOnly value={preview?.text || ''} language={preview?.language || 'plain'} />
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>
        </div>
    );
};

export default memo(ResultsPane);
