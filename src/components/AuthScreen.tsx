import { useState } from 'react';
import MaterialIcon from './MaterialIcon';

interface AuthScreenProps {
    status: 'login' | 'setup';
    onSubmit: (email: string, pass: string, name?: string, passConfirm?: string) => Promise<void>;
    error: string;
    busy?: boolean;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ status, onSubmit, error, busy = false }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [pass, setPass] = useState('');
    const [passConfirm, setPassConfirm] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [showPassConfirm, setShowPassConfirm] = useState(false);
    const [localError, setLocalError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (status === 'setup' && pass !== passConfirm) {
            setLocalError('Passwords do not match.');
            return;
        }
        setLocalError('');
        onSubmit(email, pass, name, passConfirm);
    };

    const buttonLabel = status === 'setup'
        ? (busy ? 'Creating account...' : 'Create Account')
        : (busy ? 'Authenticating...' : 'Authenticate');

    const inputClass = "w-full theme-input border theme-border rounded-xl px-5 py-4 text-sm theme-text focus:outline-none focus:border-[var(--app-border-strong)] focus-visible:ring-2 focus-visible:ring-white/50 transition-all placeholder:text-gray-600";

    return (
        <div className="fixed inset-0 z-[100] theme-bg flex items-center justify-center">
            <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(var(--app-dot) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="w-[400px] glass-card p-10 rounded-2xl space-y-8 relative">
                <div className="text-center space-y-3">
                    <img src="/figranium_logo.svg" alt="Figranium" className="h-24 mx-auto object-contain theme-logo" style={{ color: 'var(--app-logo)' }} />
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="space-y-4">
                        {status === 'setup' && (
                            <div className="space-y-2">
                                <label htmlFor="auth-name" className="text-xs font-bold theme-text-muted uppercase tracking-[0.2em]">Name</label>
                                <input
                                    id="auth-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Full Name"
                                    className={inputClass}
                                    autoComplete="name"
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="auth-email" className="text-xs font-bold theme-text-muted uppercase tracking-[0.2em]">Email</label>
                            <input
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                className={inputClass}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="auth-pass" className="text-xs font-bold theme-text-muted uppercase tracking-[0.2em]">Password</label>
                            <div className="relative">
                                <input
                                    id="auth-pass"
                                    type={showPass ? "text" : "password"}
                                    value={pass}
                                    onChange={(e) => setPass(e.target.value)}
                                    placeholder="••••••••"
                                    className={`${inputClass} pr-12`}
                                    required
                                    autoComplete={status === 'setup' ? "new-password" : "current-password"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg theme-text-faint hover:text-white hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label={showPass ? "Hide password" : "Show password"}
                                    title={showPass ? "Hide password" : "Show password"}
                                >
                                    <MaterialIcon name={showPass ? "visibility_off" : "visibility"} className="text-lg" />
                                </button>
                            </div>
                        </div>
                        {status === 'setup' && (
                            <div className="space-y-2">
                                <label htmlFor="auth-pass-confirm" className="text-xs font-bold theme-text-muted uppercase tracking-[0.2em]">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        id="auth-pass-confirm"
                                        type={showPassConfirm ? "text" : "password"}
                                        value={passConfirm}
                                        onChange={(e) => setPassConfirm(e.target.value)}
                                        placeholder="••••••••"
                                        className={`${inputClass} pr-12`}
                                        required
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassConfirm(!showPassConfirm)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg theme-text-faint hover:text-white hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label={showPassConfirm ? "Hide password confirmation" : "Show password confirmation"}
                                        title={showPassConfirm ? "Hide password confirmation" : "Show password confirmation"}
                                    >
                                        <MaterialIcon name={showPassConfirm ? "visibility_off" : "visibility"} className="text-lg" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={busy}
                        aria-busy={busy}
                        className="shine-effect w-full theme-accent-bg py-4 rounded-xl font-bold text-xs tracking-[0.3em] uppercase hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {busy && (
                            <div className="w-4 h-4 border-2 border-current/10 border-t-current rounded-full animate-spin" />
                        )}
                        {buttonLabel}
                    </button>

                    {(localError || error) && (
                        <div role="alert" className="text-xs font-bold text-red-500 text-center uppercase tracking-widest">
                            {localError || error}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default AuthScreen;