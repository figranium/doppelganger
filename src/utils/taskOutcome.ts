import { TaskOutcome } from '../types';

export const normalizeTaskOutcome = (outcome?: string, httpStatus?: number): TaskOutcome => {
    if (outcome === 'success' || outcome === 'error' || outcome === 'stopped' || outcome === 'crashed' || outcome === 'anti_bot') {
        return outcome;
    }
    return httpStatus !== undefined && (httpStatus < 200 || httpStatus >= 300) ? 'error' : 'success';
};

export const taskOutcomeLabel = (outcome: TaskOutcome) => outcome === 'anti_bot'
    ? 'Anti-bot'
    : `${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}`;

export const taskOutcomeBadgeClass = (outcome: TaskOutcome) => {
    if (outcome === 'success') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    if (outcome === 'anti_bot') return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
    if (outcome === 'stopped') return 'bg-slate-500/10 text-slate-300 border-slate-500/20';
    return 'bg-red-500/10 text-red-400 border-red-500/20';
};

export const taskOutcomeDotClass = (outcome: TaskOutcome) => {
    if (outcome === 'success') return 'bg-emerald-400';
    if (outcome === 'anti_bot') return 'bg-amber-400';
    if (outcome === 'stopped') return 'bg-slate-400';
    return 'bg-red-400';
};
