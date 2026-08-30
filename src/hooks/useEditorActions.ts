import { useState, useCallback, useRef, useEffect } from 'react';
import { Task, Action } from '../types';
import {
    buildActionScopeMap,
    getActionBlockRange,
    getAllowedDropScopeIds,
    moveActionBlockToScope,
} from '../utils/actionBlocks';

interface ActionDropTarget {
    scopeId: string;
    beforeActionId: string | null;
    highlightActionId: string | null;
}

export const useEditorActions = (
    currentTask: Task,
    setCurrentTask: (task: Task | ((prev: Task | null) => Task | null)) => void,
    onSave: (task: Task, createVersion: boolean) => void,
) => {
    const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
    const [dragState, setDragState] = useState<{
        id: string;
        startX: number;
        startY: number;
        currentY: number;
        height: number;
        index: number;
        originTop: number;
        pointerOffset: number;
    } | null>(null);
    const [dragTarget, setDragTarget] = useState<ActionDropTarget | null>(null);
    const dragPointerIdRef = useRef<number | null>(null);

    const updateAction = useCallback((id: string, updates: Partial<Action>, saveImmediately: boolean = false) => {
        if (saveImmediately) {
            setCurrentTask((prev) => {
                if (!prev) return null;
                const next = { ...prev, actions: prev.actions.map(a => a.id === id ? { ...a, ...updates } : a) };
                onSave(next, false);
                return next;
            });
        } else {
            setCurrentTask((prev) => {
                if (!prev) return null;
                return {
                    ...prev,
                    actions: prev.actions.map(a => a.id === id ? { ...a, ...updates } : a)
                };
            });
        }
    }, [setCurrentTask, onSave]);

    const moveAction = useCallback((fromId: string, target: ActionDropTarget) => {
        setCurrentTask((prev) => {
            if (!prev) return null;
            const nextActions = moveActionBlockToScope(
                prev.actions,
                fromId,
                target.scopeId,
                target.beforeActionId,
                () => `act_${Date.now()}_${Math.floor(Math.random() * 1000)}_else`,
            );
            if (nextActions === prev.actions) return prev;
            const next = { ...prev, actions: nextActions };
            onSave(next, false);
            return next;
        });
    }, [setCurrentTask, onSave]);

    const removeAction = useCallback((id: string) => {
        setCurrentTask((prev) => {
            if (!prev) return null;
            const next = { ...prev, actions: prev.actions.filter(a => a.id !== id) };
            onSave(next, false);
            return next;
        });
    }, [setCurrentTask, onSave]);

    const getDropTargetFromPoint = useCallback((pointerX: number, pointerY: number, activeId: string) => {
        const actions = currentTask.actions;
        const structure = buildActionScopeMap(actions);
        const allowedScopes = getAllowedDropScopeIds(actions, activeId);
        const fromIndex = actions.findIndex((action) => action.id === activeId);
        if (fromIndex === -1) return null;
        const sourceRange = getActionBlockRange(actions, fromIndex);
        const sourceIds = new Set(actions.slice(sourceRange.start, sourceRange.end + 1).map((action) => action.id));
        const candidates: Array<ActionDropTarget & { x: number; y: number }> = [];

        allowedScopes.forEach((scopeId) => {
            const scope = structure.scopes[scopeId];
            if (!scope) return;
            const siblingIds = scope.actionIds.filter((id) => !sourceIds.has(id));
            siblingIds.forEach((id, index) => {
                const element = document.getElementById(`action-${id}`);
                if (!element) return;
                const rect = element.getBoundingClientRect();
                candidates.push({
                    scopeId,
                    beforeActionId: id,
                    highlightActionId: id,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                });
                candidates.push({
                    scopeId,
                    beforeActionId: siblingIds[index + 1] ?? null,
                    highlightActionId: id,
                    x: rect.left + rect.width / 2,
                    y: rect.bottom,
                });
            });

            document.querySelectorAll<HTMLElement>('[data-action-drop-scope]').forEach((element) => {
                if (element.dataset.actionDropScope !== scopeId) return;
                const rect = element.getBoundingClientRect();
                candidates.push({
                    scopeId,
                    beforeActionId: null,
                    highlightActionId: siblingIds[siblingIds.length - 1] ?? null,
                    x: rect.left + rect.width / 2,
                    y: rect.top + rect.height / 2,
                });
            });
        });

        let nearest: (ActionDropTarget & { x: number; y: number }) | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        candidates.forEach((candidate) => {
            const distance = Math.hypot(pointerX - candidate.x, pointerY - candidate.y);
            if (distance < nearestDistance) {
                nearest = candidate;
                nearestDistance = distance;
            }
        });
        if (!nearest) return null;
        const { scopeId, beforeActionId, highlightActionId } = nearest;
        return { scopeId, beforeActionId, highlightActionId };
    }, [currentTask.actions]);

    const finalizeDrag = useCallback(() => {
        if (!dragState) return;
        if (dragTarget) moveAction(dragState.id, dragTarget);
        setDragState(null);
        setDragTarget(null);
        dragPointerIdRef.current = null;
    }, [dragState, dragTarget, moveAction]);

    const handleActionPointerDown = useCallback((e: React.PointerEvent, id: string, index: number) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
            setSelectedActionIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
            });
            return;
        }
        setSelectedActionIds(new Set([id]));
        const el = document.getElementById(`action-${id}`);
        if (!el) return;
        const rect = el.getBoundingClientRect();
        dragPointerIdRef.current = e.pointerId;
        setDragState({
            id,
            startX: e.clientX,
            startY: e.clientY,
            currentY: e.clientY,
            height: rect.height,
            index,
            originTop: rect.top,
            pointerOffset: e.clientY - rect.top
        });
        setDragTarget(null);
    }, []);

    useEffect(() => {
        if (!dragState) return;
        const handlePointerMove = (e: PointerEvent) => {
            if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
            setDragState((prev) => prev ? { ...prev, currentY: e.clientY } : prev);
            if (Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY) < 14) {
                setDragTarget(null);
            } else {
                setDragTarget(getDropTargetFromPoint(e.clientX, e.clientY, dragState.id));
            }
        };
        const handlePointerUp = (e: PointerEvent) => {
            if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
            finalizeDrag();
        };
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerUp);
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [dragState, getDropTargetFromPoint, finalizeDrag]);

    const dragOverIndex = dragTarget?.highlightActionId
        ? currentTask.actions.findIndex((action) => action.id === dragTarget.highlightActionId)
        : null;

    return {
        selectedActionIds,
        setSelectedActionIds,
        dragState,
        dragOverIndex,
        updateAction,
        moveAction,
        removeAction,
        handleActionPointerDown
    };
};
