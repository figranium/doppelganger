interface LoadingScreenProps {
    title?: string;
    subtitle?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ title = 'Loading', subtitle }) => {
    return (
        <div className="fixed inset-0 z-[80] theme-bg flex items-center justify-center">
            <div className="absolute inset-0 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(var(--app-dot) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="glass-card p-10 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full border theme-border flex items-center justify-center">
                    <div className="w-5 h-5 border-2 theme-border border-t-[var(--app-text)] rounded-full animate-spin" />
                </div>
                <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-[0.4em] theme-text-muted">{title}</p>
                    {subtitle && (
                        <p className="text-xs font-mono theme-text">{subtitle}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;
