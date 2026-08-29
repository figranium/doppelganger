import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MaterialIcon from '../MaterialIcon';

export type SelectValue = string | number;

export interface CustomSelectOption<T extends SelectValue = string> {
    value: T;
    label: string;
    disabled?: boolean;
    icon?: string;
    iconClassName?: string;
    iconUrl?: string;
    iconImageClassName?: string;
}

interface CustomSelectProps<T extends SelectValue> {
    value: T;
    options: readonly CustomSelectOption<T>[];
    onChange: (value: T) => void;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel: string;
    className?: string;
}

interface MenuPosition {
    left: number;
    top?: number;
    bottom?: number;
    width: number;
    maxHeight: number;
}

const getMenuPosition = (element: HTMLElement): MenuPosition => {
    const rect = element.getBoundingClientRect();
    const gap = 6;
    const edge = 12;
    const desiredHeight = 280;
    const roomBelow = window.innerHeight - rect.bottom - edge;
    const roomAbove = rect.top - edge;
    const openAbove = roomBelow < 180 && roomAbove > roomBelow;
    const maxHeight = Math.max(120, Math.min(desiredHeight, (openAbove ? roomAbove : roomBelow) - gap));
    const width = Math.min(Math.max(rect.width, 160), window.innerWidth - (edge * 2));
    const left = Math.max(edge, Math.min(rect.left, window.innerWidth - width - edge));
    return openAbove
        ? { left, bottom: window.innerHeight - rect.top + gap, width, maxHeight }
        : { left, top: rect.bottom + gap, width, maxHeight };
};

export default function CustomSelect<T extends SelectValue>({
    value,
    options,
    onChange,
    placeholder = 'Select…',
    disabled = false,
    ariaLabel,
    className = '',
}: CustomSelectProps<T>) {
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const searchRef = useRef('');
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const selectedIndex = options.findIndex((option) => option.value === value);
    const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
    const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

    const close = (restoreFocus = false) => {
        setPosition(null);
        if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
    };

    const open = () => {
        if (disabled || !triggerRef.current) return;
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, options.findIndex((option) => !option.disabled)));
        setPosition(getMenuPosition(triggerRef.current));
    };

    useEffect(() => {
        if (!position) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
        };
        const handleResize = () => close();
        const handleScroll = (event: Event) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            close();
        };
        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleScroll, true);
        requestAnimationFrame(() => menuRef.current?.focus());
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [position]);

    useEffect(() => () => {
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    }, []);

    const moveActive = (direction: 1 | -1) => {
        if (!options.length) return;
        let next = activeIndex;
        for (let count = 0; count < options.length; count += 1) {
            next = (next + direction + options.length) % options.length;
            if (!options[next].disabled) {
                setActiveIndex(next);
                requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${next}"]`)?.scrollIntoView({ block: 'nearest' }));
                return;
            }
        }
    };

    const selectOption = (option: CustomSelectOption<T>) => {
        if (option.disabled) return;
        onChange(option.value);
        close(true);
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (!position && ['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            open();
            return;
        }
        if (!position) return;
        if (event.key === 'Escape' || event.key === 'Tab') {
            if (event.key === 'Escape') event.preventDefault();
            close(event.key === 'Escape');
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveActive(event.key === 'ArrowDown' ? 1 : -1);
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const indexes = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
            const next = event.key === 'Home' ? indexes[0]?.index : indexes[indexes.length - 1]?.index;
            if (next !== undefined) setActiveIndex(next);
        } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (options[activeIndex]) selectOption(options[activeIndex]);
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            searchRef.current += event.key.toLowerCase();
            const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(searchRef.current));
            if (match >= 0) setActiveIndex(match);
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => { searchRef.current = ''; }, 600);
        }
    };

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                aria-label={ariaLabel}
                aria-expanded={!!position}
                aria-haspopup="listbox"
                disabled={disabled}
                onClick={() => position ? close() : open()}
                onKeyDown={handleKeyDown}
                className={`custom-dropdown-trigger ${className}`}
            >
                <span className="flex items-center gap-2 min-w-0">
                    {selected?.iconUrl ? <img src={selected.iconUrl} alt="" className={`w-4 h-4 object-contain shrink-0 ${selected.iconImageClassName || ''}`} /> : null}
                    {!selected?.iconUrl && selected?.icon ? <MaterialIcon name={selected.icon} className={`text-base shrink-0 ${selected.iconClassName || 'theme-text-faint'}`} /> : null}
                    <span className={`truncate ${selected ? '' : 'theme-text-faint'}`}>{selected?.label || placeholder}</span>
                </span>
                <MaterialIcon name="expand_more" className={`text-base shrink-0 transition-transform ${position ? 'rotate-180' : ''}`} />
            </button>
            {position ? createPortal(
                <div
                    ref={menuRef}
                    role="listbox"
                    aria-label={ariaLabel}
                    tabIndex={-1}
                    onKeyDown={handleKeyDown}
                    className="custom-dropdown-menu custom-scrollbar"
                    style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight }}
                >
                    {options.map((option, index) => (
                        <button
                            key={`${String(option.value)}-${index}`}
                            type="button"
                            role="option"
                            aria-selected={option.value === value}
                            disabled={option.disabled}
                            data-option-index={index}
                            onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                            onClick={() => selectOption(option)}
                            className={`custom-dropdown-option ${activeIndex === index ? 'custom-dropdown-option-active' : ''}`}
                        >
                            <span className="flex items-center gap-2 min-w-0">
                                {option.iconUrl ? <img src={option.iconUrl} alt="" className={`w-4 h-4 object-contain shrink-0 ${option.iconImageClassName || ''}`} /> : null}
                                {!option.iconUrl && option.icon ? <MaterialIcon name={option.icon} className={`text-base shrink-0 ${option.iconClassName || 'theme-text-faint'}`} /> : null}
                                <span className="truncate">{option.label}</span>
                            </span>
                            {option.value === value ? <MaterialIcon name="check" className="text-sm shrink-0" /> : null}
                        </button>
                    ))}
                </div>,
                document.body
            ) : null}
        </>
    );
}

interface CustomComboboxProps {
    value: string;
    options: string[];
    onChange: (value: string) => void;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    autoFocus?: boolean;
    onEnter?: () => void;
    onEscape?: () => void;
}

export function CustomCombobox({ value, options, onChange, ariaLabel, placeholder, disabled, className = '', autoFocus, onEnter, onEscape }: CustomComboboxProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [position, setPosition] = useState<MenuPosition | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const filtered = useMemo(() => {
        const query = value.trim().toLowerCase();
        return options.filter((option) => !query || option.toLowerCase().includes(query)).slice(0, 30);
    }, [options, value]);

    const open = () => {
        if (!disabled && inputRef.current && filtered.length) setPosition(getMenuPosition(inputRef.current));
    };
    const close = () => setPosition(null);

    useEffect(() => {
        if (!position) return;
        const handlePointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!inputRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
        };
        const handleResize = () => close();
        const handleScroll = (event: Event) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            close();
        };
        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [position]);

    const choose = (option: string) => {
        onChange(option);
        close();
        inputRef.current?.focus();
    };

    return (
        <>
            <div className={`relative ${className}`}>
                <input
                    ref={inputRef}
                    value={value}
                    onChange={(event) => { onChange(event.target.value); setActiveIndex(0); requestAnimationFrame(open); }}
                    onFocus={open}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown' && filtered.length) { event.preventDefault(); if (!position) open(); else setActiveIndex((index) => (index + 1) % filtered.length); }
                        else if (event.key === 'ArrowUp' && filtered.length) { event.preventDefault(); if (!position) open(); else setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length); }
                        else if (event.key === 'Enter') { event.preventDefault(); if (position && filtered[activeIndex]) choose(filtered[activeIndex]); else onEnter?.(); }
                        else if (event.key === 'Escape') { if (position) close(); else onEscape?.(); }
                    }}
                    placeholder={placeholder}
                    disabled={disabled}
                    aria-label={ariaLabel}
                    role="combobox"
                    aria-expanded={!!position}
                    aria-autocomplete="list"
                    className="w-full bg-transparent text-xs theme-text font-mono focus:outline-none"
                    autoFocus={autoFocus}
                />
                <button type="button" onClick={() => position ? close() : open()} className="absolute right-0 top-1/2 -translate-y-1/2 theme-text-faint" tabIndex={-1} aria-hidden="true">
                    <MaterialIcon name="expand_more" className="text-base" />
                </button>
            </div>
            {position && filtered.length ? createPortal(
                <div ref={menuRef} role="listbox" aria-label={`${ariaLabel} suggestions`} className="custom-dropdown-menu custom-scrollbar" style={{ left: position.left, top: position.top, bottom: position.bottom, width: position.width, maxHeight: position.maxHeight }}>
                    {filtered.map((option, index) => (
                        <button key={option} type="button" role="option" aria-selected={option === value} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)} className={`custom-dropdown-option ${activeIndex === index ? 'custom-dropdown-option-active' : ''}`}>
                            <span className="truncate font-mono normal-case tracking-normal">{option}</span>
                            {option === value ? <MaterialIcon name="check" className="text-sm" /> : null}
                        </button>
                    ))}
                </div>,
                document.body
            ) : null}
        </>
    );
}
