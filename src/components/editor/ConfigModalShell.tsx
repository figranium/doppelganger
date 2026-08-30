import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import MaterialIcon from '../MaterialIcon';

interface ConfigModalShellProps {
    icon: string;
    title: string;
    children: ReactNode;
    onClose: () => void;
}

const ConfigModalShell: React.FC<ConfigModalShellProps> = ({ icon, title, children, onClose }) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return createPortal(
        <div
            className="fixed inset-0 z-[190] flex items-center justify-center bg-black/65 p-3 backdrop-blur-lg sm:p-6 lg:p-10"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="config-modal-title"
                className="theme-surface theme-text flex max-h-[calc(100vh-1.5rem)] min-h-[min(540px,calc(100vh-1.5rem))] w-full max-w-[1200px] flex-col gap-6 rounded-[28px] border theme-border-strong p-5 shadow-[0_32px_100px_rgba(0,0,0,0.55)] animate-in fade-in zoom-in-95 duration-200 sm:max-h-[90vh] sm:w-[92vw] sm:p-8 lg:p-10"
                onClick={(event) => event.stopPropagation()}
            >
                <header className="flex shrink-0 items-center justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                        <MaterialIcon name={icon} className="shrink-0 text-base text-[var(--app-text-muted)]" />
                        <h2 id="config-modal-title" className="truncate text-base font-semibold normal-case tracking-normal text-[var(--app-text)]">
                            {title}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-md p-1 text-[var(--app-text-faint)] transition-colors hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-border-strong)]"
                        aria-label="Close"
                        title="Close"
                    >
                        <MaterialIcon name="close" className="text-[12px]" />
                    </button>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar sm:pr-3">
                    {children}
                </div>
            </section>
        </div>,
        document.body,
    );
};

export default ConfigModalShell;
