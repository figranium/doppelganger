import React, { useState, useCallback, useRef } from 'react';
import MaterialIcon from '../../MaterialIcon';

interface VariableTablesTabProps {
    rows: any[];
    fleetConfig: any;
    onNotify: (msg: string, tone?: 'success' | 'error') => void;
}

const VariableTablesTab: React.FC<VariableTablesTabProps> = ({ rows, onNotify }) => {
    const [pastedData, setPastedData] = useState('');
    const [importMode, setImportMode] = useState<'csv' | 'tsv' | 'json'>('csv');
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewRows, setPreviewRows] = useState<any[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Parse pasted or file content into rows
    const parseContent = useCallback((content: string, mode: 'csv' | 'tsv' | 'json') => {
        try {
            if (mode === 'json') {
                const parsed = JSON.parse(content);
                const arr = Array.isArray(parsed) ? parsed : [parsed];
                const hdrs = arr.length > 0 ? Object.keys(arr[0]) : [];
                setHeaders(hdrs);
                setPreviewRows(arr.slice(0, 50));
            } else {
                const separator = mode === 'tsv' ? '\t' : ',';
                const lines = content.split('\n').filter(l => l.trim());
                if (lines.length === 0) { setHeaders([]); setPreviewRows([]); return; }
                const parsedHeaders = lines[0].split(separator).map(h => h.trim());
                const parsedRows = lines.slice(1).map((line) => {
                    const cells = line.split(separator);
                    const row: Record<string, string> = {};
                    parsedHeaders.forEach((h, i) => { row[h] = cells[i]?.trim() || ''; });
                    return row;
                });
                setHeaders(parsedHeaders);
                setPreviewRows(parsedRows.slice(0, 50));
            }
        } catch (e: any) {
            onNotify(`Parse error: ${e.message}`, 'error');
            setHeaders([]);
            setPreviewRows([]);
        }
    }, [onNotify]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        setPastedData(text);
        parseContent(text, importMode);
    }, [importMode, parseContent]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setPastedData(e.target.value);
        parseContent(e.target.value, importMode);
    }, [importMode, parseContent]);

    const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        setPastedData(text);
        let mode: 'csv' | 'tsv' | 'json' = 'csv';
        if (file.name.endsWith('.tsv')) mode = 'tsv';
        else if (file.name.endsWith('.json')) mode = 'json';
        setImportMode(mode);
        parseContent(text, mode);
    }, [parseContent]);

    const handleImport = useCallback(async () => {
        if (previewRows.length === 0) {
            onNotify('No data to import', 'error');
            return;
        }
        try {
            await fetch('/api/fleet/variables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rows: previewRows, headers }),
            });
            onNotify(`Imported ${previewRows.length} rows`, 'success');
        } catch (e: any) {
            onNotify(`Import failed: ${e.message}`, 'error');
        }
    }, [previewRows, headers, onNotify]);

    // Interpolation helper
    const interpolatePreview = useCallback((text: string) => {
        return text.replace(/\{\$(\w+)\}/g, (match, varName) => {
            const row = rows[0] || {};
            return row[varName] !== undefined ? String(row[varName]) : match;
        });
    }, [rows]);

    const interpolationExample = 'Navigate to {$targetUrl} and extract {$result}';

    return (
        <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 space-y-4">
                {/* CSV/TSV/JSON ingestion */}
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <label className="text-[7px] font-bold uppercase text-gray-600 tracking-widest">Import Format</label>
                        <div className="flex gap-1">
                            {(['csv', 'tsv', 'json'] as const).map((fmt) => (
                                <button
                                    key={fmt}
                                    onClick={() => setImportMode(fmt)}
                                    className={`px-2 py-1 rounded text-[9px] font-bold uppercase transition-all ${importMode === fmt ? 'bg-cyan-400/20 text-cyan-400 border border-cyan-400/40' : 'bg-white/5 text-white/40 hover:bg-white/10'} focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50`}
                                >
                                    {fmt.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs font-bold hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 flex items-center gap-1"
                        >
                            <MaterialIcon name="upload_file" className="text-sm" />
                            From File
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.tsv,.json,.txt"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <span className="text-[8px] text-gray-600">Or paste directly below (Cmd/Ctrl+V detected)</span>
                    </div>

                    <textarea
                        value={pastedData}
                        onChange={handleInputChange}
                        onPaste={handlePaste}
                        placeholder="Paste CSV/TSV/JSON data here or drag & drop a file..."
                        className="w-full h-32 bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400/50 transition-all custom-scrollbar resize-none"
                    />
                </div>

                {/* Live preview */}
                {headers.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[7px] font-bold uppercase text-gray-600 tracking-widest">
                                Preview ({previewRows.length} / {rows.length} total rows)
                            </label>
                            <button
                                onClick={handleImport}
                                className="px-3 py-1 rounded-lg bg-cyan-400 text-black text-[9px] font-bold uppercase hover:scale-105 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                            >
                                Import →
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="border border-white/10 rounded-xl overflow-hidden text-[9px] font-mono">
                                <thead>
                                    <tr className="bg-white/5">
                                        {headers.map((h) => (
                                            <th key={h} className="px-2 py-1 text-left text-gray-500 uppercase">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewRows.map((row, i) => (
                                        <tr key={i} className="border-t border-white/5">
                                            {headers.map((h) => (
                                                <td key={h} className="px-2 py-0.5 text-white/60 truncate max-w-[120px]">{row[h] || '—'}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Interpolation preview */}
                <div className="space-y-1">
                    <label className="text-[7px] font-bold uppercase text-gray-600 tracking-widest">Variable Interpolation</label>
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-3 space-y-1">
                        <p className="text-[9px] text-gray-500">
                            Use <span className="text-cyan-400 font-mono">{'{$varName}'}</span> syntax in actions. Example:
                        </p>
                        <p className="text-[10px] font-mono text-white/60">{interpolationExample}</p>
                        <p className="text-[9px] text-gray-500">Interpolated:</p>
                        <p className="text-[10px] font-mono text-cyan-400">{interpolatePreview(interpolationExample)}</p>
                    </div>
                </div>

                {/* Worker ↔ Row mapping info */}
                <div className="space-y-1 pt-2 border-t border-white/5">
                    <label className="text-[7px] font-bold uppercase text-gray-600 tracking-widest">Worker Mapping</label>
                    <p className="text-[9px] text-gray-500">Each worker N is mapped to CSV row N. The variable table below maps worker IDs to their current row data.</p>
                    <div className="grid grid-cols-[120px_1fr_80px] gap-1 text-[9px]">
                        <div className="text-gray-500 font-bold uppercase">Worker ID</div>
                        <div className="text-gray-500 font-bold uppercase">Row Key</div>
                        <div className="text-gray-500 font-bold uppercase">Row #</div>
                    </div>
                    {rows.slice(0, 100).map((_, i) => (
                        <div key={i} className="grid grid-cols-[120px_1fr_80px] gap-1 text-[9px] border-t border-white/5">
                            <div className="text-white/40 font-mono">worker_{i + 1}</div>
                            <div className="text-white/30 truncate">{rows[i]?.$rowKey || i}</div>
                            <div className="text-white/40">{i + 1}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default VariableTablesTab;
