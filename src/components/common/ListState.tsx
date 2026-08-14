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
        <div className="glass-card p-8 rounded-[40px] space-y-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {icon && (
                        <div className="w-10 h-10 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400">
                            <MaterialIcon name={icon} className="text-xl" />
                        </div>
                    )}
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">{title}</h3>
                        <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">{description}</p>
                    </div>
                </div>
                {headerActions}
            </div>
            {children}
        </div>
    );
}

export function LoadingState({ label }: { label: string }) {
    return <div className="text-xs text-gray-500 uppercase tracking-widest">Loading {label}...</div>;
}

export function EmptyState({ label }: { label: string }) {
    return <div className="text-xs text-gray-600 uppercase tracking-widest">No {label} found.</div>;
}
