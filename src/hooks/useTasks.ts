import { useState, useEffect, useCallback, useRef } from 'react';
import { Task } from '../types';
import { normalizeImportedTask, buildNewTask, parseBooleanFlag, ensureActionIds } from '../utils/taskUtils';

export function useTasks(
    navigate: (path: string, options?: any) => void,
    showAlert: (msg: string, tone?: 'success' | 'error') => void,
    requestConfirm: (msg: string) => Promise<boolean>
) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [currentTask, setCurrentTask] = useState<Task | null>(null);
    const currentTaskRef = useRef<Task | null>(null);

    useEffect(() => {
        currentTaskRef.current = currentTask;
    }, [currentTask]);

    const loadTasks = useCallback(async () => {
        try {
            const res = await fetch('/api/tasks', { credentials: 'include' });
            const data = await res.json();
            const sorted = [...data].sort((a: Task, b: Task) => (b.last_opened || 0) - (a.last_opened || 0));
            setTasks(sorted);
            return sorted;
        } catch (e) {
            console.error("Failed to load tasks", e);
            return [];
        }
    }, []);

    const touchTask = useCallback(async (id: string) => {
        try {
            await fetch(`/api/tasks/${id}/touch`, { method: 'POST' });
            loadTasks();
        } catch (e) {
            console.error("Failed to touch task", e);
        }
    }, [loadTasks]);

    const createNewTask = useCallback((setResults: (val: any) => void, setHasUnsavedChanges: (val: boolean) => void) => {
        const newTask = buildNewTask();
        setHasUnsavedChanges(true);
        setCurrentTask(newTask);
        setResults(null);
        navigate('/tasks/new');
    }, [navigate]);

    const editTask = useCallback((task: Task, markTaskAsSaved: (task: Task | null) => void, setResults: (val: any) => void) => {
        const migratedTask = { ...task };
        if (!migratedTask.variables || Array.isArray(migratedTask.variables)) migratedTask.variables = {};
        if (!migratedTask.stealth) {
            migratedTask.stealth = {
                allowTypos: false,
                idleMovements: false,
                overscroll: false,
                deadClicks: false,
                fatigue: false,
                naturalTyping: false,
                cursorGlide: false,
                randomizeClicks: false
            };
        }
        if (migratedTask.stealth.cursorGlide === undefined) migratedTask.stealth.cursorGlide = (migratedTask.stealth as any).humanCursor ?? false;
        delete (migratedTask.stealth as any).humanCursor;
        if (migratedTask.stealth.randomizeClicks === undefined) migratedTask.stealth.randomizeClicks = false;
        if (migratedTask.rotateProxies === undefined) migratedTask.rotateProxies = false;
        if (migratedTask.rotateViewport === undefined) migratedTask.rotateViewport = false;
        if (!migratedTask.extractionFormat) migratedTask.extractionFormat = 'json';
        if (migratedTask.includeHtml === undefined) migratedTask.includeHtml = false;
        if (migratedTask.includeShadowDom === undefined) migratedTask.includeShadowDom = true;
        if (migratedTask.disableRecording === undefined) migratedTask.disableRecording = false;
        migratedTask.disableRecording = parseBooleanFlag(migratedTask.disableRecording);
        if (migratedTask.statelessExecution === undefined) migratedTask.statelessExecution = false;
        migratedTask.statelessExecution = parseBooleanFlag(migratedTask.statelessExecution);
        const normalized = ensureActionIds(migratedTask);
        setCurrentTask(normalized);
        markTaskAsSaved(normalized);
        setResults(null);
        navigate(`/tasks/${task.id}`);
        if (task.id) touchTask(task.id);
    }, [navigate, touchTask]);

    const deleteTask = useCallback(async (id: string, currentPath: string) => {
        if (!await requestConfirm('Are you sure you want to delete this task?')) return;
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        loadTasks();
        if (currentPath.includes(id)) {
            navigate('/dashboard');
        }
    }, [requestConfirm, loadTasks, navigate]);

    const saveTask = useCallback(async (markTaskAsSaved: (task: Task | null) => void, currentPath: string, taskOverride?: Task, createVersion: boolean = false) => {
        const taskToUpdate = taskOverride || currentTaskRef.current;
        if (!taskToUpdate) return;
        const taskToSave = { ...taskToUpdate, last_opened: Date.now() };
        const query = createVersion ? '?version=true' : '';
        const res = await fetch(`/api/tasks${query}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskToSave)
        });
        const saved = await res.json();
        setCurrentTask(saved);
        markTaskAsSaved(saved);
        loadTasks();
        if (currentPath.includes('new')) {
            navigate(`/tasks/${saved.id}`, { replace: true });
        }
    }, [navigate, loadTasks]);

    const exportTasks = useCallback((taskIds?: string[]) => {
        let tasksToExport = tasks;
        if (taskIds && taskIds.length > 0) {
            tasksToExport = tasks.filter(t => t.id && taskIds.includes(t.id));
        }

        if (tasksToExport.length === 0) {
            showAlert('No tasks selected to export.', 'error');
            return;
        }

        const payload = {
            exportedAt: new Date().toISOString(),
            tasks: tasksToExport
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const stamp = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `doppelganger-tasks-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showAlert(`Exported ${tasksToExport.length} task(s).`, 'success');
    }, [tasks, showAlert]);

    const importTasks = useCallback(async (file: File) => {
        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            let list: any[] = [];
            if (Array.isArray(parsed)) {
                list = parsed;
            } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.tasks)) {
                    list = parsed.tasks;
                } else if (parsed.name || parsed.actions) {
                    // Looks like a single task object
                    list = [parsed];
                }
            }

            if (list.length === 0) {
                showAlert('Invalid import file.', 'error');
                return;
            }

            const stamp = Date.now();
            const prepared = list
                .map((raw, index) => normalizeImportedTask(raw, index))
                .filter((task): task is Task => !!task)
                .map((task, index) => (task.id ? task : { ...task, id: `task_${stamp}_${index}` }));

            if (prepared.length === 0) {
                showAlert('No tasks to import.', 'error');
                return;
            }

            await Promise.all(prepared.map((task) => (
                fetch('/api/tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(task)
                })
            )));
            await loadTasks();
            showAlert(`Imported ${prepared.length} task(s).`, 'success');
        } catch (e: any) {
            showAlert(`Import failed: ${e.message || 'Unknown error'}`, 'error');
        }
    }, [showAlert, loadTasks]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    return {
        tasks,
        setTasks,
        currentTask,
        setCurrentTask,
        loadTasks,
        touchTask,
        createNewTask,
        editTask,
        deleteTask,
        saveTask,
        exportTasks,
        importTasks
    };
}
