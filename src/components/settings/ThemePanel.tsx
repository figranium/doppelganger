import React from 'react';
import { ThemeDefinition, THEMES } from '../../utils/theme';
import MaterialIcon from '../MaterialIcon';

interface ThemePanelProps {
    currentThemeId: string;
    onSelect: (theme: ThemeDefinition) => void;
}

const ThemePanel: React.FC<ThemePanelProps> = ({ currentThemeId, onSelect }) => {
    return (
        <div className="app-panel p-7">
            <div className="mb-6">
                <h3 className="text-sm font-bold theme-text flex items-center gap-2">
                    <MaterialIcon name="palette" className="text-xl" />
                    Theme
                </h3>
                <p className="text-xs theme-text-faint mt-1">Choose how Figranium looks</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {THEMES.map((theme) => {
                    const isActive = theme.id === currentThemeId;
                    return (
                        <button
                            key={theme.id}
                            onClick={() => onSelect(theme)}
                            className={`group relative rounded-2xl overflow-hidden border transition-all duration-300 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                                isActive
                                    ? 'border-white bg-white/10 ring-2 ring-white/20'
                                    : 'border-white/10 hover:border-white/30 bg-white/[0.02]'
                            }`}
                            aria-pressed={isActive}
                            title={`Switch to ${theme.name}`}
                        >
                            <div className="relative aspect-[16/9] w-full overflow-hidden">
                                <img
                                    src={theme.preview}
                                    alt={`${theme.name} theme preview`}
                                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                                    loading="lazy"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                {isActive && (
                                    <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-xl">
                                        <MaterialIcon name="check" className="text-lg" />
                                    </div>
                                )}
                            </div>
                            <div className="p-4 flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-sm font-bold text-white">{theme.name}</div>
                                    <div className="text-xs text-white/40 mt-0.5">{theme.description}</div>
                                </div>
                                <div className="w-10 h-10 rounded-xl border border-white/10 shrink-0 flex items-center justify-center" style={{ background: theme.vars['--app-surface'], borderColor: theme.vars['--app-border'] }}>
                                    <span className="w-3 h-3 rounded-full" style={{ background: theme.vars['--app-accent'] }} />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default ThemePanel;
