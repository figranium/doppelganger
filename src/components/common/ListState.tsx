import type { ReactNode } from 'react';
import MaterialIcon from '../MaterialIcon';

interface PanelShellProps {
    icon?: string;
    title: string;
    description: string;
    headerActions?: ReactNode;
    children: ReactNode;
}

export function PanelShell({ icon, title, description, headerActions, children }: PanelShellProps) {
    return (
        <div className="app-panel p-7 space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {icon && (
                        <div className="w-10 h-10 rounded-xl theme-input border theme-border flex items-center justify-center theme-text-faint">
                            <MaterialIcon name={icon} className="text-xl" />
                        </div>
                    )}
                    <div>
                        <h3 className="text-sm font-bold theme-text">{title}</h3>
                        <p className="text-xs theme-text-faint mt-1">{description}</p>
                    </div>
                </div>
                {headerActions}
            </div>
            {children}
        </div>
    );
}

export function LoadingState({ label }: { label: string }) {
    return <div className="text-xs theme-text-faint uppercase tracking-widest">Loading {label}...</div>;
}

export function EmptyState({ label }: { label: string }) {
    return <div className="text-xs theme-text-faint uppercase tracking-widest">No {label} found.</div>;
}
