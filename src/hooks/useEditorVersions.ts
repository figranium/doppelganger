import { useState, useCallback } from 'react';
import { Task, TaskMode } from '../types';

export const useEditorVersions = (
    currentTask: Task,
    onNotify: (msg: string, tone?: 'success' | 'error') => void,
    onConfirm: (req: any) => Promise<boolean>,
    setCurrentTask: (task: Task) => void,
    onSaveVersion: (task: Task) => Promise<void>,
) => {
    const [versions, setVersions] = useState<{ id: string; timestamp: number; name: string; mode: TaskMode }[]>([]);
    const [versionsLoading, setVersionsLoading] = useState(false);
    const [versionPreview, setVersionPreview] = useState<{ id: string; timestamp: number; snapshot: Task } | null>(null);
    const [isCreatingVersion, setIsCreatingVersion] = useState(false);
    const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);

    const loadVersions = useCallback(async () => {
        if (!currentTask.id) return;
        setVersionsLoading(true);
        try {
            const res = await fetch(`/api/tasks/${currentTask.id}/versions`);
            if (!res.ok) throw new Error('Failed to load versions');
            const data = await res.json();
            setVersions(Array.isArray(data.versions) ? data.versions : []);
        } catch (e) {
            setVersions([]);
        } finally {
            setVersionsLoading(false);
        }
    }, [currentTask.id]);

    const rollbackToVersion = useCallback(async (versionId: string) => {
        if (!currentTask.id) return;
        const confirmed = await onConfirm('Rollback to this version? Current changes will be saved as a new version.');
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/tasks/${currentTask.id}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ versionId })
            });
            if (!res.ok) throw new Error('Rollback failed');
            const restored = await res.json();
            setCurrentTask(restored);
            onNotify('Rolled back to selected version.', 'success');
            loadVersions();
        } catch (e) {
            onNotify('Rollback failed.', 'error');
        }
    }, [currentTask.id, onConfirm, onNotify, setCurrentTask, loadVersions]);

    const openVersionPreview = useCallback(async (versionId: string) => {
        if (!currentTask.id) return;
        try {
            const res = await fetch(`/api/tasks/${currentTask.id}/versions/${versionId}`);
            if (!res.ok) throw new Error('Failed to load version');
            const data = await res.json();
            if (!data?.snapshot) throw new Error('Missing snapshot');
            setVersionPreview({
                id: data.metadata?.id || versionId,
                timestamp: data.metadata?.timestamp || Date.now(),
                snapshot: data.snapshot
            });
        } catch {
            onNotify('Failed to load version snapshot.', 'error');
        }
    }, [currentTask.id, onNotify]);

    const createVersion = useCallback(async () => {
        if (!currentTask.id || isCreatingVersion) return;
        setIsCreatingVersion(true);
        try {
            await onSaveVersion(currentTask);
            await loadVersions();
            onNotify('New version created.', 'success');
        } catch {
            onNotify('Failed to create a new version.', 'error');
        } finally {
            setIsCreatingVersion(false);
        }
    }, [currentTask, isCreatingVersion, loadVersions, onNotify, onSaveVersion]);

    const deleteVersion = useCallback(async (versionId: string) => {
        if (!currentTask.id || deletingVersionId) return;
        const confirmed = await onConfirm('Delete this version permanently? This cannot be undone.');
        if (!confirmed) return;
        setDeletingVersionId(versionId);
        try {
            const response = await fetch(`/api/tasks/${currentTask.id}/versions/${versionId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Version deletion failed');
            setVersions((current) => current.filter((version) => version.id !== versionId));
            if (versionPreview?.id === versionId) setVersionPreview(null);
            onNotify('Version deleted.', 'success');
        } catch {
            onNotify('Failed to delete the version.', 'error');
        } finally {
            setDeletingVersionId(null);
        }
    }, [currentTask.id, deletingVersionId, onConfirm, onNotify, versionPreview?.id]);

    return {
        versions,
        versionsLoading,
        isCreatingVersion,
        deletingVersionId,
        versionPreview,
        setVersionPreview,
        loadVersions,
        rollbackToVersion,
        openVersionPreview,
        createVersion,
        deleteVersion,
    };
};
