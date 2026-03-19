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
        <div className="h-full flex items-center justify-center px-10">
            <div className="glass-card w-full max-w-2xl rounded-[40px] border border-white/10 p-10 text-center space-y-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.4em] text-gray-500">404</div>
                <h2 className="text-3xl font-heading font-bold tracking-tighter text-white">{title}</h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gray-500">{subtitle}</p>
                {onBack && (
                    <button
                        onClick={onBack}
                        className="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white text-black text-[9px] font-bold uppercase tracking-[0.3em] hover:scale-105 transition-all"
                    >
                        <MaterialIcon name="arrow_back" className="text-base" />
                        Back
                    </button>
                )}
            </div>
        </div>
    );
};

export default NotFoundScreen;
