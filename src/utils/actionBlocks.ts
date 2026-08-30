import { Action } from '../types';

export const LOOP_ACTION_TYPES = new Set<Action['type']>(['while', 'repeat', 'foreach']);
export const BLOCK_START_ACTION_TYPES = new Set<Action['type']>([
    'if',
    'while',
    'repeat',
    'foreach',
    'on_error',
]);

export interface ActionBlockRange {
    start: number;
    end: number;
}

export const isLoopAction = (type: Action['type']) => LOOP_ACTION_TYPES.has(type);
export const isBlockStartAction = (type: Action['type']) => BLOCK_START_ACTION_TYPES.has(type);
export const requiresEndMarker = (type: Action['type']) => type === 'if' || isLoopAction(type);

export const createActionSequence = (action: Action, endId: string): Action[] => {
    if (!requiresEndMarker(action.type)) return [action];
    return [action, { id: endId, type: 'end', selector: '', value: '' }];
};

export const findMatchingEndIndex = (actions: Action[], startIndex: number): number | null => {
    const start = actions[startIndex];
    if (!start || !isBlockStartAction(start.type)) return null;

    let depth = 1;
    for (let index = startIndex + 1; index < actions.length; index += 1) {
        const action = actions[index];
        if (isBlockStartAction(action.type)) depth += 1;
        if (action.type === 'end') depth -= 1;
        if (depth === 0) return index;
    }
    return null;
};

export const getActionBlockRange = (actions: Action[], startIndex: number): ActionBlockRange => {
    const end = findMatchingEndIndex(actions, startIndex);
    return { start: startIndex, end: end ?? startIndex };
};

export const expandActionIdsToBlocks = (actions: Action[], ids: Iterable<string>): Set<string> => {
    const expanded = new Set(ids);
    for (const id of Array.from(expanded)) {
        const start = actions.findIndex((action) => action.id === id);
        if (start === -1) continue;
        const range = getActionBlockRange(actions, start);
        for (let index = range.start; index <= range.end; index += 1) {
            expanded.add(actions[index].id);
        }
    }
    return expanded;
};

export const cloneActionsWithFreshIds = (
    actions: Action[],
    createId: (action: Action, index: number) => string,
): Action[] => actions.map((action, index) => ({ ...action, id: createId(action, index) }));

export const moveActionBlock = (actions: Action[], fromId: string, toId: string): Action[] => {
    if (fromId === toId) return actions;
    const fromIndex = actions.findIndex((action) => action.id === fromId);
    const targetIndex = actions.findIndex((action) => action.id === toId);
    if (fromIndex === -1 || targetIndex === -1) return actions;

    const range = getActionBlockRange(actions, fromIndex);
    if (targetIndex >= range.start && targetIndex <= range.end) return actions;

    const moved = actions.slice(range.start, range.end + 1);
    const remaining = [...actions.slice(0, range.start), ...actions.slice(range.end + 1)];
    const removedBeforeTarget = range.end < targetIndex ? moved.length : 0;
    const insertionIndex = targetIndex - removedBeforeTarget;
    remaining.splice(insertionIndex, 0, ...moved);
    return remaining;
};
