import React from 'react';
import { THEMES, ThemeDefinition, ThemeId } from '../../utils/theme';
import MaterialIcon from '../MaterialIcon';

interface ThemeIntroModalProps {
    open: boolean;
    currentThemeId: string;
    onSelect: (id: ThemeId) => void;
    onDismiss: () => void;
}

const ThemeIntroModal: React.FC<ThemeIntroModalProps> = ({ open, currentThemeId, onSelect, onDismiss }) => {
    if (!open) return null;

    const handleSelect = (theme: ThemeDefinition) => {
        onSelect(theme.id);
        onDismiss();
    };

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
            <div className="glass-card w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 p-8 text-left shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center mb-2 shrink-0">
                    <h2 className="text-lg md:text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <MaterialIcon name="palette" className="text-3xl" />
                        Choose your theme
                    </h2>
                </div>
                <p className="text-sm text-white/50 mb-6 shrink-0">
                    Pick the look that suits you best. You can change this anytime in Settings.
                </p>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {THEMES.map((theme) => {
                        const isActive = theme.id === currentThemeId;
                        return (
                            <button
                                key={theme.id}
                                onClick={() => handleSelect(theme)}
                                className={`group relative rounded-xl overflow-hidden border transition-all duration-300 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    isActive
                                        ? 'border-white/70 ring-2 ring-white/30'
                                        : 'border-white/10 hover:border-white/40'
                                }`}
                                aria-pressed={isActive}
                                title={`Use ${theme.name} theme`}
                            >
                                <div className="relative aspect-[16/9] w-full overflow-hidden">
                                    <img
                                        src={theme.preview}
                                        alt={`${theme.name} theme preview`}
                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                                    <div className="absolute top-3 right-3 flex items-center gap-2">
                                        {isActive && (
                                            <span className="bg-white text-black px-2 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl flex items-center gap-1">
                                                <MaterialIcon name="check" className="text-xs" />
                                                Active
                                            </span>
                                        )}
                                    </div>
                                    <div className="absolute bottom-3 left-3">
                                        <div className="text-white font-bold text-lg drop-shadow">{theme.name}</div>
                                        <div className="text-white/70 text-xs drop-shadow">{theme.description}</div>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-8 flex justify-end shrink-0">
                    <button
                        onClick={onDismiss}
                        className="rounded-xl px-8 py-3 text-xs font-bold uppercase tracking-[0.3em] transition-all bg-white text-black hover:scale-105 shadow-xl shadow-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Skip
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ThemeIntroModal;