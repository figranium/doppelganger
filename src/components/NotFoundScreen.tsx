import MaterialIcon from './MaterialIcon';

interface NotFoundScreenProps {
    title?: string;
    subtitle?: string;
    onBack?: () => void;
}

const NotFoundScreen: React.FC<NotFoundScreenProps> = ({
    title = 'Not Found',
    subtitle = 'The page you requested does not exist.',
    onBack
}) => {
    return (
        <main className="app-page flex items-center justify-center px-8">
            <div className="app-panel app-empty-state w-full max-w-xl">
                <div className="app-empty-icon"><MaterialIcon name="explore_off" className="text-2xl" /></div>
                <div className="app-page-kicker !mt-0">Error 404</div>
                <h2 className="text-2xl font-bold tracking-tight theme-text">{title}</h2>
                <p className="text-xs theme-text-faint">{subtitle}</p>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="app-button-primary"
                    >
                        <MaterialIcon name="arrow_back" className="text-base" />
                        Back
                    </button>
                )}
            </div>
        </main>
    );
};

export default NotFoundScreen;
