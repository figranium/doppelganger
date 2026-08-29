import MaterialIcon from '../MaterialIcon';
import { useState } from 'react';

interface VersionPanelProps {
    version: string;
}

const VersionPanel = ({ version }: VersionPanelProps) => {
    const [copied, setCopied] = useState(false);
    const displayVersion = version ? `v${version}` : 'Unknown';

    const handleCopy = async () => {
        const text = version || displayVersion;
        try {
            const hasClipboard = typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext;
            if (hasClipboard) {
                await navigator.clipboard.writeText(text);
            } else if (typeof document !== 'undefined') {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div className="app-panel p-7 space-y-6">
            <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 rounded-xl theme-input border theme-border flex items-center justify-center theme-text-faint">
                    <MaterialIcon name="content_copy" className="text-xl" />
                </div>
                <div>
                    <h3 className="text-sm font-bold theme-text">Version</h3>
                    <p className="text-xs theme-text-faint mt-1">Package metadata</p>
                </div>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-bold uppercase tracking-[0.3em] theme-text">{displayVersion}</div>
                <button
                    onClick={handleCopy}
                    className="app-button-secondary"
                    type="button"
                >
                    {copied ? 'Copied' : 'Copy version'}
                </button>
            </div>
        </div>
    );
};

export default VersionPanel;
