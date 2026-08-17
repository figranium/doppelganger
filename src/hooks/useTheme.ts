import { useState, useCallback, useEffect } from 'react';
import { THEMES, ThemeDefinition, ThemeId, DEFAULT_THEME_ID, getThemeById, applyThemeVars } from '../utils/theme';

const THEME_STORAGE_KEY = 'figranium.theme';
const THEME_INTRO_KEY = 'figranium.seenThemeIntro';

function setCookie(id: string) {
    if (typeof document === 'undefined') return;
    try {
        document.cookie = `figranium_theme=${id}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
        // ignore
    }
}

function getInitialTheme(): ThemeDefinition {
    if (typeof window === 'undefined') return getThemeById(DEFAULT_THEME_ID);
    try {
        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const raw of cookies) {
            const c = raw.trim();
            if (c.startsWith('figranium_theme=') || c.startsWith('theme=')) {
                const val = c.substring(c.indexOf('=') + 1).trim();
                if (val) return getThemeById(val);
            }
        }
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        return stored ? getThemeById(stored) : getThemeById(DEFAULT_THEME_ID);
    } catch {
        return getThemeById(DEFAULT_THEME_ID);
    }
}

export function useTheme() {
    const [theme, setThemeState] = useState<ThemeDefinition>(getInitialTheme);
    const [introOpen, setIntroOpen] = useState(false);

    useEffect(() => {
        applyThemeVars(theme);
        setCookie(theme.id);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme.id);
        } catch {
            // ignore
        }
    }, [theme]);

    // Fetch persisted theme from backend data on mount and sync
    useEffect(() => {
        let mounted = true;
        fetch('/api/settings/theme', { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (mounted && data && typeof data.theme === 'string') {
                    const serverTheme = getThemeById(data.theme);
                    setThemeState(serverTheme);
                    applyThemeVars(serverTheme);
                    setCookie(serverTheme.id);
                    try {
                        localStorage.setItem(THEME_STORAGE_KEY, serverTheme.id);
                    } catch { }
                }
            })
            .catch(() => { });
        return () => { mounted = false; };
    }, []);

    // Check whether to show the first-time popup
    useEffect(() => {
        try {
            const seen = localStorage.getItem(THEME_INTRO_KEY);
            if (!seen) {
                setIntroOpen(true);
            }
        } catch {
            // ignore
        }
    }, []);

    const setTheme = useCallback((id: ThemeId) => {
        const next = getThemeById(id);
        setThemeState(next);
        // Immediately apply theme and set cookie/localStorage for fast UI feedback
        applyThemeVars(next);
        setCookie(next.id);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next.id);
        } catch {
            // ignore
        }
        // Persist theme to backend data storage
        fetch('/api/settings/theme', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ theme: next.id })
        }).catch(err => {
            console.error('Failed to persist theme to backend data:', err);
        });
    }, []);

    const dismissIntro = useCallback(() => {
        setIntroOpen(false);
        try {
            localStorage.setItem(THEME_INTRO_KEY, 'true');
        } catch {
            // ignore
        }
    }, []);

    return {
        theme,
        setTheme,
        themes: THEMES,
        introOpen,
        dismissIntro,
    };
}