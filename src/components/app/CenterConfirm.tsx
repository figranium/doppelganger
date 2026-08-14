import { ConfirmRequest } from '../../types';

interface CenterConfirmProps {
    request: ConfirmRequest;
    onResolve: (result: boolean) => void;
}

const CenterConfirm: React.FC<CenterConfirmProps> = ({ request, onResolve }) => {
    return (
        <div className="fixed inset-0 z-[201] flex items-center justify-center bg-black/70 backdrop-blur-sm px-6">
            <div
                className="w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl"
                style={{ background: 'var(--app-surface)', borderColor: 'var(--app-border)' }}
            >
                <p className="text-xs font-bold uppercase tracking-[0.4em]" style={{ color: 'var(--app-text-faint)' }}>{request.title ?? 'Confirm'}</p>
                <p className="mt-4 font-mono text-sm" style={{ color: 'var(--app-text)' }}>{request.message}</p>
                <div className="mt-6 flex gap-4">
                    <button
                        onClick={() => onResolve(false)}
                        className="w-full rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-[0.3em] transition-all border focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                        style={{ background: 'var(--app-glass-card)', borderColor: 'var(--app-border)', color: 'var(--app-text-muted)' }}
                    >
                        {request.cancelLabel ?? 'Cancel'}
                    </button>
                    <button
                        onClick={() => onResolve(true)}
                        className="w-full rounded-xl px-6 py-3 text-xs font-bold uppercase tracking-[0.3em] transition-all hover:scale-105 shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        style={{ background: 'var(--app-accent)', color: 'var(--app-accent-text)' }}
                    >
                        {request.confirmLabel ?? 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CenterConfirm;
