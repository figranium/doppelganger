import { useState, useEffect } from 'react';
import { APP_VERSION } from '../../utils/appInfo';

const RELEASE_NOTES_KEY = 'figranium.seenReleaseNotes_0_8';

export default function ReleaseNotesModal() {
    const [open, setOpen] = useState(false);
    const [notesHtml, setNotesHtml] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Only show for 0.8.x versions
        if (APP_VERSION.startsWith('0.8.')) {
            const hasSeen = localStorage.getItem(RELEASE_NOTES_KEY);
            if (!hasSeen) {
                setOpen(true);
                fetchReleaseNotes();
            }
        }
    }, []);

    const fetchReleaseNotes = async () => {
        try {
            // Fetch v0.8.0 release notes from Github
            const res = await fetch('https://api.github.com/repos/figranium/figranium/releases/tags/v0.8.0');
            if (res.ok) {
                const data = await res.json();
                // We'll just display the raw body text or a simple formatted version
                // In a full implementation, a markdown parser like react-markdown would be better,
                // but for now we format line breaks simply or use a plain text view.
                setNotesHtml(data.body || 'No release notes available.');
            } else {
                setNotesHtml('Failed to load release notes. Please check our GitHub repository.');
            }
        } catch (e) {
            setNotesHtml('Failed to load release notes. Please check our GitHub repository.');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setOpen(false);
        localStorage.setItem(RELEASE_NOTES_KEY, 'true');
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
            <div className="glass-card w-full max-w-2xl max-h-[80vh] flex flex-col rounded-[32px] border border-white/10 p-8 text-left shadow-2xl overflow-hidden">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <h2 className="text-lg md:text-2xl font-bold text-white tracking-tight">What's new in v0.8.0</h2>
                    <span className="bg-white/10 text-white/70 px-3 py-1 rounded-full text-xs font-mono ml-4 shrink-0">v{APP_VERSION}</span>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar text-sm text-gray-300">
                    {loading ? (
                        <div className="flex justify-center items-center h-32">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap font-mono text-xs">
                            {notesHtml}
                        </div>
                    )}
                </div>

                <div className="mt-8 flex justify-end shrink-0">
                    <button
                        onClick={handleClose}
                        className="rounded-2xl px-8 py-3 text-xs font-bold uppercase tracking-[0.3em] transition-all bg-white text-black hover:scale-105 shadow-xl shadow-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        Got it
                    </button>
                </div>
            </div>
        </div>
    );
}
