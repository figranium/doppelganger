interface LoadingScreenProps {
    title?: string;
    subtitle?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ title = 'Loading', subtitle }) => {
    return (
        <div className="fixed inset-0 z-[80] theme-bg flex items-center justify-center p-6">
            <div className="app-panel w-full max-w-sm p-9 text-center space-y-5">
                <div className="w-12 h-12 mx-auto rounded-xl theme-input border theme-border flex items-center justify-center">
                    <div className="w-5 h-5 border-2 theme-border border-t-[var(--app-text)] rounded-full animate-spin" />
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-bold theme-text">{title}</p>
                    {subtitle && (
                        <p className="text-xs theme-text-faint">{subtitle}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoadingScreen;
