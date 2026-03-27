import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StickyNote as StickyNoteType, StickyNoteColor } from '../../types';
import MaterialIcon from '../MaterialIcon';
import CopyButton from '../CopyButton';

interface StickyNoteProps {
    note: StickyNoteType;
    canvasScale: number;
    isSelected?: boolean;
    onUpdate: (id: string, updates: Partial<StickyNoteType>) => void;
    onDelete: (id: string) => void;
    onDuplicate: (note: StickyNoteType) => void;
}

const COLOR_STYLES: Record<StickyNoteColor, { bg: string; border: string; header: string }> = {
    default: {
        bg: 'rgba(255,255,255,0.07)',
        border: 'rgba(255,255,255,0.18)',
        header: 'rgba(255,255,255,0.10)',
    },
    yellow: {
        bg: 'rgba(250,204,21,0.14)',
        border: 'rgba(250,204,21,0.40)',
        header: 'rgba(250,204,21,0.20)',
    },
    pink: {
        bg: 'rgba(236,72,153,0.14)',
        border: 'rgba(236,72,153,0.40)',
        header: 'rgba(236,72,153,0.20)',
    },
    green: {
        bg: 'rgba(34,197,94,0.14)',
        border: 'rgba(34,197,94,0.40)',
        header: 'rgba(34,197,94,0.20)',
    },
    purple: {
        bg: 'rgba(168,85,247,0.14)',
        border: 'rgba(168,85,247,0.40)',
        header: 'rgba(168,85,247,0.20)',
    },
};

const COLOR_DOT: Record<StickyNoteColor, string> = {
    default: '#ffffff',
    yellow: '#facc15',
    pink: '#ec4899',
    green: '#22c55e',
    purple: '#a855f7',
};

const ALL_COLORS: StickyNoteColor[] = ['default', 'yellow', 'pink', 'green', 'purple'];

const StickyNote: React.FC<StickyNoteProps> = ({ note, canvasScale, isSelected, onUpdate, onDelete, onDuplicate }) => {
    const [isEditing, setIsEditing] = useState(note.content === '');
    const [draft, setDraft] = useState(note.content);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
    const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

    const colors = COLOR_STYLES[note.color] || COLOR_STYLES.default;

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.select();
        }
    }, [isEditing]);

    // Drag header to move note
    const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: note.x,
            origY: note.y,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [note.x, note.y]);

    const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        if (!dragRef.current) return;
        const dx = (e.clientX - dragRef.current.startX) / canvasScale;
        const dy = (e.clientY - dragRef.current.startY) / canvasScale;
        onUpdate(note.id, {
            x: Math.round(dragRef.current.origX + dx),
            y: Math.round(dragRef.current.origY + dy),
        });
    }, [canvasScale, note.id, onUpdate]);

    const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        dragRef.current = null;
    }, []);

    // Resize handle (bottom-right corner)
    const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origW: note.width,
            origH: note.height,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }, [note.width, note.height]);

    const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        if (!resizeRef.current) return;
        const dx = (e.clientX - resizeRef.current.startX) / canvasScale;
        const dy = (e.clientY - resizeRef.current.startY) / canvasScale;
        onUpdate(note.id, {
            width: Math.round(Math.max(160, resizeRef.current.origW + dx)),
            height: Math.round(Math.max(100, resizeRef.current.origH + dy)),
        });
    }, [canvasScale, note.id, onUpdate]);

    const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
        e.stopPropagation();
        resizeRef.current = null;
    }, []);

    const commitEdit = useCallback(() => {
        onUpdate(note.id, { content: draft });
        setIsEditing(false);
    }, [note.id, draft, onUpdate]);

    return (
        <>
        <div
            data-sticky-note-id={note.id}
            className="absolute select-none group"
            style={{
                left: note.x,
                top: note.y,
                width: note.width,
                height: note.height,
                zIndex: 5,
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const padding = 8, menuW = 200, menuH = 164;
                const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - menuW - padding);
                const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - menuH - padding);
                setContextMenu({ x, y });
            }}
        >
            <div
                className="w-full h-full rounded-xl flex flex-col overflow-hidden"
                style={{
                    background: colors.bg,
                    border: `1px solid ${isSelected ? 'rgba(96,165,250,0.8)' : colors.border}`,
                    boxShadow: isSelected ? '0 0 0 2px rgba(59,130,246,0.4), 0 4px 24px rgba(0,0,0,0.4)' : '0 4px 24px rgba(0,0,0,0.4)',
                }}
            >
                {/* Header / drag handle */}
                <div
                    className="flex items-center justify-between px-2.5 py-1.5 cursor-grab active:cursor-grabbing shrink-0"
                    style={{ background: colors.header }}
                    onPointerDown={handleDragPointerDown}
                    onPointerMove={handleDragPointerMove}
                    onPointerUp={handleDragPointerUp}
                    onPointerCancel={handleDragPointerUp}
                >
                    {/* Color swatches */}
                    <div className="flex items-center gap-1" style={{ opacity: isEditing ? 1 : 0, pointerEvents: isEditing ? 'auto' : 'none', transition: 'opacity 0.15s' }}>
                        {ALL_COLORS.map((c) => (
                            <button
                                key={c}
                                className="w-3 h-3 rounded-full transition-all hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                style={{
                                    background: COLOR_DOT[c],
                                    opacity: note.color === c ? 1 : 0.35,
                                    outline: note.color === c ? `1.5px solid ${COLOR_DOT[c]}` : 'none',
                                    outlineOffset: '1px',
                                }}
                                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); onUpdate(note.id, { color: c }); }}
                                title={`Set color to ${c}`}
                                aria-label={`Set color to ${c}`}
                            />
                        ))}
                    </div>

                    {/* Edit / copy / delete buttons */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-200">
                        <button
                            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setIsEditing(true); setDraft(note.content); }}
                            title="Edit note"
                            aria-label="Edit note"
                        >
                            <MaterialIcon name="edit" className="text-[14px]" />
                        </button>
                        <CopyButton
                            text={note.content}
                            title="Copy note"
                            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            iconClassName="text-[14px]"
                        />
                        <button
                            className="w-6 h-6 rounded flex items-center justify-center text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                            title="Delete note"
                            aria-label="Delete note"
                        >
                            <MaterialIcon name="close" className="text-[14px]" />
                        </button>
                    </div>
                </div>

                {/* Content area */}
                <div
                    className="flex-1 overflow-auto min-h-0 custom-scrollbar"
                    onDoubleClick={() => { if (!isEditing) { setIsEditing(true); setDraft(note.content); } }}
                >
                    {isEditing ? (
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') commitEdit();
                                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitEdit();
                                e.stopPropagation();
                            }}
                            className="w-full h-full resize-none bg-transparent px-3 py-2 text-xs text-white/80 placeholder-white/20 focus:outline-none font-mono leading-relaxed"
                            placeholder="Write markdown here..."
                            style={{ minHeight: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <div
                            className="px-3 py-2 text-xs text-white/75 leading-relaxed overflow-auto h-full cursor-text custom-scrollbar font-mono whitespace-pre-wrap"
                        >
                            {note.content || <span className="text-white/20 italic">Double-click to edit...</span>}
                        </div>
                    )}
                </div>

                {/* Resize handle */}
                <div
                    className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize flex items-end justify-end pb-1 pr-1"
                    onPointerDown={handleResizePointerDown}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerUp}
                    onPointerCancel={handleResizePointerUp}
                >
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                        <path d="M7 1L1 7M7 4L4 7" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                </div>
            </div>
        </div>

        {contextMenu && createPortal(
            <>
                <div
                    className="fixed inset-0 z-40"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
                />
                <div
                    className="fixed z-50 w-[200px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-[10px] font-bold uppercase tracking-widest text-white/80"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5"
                        onClick={() => { onDuplicate(note); setContextMenu(null); }}
                    >
                        <span className="material-symbols-outlined text-white/40" style={{ fontSize: '14px' }}>copy_all</span>
                        Duplicate
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5"
                        onClick={() => {
                            navigator.clipboard.writeText(note.content).catch(() => {});
                            setContextMenu(null);
                        }}
                    >
                        <span className="material-symbols-outlined text-white/40" style={{ fontSize: '14px' }}>content_copy</span>
                        Copy
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2.5"
                        onClick={() => {
                            navigator.clipboard.writeText(note.content).catch(() => {});
                            onDelete(note.id);
                            setContextMenu(null);
                        }}
                    >
                        <span className="material-symbols-outlined text-white/40" style={{ fontSize: '14px' }}>content_cut</span>
                        Cut
                    </button>
                    <button
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-red-400 flex items-center gap-2.5"
                        onClick={() => { onDelete(note.id); setContextMenu(null); }}
                    >
                        <span className="material-symbols-outlined text-red-400/70" style={{ fontSize: '14px' }}>delete</span>
                        Delete
                    </button>
                </div>
            </>,
            document.body
        )}
        </>
    );
};

export default StickyNote;
