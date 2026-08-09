import { useState, useCallback, useEffect } from 'react';
import { THEMES, ThemeDefinition, ThemeId, DEFAULT_THEME_ID, getThemeById, applyThemeVars } from '../utils/theme';

const THEME_STORAGE_KEY = 'figranium.theme';
const THEME_INTRO_KEY = 'figranium.seenThemeIntro';

function getInitialTheme(): ThemeDefinition {
    if (typeof window === 'undefined') return getThemeById(DEFAULT_THEME_ID);
    try {
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
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme.id);
        } catch {
            // ignore
        }
    }, [theme]);

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
        // Immediately persist and apply so the switch is instant even before effect runs
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next.id);
        } catch {
            // ignore
        }
        applyThemeVars(next);
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