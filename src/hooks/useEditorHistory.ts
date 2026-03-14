import { useEffect, useRef, useCallback } from 'react';
import { Task } from '../types';

export const useEditorHistory = (
    currentTask: Task,
    setCurrentTask: (task: Task) => void,
    onSave: (task: Task, createVersion: boolean) => void
) => {
    const historyRef = useRef<Task[]>([]);
    const historyPointerRef = useRef<number>(-1);
    const isUndoRedoActionRef = useRef<boolean>(false);
    const lastSavedSnapshotRef = useRef<string>('');

    useEffect(() => {
        if (isUndoRedoActionRef.current) {
            isUndoRedoActionRef.current = false;
            return;
        }

        const snapshot = JSON.stringify(currentTask);
        if (snapshot === lastSavedSnapshotRef.current) {
            return;
        }

        const timeout = setTimeout(() => {
            lastSavedSnapshotRef.current = snapshot;

            if (historyPointerRef.current < historyRef.current.length - 1) {
                historyRef.current = historyRef.current.slice(0, historyPointerRef.current + 1);
            }

            historyRef.current.push(JSON.parse(snapshot));
            historyPointerRef.current = historyRef.current.length - 1;

            if (historyRef.current.length > 50) {
                historyRef.current.shift();
                historyPointerRef.current -= 1;
            }
        }, 300);

        return () => clearTimeout(timeout);
    }, [currentTask]);

    const undo = useCallback(() => {
        if (historyPointerRef.current > 0) {
            historyPointerRef.current -= 1;
            const prevTask = historyRef.current[historyPointerRef.current];
            isUndoRedoActionRef.current = true;
            lastSavedSnapshotRef.current = JSON.stringify(prevTask);
            setCurrentTask(prevTask);
            onSave(prevTask, false);
        }
    }, [setCurrentTask, onSave]);

    const redo = useCallback(() => {
        if (historyPointerRef.current < historyRef.current.length - 1) {
            historyPointerRef.current += 1;
            const nextTask = historyRef.current[historyPointerRef.current];
            isUndoRedoActionRef.current = true;
            lastSavedSnapshotRef.current = JSON.stringify(nextTask);
            setCurrentTask(nextTask);
            onSave(nextTask, false);
        }
    }, [setCurrentTask, onSave]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                const activeEl = document.activeElement;
                if (activeEl) {
                    const tagName = activeEl.tagName.toLowerCase();
                    const isEditable = activeEl.getAttribute('contenteditable') === 'true';
                    if (tagName === 'input' || tagName === 'textarea' || isEditable) {
                        return;
                    }
                }
                e.preventDefault();
                if (e.shiftKey) {
                    redo();
                } else {
                    undo();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    return { undo, redo };
};
