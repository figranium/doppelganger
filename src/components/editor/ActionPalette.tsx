import { useMemo, useRef, useEffect, useState } from 'react';
import MaterialIcon from '../MaterialIcon';
import { Action } from '../../types';
import { ACTION_CATALOG } from './actionCatalog';

interface ActionPaletteProps {
    open: boolean;
    query: string;
    onQueryChange: (value: string) => void;
    onClose: () => void;
    onSelect: (type: Action['type']) => void;
}

const ActionPalette: React.FC<ActionPaletteProps> = ({ open, query, onQueryChange, onClose, onSelect }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        if (open) {
            setActiveIndex(0);
            const timer = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(timer);
        }
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return !q ? ACTION_CATALOG : ACTION_CATALOG.filter((item) =>
            item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
        );
    }, [query]);

    useEffect(() => {
        setActiveIndex(0);
    }, [query]);

    useEffect(() => {
        if (open && scrollContainerRef.current) {
            const activeEl = scrollContainerRef.current.querySelector(`[data-index="${activeIndex}"]`) as HTMLElement;
            if (activeEl) {
                activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    }, [activeIndex, open]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            if (query) {
                e.stopPropagation();
                onQueryChange('');
            } else {
                onClose();
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 2 < filtered.length ? prev + 2 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 2 >= 0 ? prev - 2 : prev));
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1 < filtered.length ? prev + 1 : prev));
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 >= 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[activeIndex]) {
                onSelect(filtered[activeIndex].type);
            }
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[190] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6"
            onClick={onClose}
        >
            <div
                className="glass-card w-full max-w-xl rounded-[28px] border border-white/10 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-500">Add Block</p>
                        <p className="text-xs text-gray-400 mt-1">Search actions and control flow blocks.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl border border-white/10 text-white/70 hover:text-white hover:bg-white/5 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        aria-label="Close"
                        title="Close palette"
                    >
                        <MaterialIcon name="close" className="text-base" />
                    </button>
                </div>
                <div className="relative group/search">
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => onQueryChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type to filter (e.g., if, click, while)"
                        aria-label="Search actions"
                        aria-activedescendant={filtered[activeIndex] ? `action-item-${filtered[activeIndex].type}` : undefined}
                        className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 pr-10 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 transition-all focus-visible:ring-2 focus-visible:ring-white/20"
                    />
                    {query && (
                        <button
                            onClick={() => { onQueryChange(''); inputRef.current?.focus(); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                            aria-label="Clear search"
                            title="Clear search"
                        >
                            <MaterialIcon name="cancel" className="text-lg" />
                        </button>
                    )}
                </div>
                <div ref={scrollContainerRef} className="mt-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    <div className="grid grid-cols-2 gap-3 pb-2" role="listbox">
                        {filtered.map((item, idx) => (
                            <button
                                key={item.type}
                                id={`action-item-${item.type}`}
                                data-index={idx}
                                role="option"
                                aria-selected={idx === activeIndex}
                                onClick={() => onSelect(item.type)}
                                className={`flex flex-col items-start gap-2 text-left p-4 rounded-2xl border transition-all hover:scale-[1.02] active:scale-95 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${idx === activeIndex ? 'bg-white/10 border-white/30 ring-1 ring-white/20' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.08] hover:border-white/20'}`}
                            >
                                <MaterialIcon name={item.icon || 'extension'} className="text-2xl text-white/80 group-hover:text-white transition-colors shrink-0 mb-1" />
                                <div>
                                    <div className="text-[11px] font-bold uppercase tracking-widest text-white/90 group-hover:text-white mb-1">{item.label}</div>
                                    <div className="text-[10px] text-gray-500 line-clamp-2 leading-relaxed">{item.description}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                    {filtered.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                            <MaterialIcon name="search_off" className="text-4xl text-white/10" />
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">No matches found</p>
                                <p className="text-[10px] text-gray-600">Try a different search term or browse the catalog.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActionPalette;
