import { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';

type GithubStarPromptProps = {
    onClose?: () => void;
};

export default function GithubStarPrompt({ onClose }: GithubStarPromptProps) {
    const [visible, setVisible] = useState(false);
    const [hasOpenedUrl, setHasOpenedUrl] = useState(false);
    const [helperText, setHelperText] = useState<string | null>(null);

    useEffect(() => {
        // Check if starred or dismissed already
        const isStarred = localStorage.getItem('figranium_github_starred') === 'true';
        const isDismissed = localStorage.getItem('figranium_star_prompt_dismissed') === 'true';

        if (!isStarred && !isDismissed) {
            setVisible(true);
        }

        const opened = localStorage.getItem('figranium_star_opened') === 'true';
        setHasOpenedUrl(opened);
    }, []);

    if (!visible) {
        return null;
    }

    const handleStarClick = () => {
        localStorage.setItem('figranium_star_opened', 'true');
        setHasOpenedUrl(true);
        window.open('https://github.com/figranium/figranium', '_blank', 'noopener,noreferrer');
        setHelperText(null);
    };

    const handleStarredConfirm = () => {
        if (!hasOpenedUrl) {
            // Politely handle the click if they haven't opened the URL yet
            setHelperText("Opening GitHub for you! Please star us there to unlock. Thank you! ❤️");
            localStorage.setItem('figranium_star_opened', 'true');
            setHasOpenedUrl(true);
            setTimeout(() => {
                window.open('https://github.com/figranium/figranium', '_blank', 'noopener,noreferrer');
            }, 800);
            return;
        }

        // Successfully starred!
        localStorage.setItem('figranium_github_starred', 'true');
        setVisible(false);
        if (onClose) {
            onClose();
        }
    };

    const handleDismiss = () => {
        localStorage.setItem('figranium_star_prompt_dismissed', 'true');
        setVisible(false);
        if (onClose) {
            onClose();
        }
    };

    return (
        <div className="glass-card theme-border rounded-[24px] p-5 mb-6 flex flex-col items-stretch gap-4 animate-in fade-in slide-in-from-top-4 duration-500 relative overflow-hidden" style={{ backgroundColor: 'var(--app-surface-2)' }}>
            <div className="absolute top-0 left-0 w-1.5 h-full theme-accent-bg" style={{ backgroundColor: 'var(--app-accent)' }} />

            <div className="flex items-start gap-4">
                <div className="p-3 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--app-surface-3)', border: '1px solid var(--app-border)' }}>
                    <MaterialIcon name="star" className="text-xl text-[var(--app-accent)]" fill />
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-white leading-snug" style={{ color: 'var(--app-text)' }}>
                        Success! Figranium executed perfectly. ⭐
                    </h4>
                    <p className="text-[10px] uppercase tracking-wider leading-relaxed text-gray-400" style={{ color: 'var(--app-text-faint)' }}>
                        Figranium is open-source. If it saved you time, support us with a GitHub star! It takes 5 seconds.
                    </p>
                    {helperText && (
                        <p className="text-[10px] font-medium text-amber-400 mt-1 animate-pulse">
                            {helperText}
                        </p>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/5">
                <button
                    onClick={handleStarClick}
                    className="flex-1 px-3 py-2 rounded-xl border text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 hover:scale-102 active:scale-98 bg-transparent"
                    style={{ borderColor: 'var(--app-border)', color: 'var(--app-text)' }}
                >
                    <MaterialIcon name="star_border" className="text-sm" />
                    Star on GitHub
                </button>
                <button
                    onClick={handleStarredConfirm}
                    className="flex-1 px-3 py-2 rounded-xl text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 hover:scale-102 active:scale-98"
                    style={{
                        backgroundColor: hasOpenedUrl ? 'var(--app-accent)' : 'var(--app-surface-3)',
                        color: hasOpenedUrl ? 'var(--app-accent-text)' : 'var(--app-text-faint)',
                        border: '1px solid var(--app-border)'
                    }}
                >
                    <MaterialIcon name="done" className="text-sm" />
                    I've starred it!
                </button>
                <button
                    onClick={handleDismiss}
                    className="p-2 rounded-xl border transition-all flex items-center justify-center hover:bg-white/5 shrink-0"
                    style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-faint)' }}
                    title="Dismiss"
                    aria-label="Dismiss"
                >
                    <MaterialIcon name="close" className="text-sm" />
                </button>
            </div>
        </div>
    );
}
