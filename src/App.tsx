import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Task, ViewMode, Results } from './types';

import Sidebar from './components/Sidebar';
import AuthScreen from './components/AuthScreen';
import DashboardScreen from './components/DashboardScreen';
import EditorScreen from './components/EditorScreen';
import SettingsScreen from './components/SettingsScreen';
import LoadingScreen from './components/LoadingScreen';
import ExecutionsScreen from './components/ExecutionsScreen';
import ExecutionDetailScreen from './components/ExecutionDetailScreen';
import CapturesScreen from './components/CapturesScreen';
import NotFoundScreen from './components/NotFoundScreen';
import CenterAlert from './components/app/CenterAlert';
import CenterConfirm from './components/app/CenterConfirm';
import EditorLoader from './components/app/EditorLoader';
import ReleaseNotesModal from './components/app/ReleaseNotesModal';

import { useAuth } from './hooks/useAuth';
import { useTasks } from './hooks/useTasks';
import { useExecution } from './hooks/useExecution';
import { useUI } from './hooks/useUI';
import { serializeTaskSnapshot, formatLabel } from './utils/taskUtils';

export default function App() {
    const navigate = useNavigate();
    const location = useLocation();

    // UI Hooks
    const { centerAlert, setCenterAlert, centerConfirm, showAlert, requestConfirm, closeConfirm } = useUI();

    // Auth Hook
    const { authStatus, authError, authBusy, handleAuthSubmit, logout } = useAuth();

    // Task Hook
    const {
        tasks,
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
    } = useTasks(navigate, showAlert, requestConfirm);

    // Execution Hook
    const {
        isExecuting,
        isHeadfulOpen,
        results,
        setResults,
        activeRunId,
        useNovnc,
        runTaskWithSnapshot,
        stopTask,
        openHeadful,
        stopHeadful
    } = useExecution(showAlert);

    // Reload tasks when auth is confirmed (fixes race condition on restart)
    useEffect(() => {
        if (authStatus === 'authenticated') {
            loadTasks();
        }
    }, [authStatus]);

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const lastSavedSnapshot = useRef('');
    const [editorView, setEditorView] = useState<ViewMode>('visual');
    const [pinnedResultsByTask, setPinnedResultsByTask] = useState<Record<string, Results>>({});

    const pinnedResultsKey = 'doppelganger.pinnedResults';
    const getTaskKey = (task?: Task | null) => task?.id ? String(task.id) : 'new';
    const currentTaskKey = getTaskKey(currentTask);
    const pinnedResults = currentTask ? pinnedResultsByTask[currentTaskKey] || null : null;

    useEffect(() => {
        try {
            const stored = localStorage.getItem(pinnedResultsKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (parsed && typeof parsed === 'object') {
                    setPinnedResultsByTask(parsed);
                }
            }
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(pinnedResultsKey, JSON.stringify(pinnedResultsByTask));
        } catch {
            // ignore
        }
    }, [pinnedResultsByTask]);

    useEffect(() => {
        if (!location.pathname.startsWith('/tasks') && editorView === 'history') {
            setEditorView('visual');
        }
    }, [location.pathname, editorView]);

    useEffect(() => {
        if (location.pathname === '/tasks/new' && !currentTask) {
            createNewTask(setResults, setHasUnsavedChanges);
        }
    }, [location.pathname]);

    useEffect(() => {
        if (!currentTask) {
            setHasUnsavedChanges(false);
            return;
        }
        const snapshot = serializeTaskSnapshot(currentTask);
        setHasUnsavedChanges(snapshot !== lastSavedSnapshot.current);
    }, [currentTask]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = (event: BeforeUnloadEvent) => {
            if (!hasUnsavedChanges) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [hasUnsavedChanges]);

    const markTaskAsSaved = useCallback((task: Task | null) => {
        lastSavedSnapshot.current = serializeTaskSnapshot(task);
        setHasUnsavedChanges(false);
    }, []);

    const pinResults = (data: Results) => {
        if (!currentTask) return;
        setPinnedResultsByTask((prev) => ({ ...prev, [currentTaskKey]: data }));
    };

    const unpinResults = () => {
        if (!currentTask) return;
        setPinnedResultsByTask((prev) => {
            const next = { ...prev };
            delete next[currentTaskKey];
            return next;
        });
    };

    const clearStorage = async (type: 'screenshots' | 'cookies') => {
        if (!await requestConfirm(`Delete all ${type}?`)) return;
        const endpoint = type === 'screenshots' ? '/api/clear-screenshots' : '/api/clear-cookies';
        await fetch(endpoint, { method: 'POST' });
        showAlert(`${formatLabel(type)} cleared.`, 'success');
    };

    const getCurrentScreen = () => {
        if (location.pathname.startsWith('/tasks')) return 'editor';
        if (location.pathname === '/settings') return 'settings';
        if (location.pathname === '/executions') return 'executions';
        if (location.pathname === '/captures') return 'captures';
        return 'dashboard';
    };

    const handleNavigate = useCallback((s: 'dashboard' | 'editor' | 'settings' | 'executions' | 'captures') => {
        if (s === 'dashboard') navigate('/dashboard');
        else if (s === 'settings') {
            navigate('/settings');
        } else if (s === 'executions') {
            navigate('/executions');
        } else if (s === 'captures') {
            navigate('/captures');
        }
    }, [navigate]);

    const handleNewTask = useCallback(() => {
        createNewTask(setResults, setHasUnsavedChanges);
    }, [createNewTask, setResults, setHasUnsavedChanges]);

    const handleEditTask = useCallback((task: Task) => {
        editTask(task, markTaskAsSaved, setResults);
    }, [editTask, markTaskAsSaved, setResults]);

    const handleDeleteTask = useCallback((id: string) => {
        deleteTask(id, location.pathname);
    }, [deleteTask, location.pathname]);

    const handleSaveTask = useCallback((t: Task | undefined, createVersion?: boolean) => {
        return saveTask(markTaskAsSaved, location.pathname, t, createVersion);
    }, [saveTask, markTaskAsSaved, location.pathname]);

    const handleLogout = useCallback(() => {
        logout(requestConfirm);
    }, [logout, requestConfirm]);

    let content: React.ReactNode;
    if (authStatus === 'login' || authStatus === 'setup') {
        content = <AuthScreen status={authStatus} onSubmit={handleAuthSubmit} error={authError} busy={authBusy} />;
    } else if (authStatus === 'checking') {
        content = <LoadingScreen title="Authenticating" subtitle="Verifying session state" />;
    } else {
        content = (
            <div className="h-full flex flex-row overflow-hidden bg-[#020202]">
                <ReleaseNotesModal />
                <Sidebar
                    onNavigate={handleNavigate}
                    onNewTask={handleNewTask}
                    onLogout={handleLogout}
                    currentScreen={getCurrentScreen()}
                />

                <Routes>
                    <Route path="/" element={<DashboardScreen tasks={tasks} onNewTask={handleNewTask} onEditTask={handleEditTask} onDeleteTask={handleDeleteTask} onExportTasks={exportTasks} onImportTasks={importTasks} />} />
                    <Route path="/dashboard" element={<DashboardScreen tasks={tasks} onNewTask={handleNewTask} onEditTask={handleEditTask} onDeleteTask={handleDeleteTask} onExportTasks={exportTasks} onImportTasks={importTasks} />} />
                    <Route path="/tasks/new" element={
                        currentTask ? (
                            <EditorScreen
                                currentTask={currentTask}
                                setCurrentTask={setCurrentTask}
                                tasks={tasks}
                                editorView={editorView}
                                setEditorView={setEditorView}
                                isExecuting={isExecuting}
                                onSave={handleSaveTask}
                                onRun={() => runTaskWithSnapshot(currentTask, currentTask, setCurrentTask)}
                                onRunSnapshot={(t) => runTaskWithSnapshot(t || currentTask, currentTask, setCurrentTask)}
                                results={results}
                                pinnedResults={pinnedResults}
                                onConfirm={requestConfirm}
                                onNotify={showAlert}
                                onPinResults={pinResults}
                                onUnpinResults={unpinResults}
                                runId={activeRunId}
                                onStop={() => stopTask()}
                                isHeadfulOpen={isHeadfulOpen}
                                onOpenHeadful={(url, targetActionId, taskSnapshot, variables) => openHeadful(url, targetActionId, taskSnapshot, variables)}
                                onStopHeadful={stopHeadful}
                                useNovnc={useNovnc}
                            />
                        ) : <LoadingScreen title="Initializing" subtitle="Preparing task workspace" />
                    } />
                    <Route
                        path="/tasks/:id"
                        element={
                            <EditorLoader
                                tasks={tasks}
                                loadTasks={loadTasks}
                                touchTask={touchTask}
                                currentTask={currentTask}
                                setCurrentTask={setCurrentTask}
                                editorView={editorView}
                                setEditorView={setEditorView}
                                isExecuting={isExecuting}
                                onSave={handleSaveTask}
                                onRun={() => runTaskWithSnapshot(currentTask, currentTask, setCurrentTask)}
                                onRunSnapshot={(t) => runTaskWithSnapshot(t || currentTask, currentTask, setCurrentTask)}
                                results={results}
                                pinnedResults={pinnedResults}
                                onConfirm={requestConfirm}
                                onNotify={showAlert}
                                onPinResults={pinResults}
                                onUnpinResults={unpinResults}
                                runId={activeRunId}
                                onStop={() => stopTask()}
                                onTaskLoaded={markTaskAsSaved}
                                isHeadfulOpen={isHeadfulOpen}
                                onOpenHeadful={(url, targetActionId, taskSnapshot, variables) => openHeadful(url, targetActionId, taskSnapshot, variables)}
                                onStopHeadful={stopHeadful}
                                useNovnc={useNovnc}
                            />
                        }
                    />
                    <Route path="/settings" element={
                        <SettingsScreen
                            onClearStorage={clearStorage}
                            onConfirm={requestConfirm}
                            onNotify={showAlert}
                        />
                    } />
                    <Route path="/executions" element={<ExecutionsScreen onConfirm={requestConfirm} onNotify={showAlert} />} />
                    <Route path="/executions/:id" element={<ExecutionDetailScreen onConfirm={requestConfirm} onNotify={showAlert} />} />
                    <Route path="/captures" element={<CapturesScreen onConfirm={requestConfirm} onNotify={showAlert} />} />
                    <Route path="*" element={<NotFoundScreen onBack={() => navigate('/dashboard')} />} />
                </Routes>
            </div>
        );
    }

    return (
        <div className="h-full">
            {centerAlert && (
                <CenterAlert
                    message={centerAlert.message}
                    tone={centerAlert.tone}
                    onClose={() => setCenterAlert(null)}
                />
            )}
            {centerConfirm && (
                <CenterConfirm
                    request={centerConfirm}
                    onResolve={closeConfirm}
                />
            )}
            {content}
        </div>
    );
}
