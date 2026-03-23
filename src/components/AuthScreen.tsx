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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(email, pass, name, passConfirm);
    };

    const buttonLabel = status === 'setup'
        ? (busy ? 'Creating account...' : 'Create Account')
        : (busy ? 'Authenticating...' : 'Authenticate');

    return (
        <div className="fixed inset-0 z-[100] bg-[#020202] flex items-center justify-center">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="w-[400px] glass-card p-10 rounded-[48px] space-y-8 relative">
                <div className="text-center space-y-3">
                    <img src="/figranium_logo.svg" alt="Figranium" className="h-24 mx-auto object-contain" />
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-[0.2em] leading-relaxed max-w-[200px] mx-auto">
                        Deterministic Control for an Agentic World
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    <div className="space-y-4">
                        {status === 'setup' && (
                            <div className="space-y-2">
                                <label htmlFor="auth-name" className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Name</label>
                                <input
                                    id="auth-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Full Name"
                                    className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/50 transition-all placeholder:text-gray-600"
                                    autoComplete="name"
                                />
                            </div>
                        )}
                        <div className="space-y-2">
                            <label htmlFor="auth-email" className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Email</label>
                            <input
                                id="auth-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-4 text-sm focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/50 transition-all placeholder:text-gray-600"
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="auth-pass" className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Password</label>
                            <div className="relative">
                                <input
                                    id="auth-pass"
                                    type={showPass ? "text" : "password"}
                                    value={pass}
                                    onChange={(e) => setPass(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-4 pr-12 text-sm focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/50 transition-all placeholder:text-gray-600"
                                    required
                                    autoComplete={status === 'setup' ? "new-password" : "current-password"}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPass(!showPass)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label={showPass ? "Hide password" : "Show password"}
                                    title={showPass ? "Hide password" : "Show password"}
                                >
                                    <MaterialIcon name={showPass ? "visibility_off" : "visibility"} className="text-lg" />
                                </button>
                            </div>
                        </div>
                        {status === 'setup' && (
                            <div className="space-y-2">
                                <label htmlFor="auth-pass-confirm" className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em]">Confirm Password</label>
                                <div className="relative">
                                    <input
                                        id="auth-pass-confirm"
                                        type={showPassConfirm ? "text" : "password"}
                                        value={passConfirm}
                                        onChange={(e) => setPassConfirm(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full bg-white/[0.05] border border-white/10 rounded-2xl px-5 py-4 pr-12 text-sm focus:outline-none focus:border-white/30 focus-visible:ring-2 focus-visible:ring-white/50 transition-all placeholder:text-gray-600"
                                        required
                                        autoComplete="new-password"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassConfirm(!showPassConfirm)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/10 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
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
                        className="shine-effect w-full bg-white text-black py-4 rounded-2xl font-bold text-[10px] tracking-[0.3em] uppercase hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        {busy && (
                            <div className="w-4 h-4 border-2 border-black/10 border-t-black rounded-full animate-spin" />
                        )}
                        {buttonLabel}
                    </button>

                    {error && (
                        <div role="alert" className="text-[9px] font-bold text-red-500 text-center uppercase tracking-widest">
                            {error}
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default AuthScreen;
