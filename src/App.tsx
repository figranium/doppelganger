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
import ThemeIntroModal from './components/app/ThemeIntroModal';

import { useAuth } from './hooks/useAuth';
import { useTasks } from './hooks/useTasks';
import { useExecution } from './hooks/useExecution';
import { useUI } from './hooks/useUI';
import { useTheme } from './hooks/useTheme';
import { serializeTaskSnapshot } from './utils/taskUtils';

export default function App() {
    const navigate = useNavigate();
    const location = useLocation();

    // UI Hooks
    const { centerAlert, setCenterAlert, centerConfirm, showAlert, requestConfirm, closeConfirm } = useUI();

    // Theme Hook
    const { theme, setTheme, introOpen, dismissIntro } = useTheme();

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
        isStopping,
        isHeadfulOpen,
        results,
        setResults,
        activeRunId,
        activeTaskId,
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
    const [triggerExpanded, setTriggerExpanded] = useState(false);
    const [pinnedResultsByTask, setPinnedResultsByTask] = useState<Record<string, Results>>({});

    const pinnedResultsKey = 'figranium.pinnedResults';
    const getTaskKey = (task?: Task | null) => task?.id ? String(task.id) : 'new';
    const currentTaskKey = getTaskKey(currentTask);
    const isCurrentTaskExecuting = isExecuting && activeTaskId === currentTaskKey;
    const isCurrentTaskStopping = isStopping && activeTaskId === currentTaskKey;
    const currentTaskRunId = isCurrentTaskExecuting ? activeRunId : null;
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
            setTriggerExpanded(true);
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
        setTriggerExpanded(true);
        createNewTask(setResults, setHasUnsavedChanges);
    }, [createNewTask, setResults, setHasUnsavedChanges]);

    const handleEditTask = useCallback((task: Task) => {
        setTriggerExpanded(false);
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

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }

            if (e.altKey) {
                switch (e.key) {
                    case '1':
                        e.preventDefault();
                        handleNavigate('dashboard');
                        break;
                    case '2':
                        e.preventDefault();
                        handleNavigate('settings');
                        break;
                    case '3':
                        e.preventDefault();
                        handleNavigate('executions');
                        break;
                    case '4':
                        e.preventDefault();
                        handleNavigate('captures');
                        break;
                    case 'n':
                    case 'N':
                        e.preventDefault();
                        handleNewTask();
                        break;
                    case 'l':
                    case 'L':
                        e.preventDefault();
                        handleLogout();
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [handleNavigate, handleNewTask, handleLogout]);

    let content: React.ReactNode;
    if (authStatus === 'login' || authStatus === 'setup') {
        content = <AuthScreen status={authStatus} onSubmit={handleAuthSubmit} error={authError} busy={authBusy} />;
    } else if (authStatus === 'checking') {
        content = <LoadingScreen title="Authenticating" subtitle="Verifying session state" />;
    } else {
        content = (
            <div className="h-full flex flex-row overflow-hidden" style={{ backgroundColor: 'var(--app-bg)' }}>
                <ReleaseNotesModal />
                <ThemeIntroModal
                    open={introOpen}
                    currentThemeId={theme.id}
                    onSelect={setTheme}
                    onDismiss={dismissIntro}
                />
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
                                triggerExpanded={triggerExpanded}
                                setTriggerExpanded={setTriggerExpanded}
                                isExecuting={isCurrentTaskExecuting}
                                isStopping={isCurrentTaskStopping}
                                onSave={handleSaveTask}
                                onRun={() => runTaskWithSnapshot(currentTask, currentTask, setCurrentTask)}
                                onRunSnapshot={(t) => runTaskWithSnapshot(t || currentTask, currentTask, setCurrentTask)}
                                results={results}
                                pinnedResults={pinnedResults}
                                onConfirm={requestConfirm}
                                onNotify={showAlert}
                                onPinResults={pinResults}
                                onUnpinResults={unpinResults}
                                runId={currentTaskRunId}
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
                                triggerExpanded={triggerExpanded}
                                setTriggerExpanded={setTriggerExpanded}
                                isExecuting={isCurrentTaskExecuting}
                                isStopping={isCurrentTaskStopping}
                                onSave={handleSaveTask}
                                onRun={() => runTaskWithSnapshot(currentTask, currentTask, setCurrentTask)}
                                onRunSnapshot={(t) => runTaskWithSnapshot(t || currentTask, currentTask, setCurrentTask)}
                                results={results}
                                pinnedResults={pinnedResults}
                                onConfirm={requestConfirm}
                                onNotify={showAlert}
                                onPinResults={pinResults}
                                onUnpinResults={unpinResults}
                                runId={currentTaskRunId}
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
