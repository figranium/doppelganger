import { Component, ErrorInfo, ReactNode } from 'react';
import MaterialIcon from '../MaterialIcon';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

// Catches uncaught render errors anywhere below it so a single bad component
// (e.g. a results table trying to render a non-primitive cell value) can't
// unmount the whole app and expose the page's black background.
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Unhandled render error caught by ErrorBoundary:', error, info.componentStack);
    }

    handleReload = () => {
        this.setState({ error: null });
        window.location.reload();
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="fixed inset-0 z-[999] theme-bg flex items-center justify-center p-6">
                <div className="glass-card p-10 rounded-[40px] text-center space-y-4 max-w-lg">
                    <div className="w-12 h-12 mx-auto rounded-full border theme-border flex items-center justify-center">
                        <MaterialIcon name="error" className="text-lg theme-text" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-xs font-bold uppercase tracking-[0.4em] theme-text-muted">Something went wrong</p>
                        <p className="text-xs font-mono theme-text break-words">{error.message}</p>
                    </div>
                    <button
                        onClick={this.handleReload}
                        className="px-4 py-2 rounded-full border theme-border text-xs font-bold uppercase tracking-[0.2em] theme-text hover:opacity-80 transition-opacity"
                        type="button"
                    >
                        Reload
                    </button>
                </div>
            </div>
        );
    }
}

export default ErrorBoundary;
