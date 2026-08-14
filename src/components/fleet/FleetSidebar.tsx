import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { FleetTab } from '../../types';

interface FleetSidebarProps {
    activeTab: FleetTab;
    onTabChange: (tab: FleetTab) => void;
}

const FleetSidebar: React.FC<FleetSidebarProps> = ({ activeTab, onTabChange }) => {
    const tabs: { id: FleetTab; label: string; icon: string }[] = [
        { id: 'matrix', label: 'Task Matrix', icon: 'layers' },
        { id: 'variables', label: 'Variable Tables', icon: 'table_chart' },
        { id: 'schedules', label: 'Schedules & Drops', icon: 'schedule' },
        { id: 'infrastructure', label: 'Infrastructure', icon: 'dns' },
    ];

    return (
        <aside className="w-64 h-full border-r border-white/10 bg-[#0a0a0a] flex flex-col overflow-y-auto custom-scrollbar shrink-0">
            <div className="p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1 mb-3">Fleet Console</p>
                <div className="flex flex-col gap-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 ${
                                activeTab === tab.id
                                    ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 shadow-[0_0_8px_rgba(34,211,238,0.2)]'
                                    : 'text-gray-500 hover:bg-white/5 hover:text-white border border-transparent'
                            }`}
                        >
                            <MaterialIcon name={tab.icon} className="text-sm" />
                            <span className="text-xs font-bold uppercase tracking-widest">{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick status strip */}
            <div className="mt-auto p-3 border-t border-white/10">
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-gray-500">
                        <MaterialIcon name="circle" className="text-xs text-cyan-400" />
                        <span>Active workers</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500">
                        <MaterialIcon name="circle" className="text-xs text-green-400" />
                        <span>Healthy proxies</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500">
                        <MaterialIcon name="circle" className="text-xs text-yellow-400" />
                        <span>Signals live</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-500">
                        <MaterialIcon name="circle" className="text-xs text-white/20" />
                        <span>System ready</span>
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default React.memo(FleetSidebar);
