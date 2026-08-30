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

export type ActionScopeKind = 'root' | 'if-true' | 'if-false' | 'loop-body';

export interface ActionScope {
    id: string;
    kind: ActionScopeKind;
    parentId: string | null;
    ownerActionId: string | null;
    actionIds: string[];
    startIndex: number;
    endIndex: number;
    hasMarker: boolean;
}

export interface ActionScopeMap {
    scopes: Record<string, ActionScope>;
    actionScopeById: Record<string, string>;
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

const findDirectElseIndex = (actions: Action[], startIndex: number, endIndex: number): number | null => {
    let depth = 0;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
        const action = actions[index];
        if (isBlockStartAction(action.type)) {
            depth += 1;
        } else if (action.type === 'end' && depth > 0) {
            depth -= 1;
        } else if (action.type === 'else' && depth === 0) {
            return index;
        }
    }
    return null;
};

export const getIfTrueScopeId = (actionId: string) => `if:${actionId}:true`;
export const getIfFalseScopeId = (actionId: string) => `if:${actionId}:false`;
export const getLoopBodyScopeId = (actionId: string) => `loop:${actionId}:body`;

export const buildActionScopeMap = (actions: Action[]): ActionScopeMap => {
    const scopes: Record<string, ActionScope> = {};
    const actionScopeById: Record<string, string> = {};

    const visitScope = (
        id: string,
        kind: ActionScopeKind,
        parentId: string | null,
        ownerActionId: string | null,
        startIndex: number,
        endIndex: number,
        hasMarker: boolean = true,
    ) => {
        const scope: ActionScope = {
            id,
            kind,
            parentId,
            ownerActionId,
            actionIds: [],
            startIndex,
            endIndex,
            hasMarker,
        };
        scopes[id] = scope;

        let index = startIndex;
        while (index < endIndex) {
            const action = actions[index];
            if (!action) break;
            if (action.type === 'else' || action.type === 'end') {
                index += 1;
                continue;
            }

            const blockEnd = requiresEndMarker(action.type)
                ? findMatchingEndIndex(actions, index)
                : null;
            const hasValidBlock = blockEnd !== null && blockEnd < endIndex;

            scope.actionIds.push(action.id);
            actionScopeById[action.id] = id;

            if (action.type === 'if' && hasValidBlock) {
                const elseIndex = findDirectElseIndex(actions, index, blockEnd);
                visitScope(
                    getIfTrueScopeId(action.id),
                    'if-true',
                    id,
                    action.id,
                    index + 1,
                    elseIndex ?? blockEnd,
                );
                visitScope(
                    getIfFalseScopeId(action.id),
                    'if-false',
                    id,
                    action.id,
                    elseIndex === null ? blockEnd : elseIndex + 1,
                    blockEnd,
                    elseIndex !== null,
                );
                index = blockEnd + 1;
                continue;
            }

            if (isLoopAction(action.type) && hasValidBlock) {
                visitScope(
                    getLoopBodyScopeId(action.id),
                    'loop-body',
                    id,
                    action.id,
                    index + 1,
                    blockEnd,
                );
                index = blockEnd + 1;
                continue;
            }

            index += 1;
        }
    };

    visitScope('root', 'root', null, null, 0, actions.length);
    return { scopes, actionScopeById };
};

export const getAllowedDropScopeIds = (actions: Action[], fromId: string): Set<string> => {
    const structure = buildActionScopeMap(actions);
    const currentId = structure.actionScopeById[fromId];
    const current = structure.scopes[currentId];
    if (!current) return new Set();

    const allowed = new Set<string>([current.id]);
    if (current.parentId) allowed.add(current.parentId);

    if (current.ownerActionId && (current.kind === 'if-true' || current.kind === 'if-false')) {
        allowed.add(current.kind === 'if-true'
            ? getIfFalseScopeId(current.ownerActionId)
            : getIfTrueScopeId(current.ownerActionId));
    }

    Object.values(structure.scopes).forEach((scope) => {
        if (scope.parentId === current.id) allowed.add(scope.id);
    });

    const fromIndex = actions.findIndex((action) => action.id === fromId);
    const sourceRange = getActionBlockRange(actions, fromIndex);
    for (const scopeId of Array.from(allowed)) {
        const scope = structure.scopes[scopeId];
        if (!scope?.ownerActionId) continue;
        const ownerIndex = actions.findIndex((action) => action.id === scope.ownerActionId);
        if (ownerIndex >= sourceRange.start && ownerIndex <= sourceRange.end) allowed.delete(scopeId);
    }

    return allowed;
};

export const moveActionBlockToScope = (
    actions: Action[],
    fromId: string,
    targetScopeId: string,
    beforeActionId: string | null,
    createElseId: () => string,
): Action[] => {
    const initialStructure = buildActionScopeMap(actions);
    const targetScope = initialStructure.scopes[targetScopeId];
    if (!targetScope || !getAllowedDropScopeIds(actions, fromId).has(targetScopeId)) return actions;
    if (beforeActionId && !targetScope.actionIds.includes(beforeActionId)) return actions;

    const fromIndex = actions.findIndex((action) => action.id === fromId);
    if (fromIndex === -1) return actions;
    const sourceRange = getActionBlockRange(actions, fromIndex);
    if (beforeActionId) {
        const beforeIndex = actions.findIndex((action) => action.id === beforeActionId);
        if (beforeIndex >= sourceRange.start && beforeIndex <= sourceRange.end) return actions;
    }

    const moved = actions.slice(sourceRange.start, sourceRange.end + 1);
    let remaining = [
        ...actions.slice(0, sourceRange.start),
        ...actions.slice(sourceRange.end + 1),
    ];

    let structure = buildActionScopeMap(remaining);
    let nextTargetScope = structure.scopes[targetScopeId];
    if (!nextTargetScope) return actions;

    if (nextTargetScope.kind === 'if-false' && !nextTargetScope.hasMarker) {
        const ownerIndex = remaining.findIndex((action) => action.id === nextTargetScope.ownerActionId);
        const ownerEnd = findMatchingEndIndex(remaining, ownerIndex);
        if (ownerIndex === -1 || ownerEnd === null) return actions;
        remaining.splice(ownerEnd, 0, { id: createElseId(), type: 'else', selector: '', value: '' });
        structure = buildActionScopeMap(remaining);
        nextTargetScope = structure.scopes[targetScopeId];
    }

    const insertionIndex = beforeActionId
        ? remaining.findIndex((action) => action.id === beforeActionId)
        : nextTargetScope.endIndex;
    if (insertionIndex < 0) return actions;
    remaining.splice(insertionIndex, 0, ...moved);
    return remaining;
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
