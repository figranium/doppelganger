import { useEffect, useState } from 'react';
import MaterialIcon from '../MaterialIcon';

interface CenterAlertProps {
    message: string;
    tone?: 'success' | 'error';
    onClose: () => void;
}

const CenterAlert: React.FC<CenterAlertProps> = ({ message, tone, onClose }) => {
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        const autoTimer = setTimeout(() => {
            setClosing(true);
        }, 2500);
        return () => clearTimeout(autoTimer);
    }, []);

    useEffect(() => {
        if (!closing) return;
        const closeTimer = setTimeout(() => onClose(), 240);
        return () => clearTimeout(closeTimer);
    }, [closing, onClose]);

    return (
        <div className={`fixed bottom-6 right-6 z-[220] max-w-sm w-full ${closing ? 'animate-out fade-out slide-out-to-bottom-3 duration-200' : 'animate-in fade-in slide-in-from-bottom-3 duration-300'}`}>
            <div
                role={tone === 'error' ? 'alert' : 'status'}
                className={`glass-card rounded-2xl border border-white/10 p-4 shadow-2xl flex items-start gap-3 ${closing ? 'animate-out fade-out zoom-out-95 duration-200' : 'animate-in fade-in zoom-in-95 duration-300'}`}
            >
                <div className="mt-0.5">
                    {tone === 'error' ? (
                        <MaterialIcon name="error" className="text-red-400 text-lg" />
                    ) : (
                        <MaterialIcon name="check_circle" className="text-emerald-400 text-lg" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.35em] text-gray-500">
                        {tone === 'error' ? 'Error' : 'Success'}
                    </p>
                    <p className="mt-1.5 font-mono text-xs text-white leading-relaxed break-words">{message}</p>
                </div>
                <button
                    onClick={() => setClosing(true)}
                    className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 shrink-0"
                    aria-label="Close notification"
                    title="Close"
                >
                    <MaterialIcon name="close" className="text-base" />
                </button>
            </div>
        </div>
    );
};

export default CenterAlert;
