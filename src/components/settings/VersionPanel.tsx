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
        <div className="glass-card p-8 rounded-[40px] space-y-6">
            <div className="flex items-center gap-4 mb-2">
                <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                    <MaterialIcon name="content_copy" className="text-xl" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-widest">Version</h3>
                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Package metadata</p>
                </div>
            </div>
            <div className="flex items-center justify-between gap-4">
                <div className="text-xs font-bold uppercase tracking-[0.3em] text-white">{displayVersion}</div>
                <button
                    onClick={handleCopy}
                    className="px-4 py-2 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/5 transition-all"
                    type="button"
                >
                    {copied ? 'Copied' : 'Copy version'}
                </button>
            </div>
        </div>
    );
};

export default VersionPanel;
