import { useState, useCallback, useRef, useEffect } from 'react';
import { Task, Action } from '../types';

export const useEditorActions = (
    currentTask: Task,
    setCurrentTask: (task: Task | ((prev: Task | null) => Task | null)) => void,
    onSave: (task: Task, createVersion: boolean) => void,
) => {
    const [selectedActionIds, setSelectedActionIds] = useState<Set<string>>(new Set());
    const [dragState, setDragState] = useState<{
        id: string;
        startY: number;
        currentY: number;
        height: number;
        index: number;
        originTop: number;
        pointerOffset: number;
    } | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
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

    const moveAction = useCallback((fromId: string, toId: string) => {
        if (fromId === toId) return;
        setCurrentTask((prev) => {
            if (!prev) return null;
            const actions = [...prev.actions];
            const fromIndex = actions.findIndex((a) => a.id === fromId);
            const toIndex = actions.findIndex((a) => a.id === toId);
            if (fromIndex === -1 || toIndex === -1) return prev;
            const [moved] = actions.splice(fromIndex, 1);
            actions.splice(toIndex, 0, moved);
            const next = { ...prev, actions };
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

    const getDragIndexFromY = useCallback((pointerY: number, activeId: string, snapIndex?: number, snapCenter?: number) => {
        if (snapIndex !== undefined && snapCenter !== undefined) {
            if (Math.abs(pointerY - snapCenter) < 14) {
                return snapIndex;
            }
        }
        const actions = currentTask.actions;
        let nextIndex = actions.length - 1;
        for (let i = 0; i < actions.length; i++) {
            if (actions[i].id === activeId) continue;
            const el = document.getElementById(`action-${actions[i].id}`);
            if (!el) continue;
            const rect = el.getBoundingClientRect();
            const midpoint = rect.top + rect.height * 0.4;
            if (pointerY < midpoint) {
                nextIndex = i;
                break;
            }
        }
        return nextIndex;
    }, [currentTask.actions]);

    const finalizeDrag = useCallback(() => {
        if (!dragState) return;
        if (dragOverIndex !== null && dragOverIndex !== dragState.index) {
            const targetId = currentTask.actions[dragOverIndex]?.id;
            if (targetId) moveAction(dragState.id, targetId);
        }
        setDragState(null);
        setDragOverIndex(null);
        dragPointerIdRef.current = null;
    }, [dragState, dragOverIndex, currentTask.actions, moveAction]);

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
            startY: e.clientY,
            currentY: e.clientY,
            height: rect.height,
            index,
            originTop: rect.top,
            pointerOffset: e.clientY - rect.top
        });
        setDragOverIndex(index);
    }, []);

    useEffect(() => {
        if (!dragState) return;
        const handlePointerMove = (e: PointerEvent) => {
            if (dragPointerIdRef.current !== null && e.pointerId !== dragPointerIdRef.current) return;
            const originCenter = dragState.originTop + dragState.height / 2;
            const nextIndex = getDragIndexFromY(e.clientY, dragState.id, dragState.index, originCenter);
            setDragState((prev) => prev ? { ...prev, currentY: e.clientY } : prev);
            setDragOverIndex(nextIndex);
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
    }, [dragState, getDragIndexFromY, finalizeDrag]);

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
