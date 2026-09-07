(() => {
    let openedForCurrentNewTask = false;

    const maybeOpenExecutionConfig = () => {
        if (window.location.pathname !== '/tasks/new') {
            openedForCurrentNewTask = false;
            return;
        }

        if (openedForCurrentNewTask) return;

        const button = document.querySelector('button[aria-label="Configure On Execution"]');
        if (!(button instanceof HTMLButtonElement)) return;

        openedForCurrentNewTask = true;
        button.click();
    };

    const notifyRouteChange = () => {
        queueMicrotask(maybeOpenExecutionConfig);
    };

    const originalPushState = history.pushState.bind(history);
    history.pushState = (...args) => {
        const result = originalPushState(...args);
        notifyRouteChange();
        return result;
    };

    const originalReplaceState = history.replaceState.bind(history);
    history.replaceState = (...args) => {
        const result = originalReplaceState(...args);
        notifyRouteChange();
        return result;
    };

    window.addEventListener('popstate', notifyRouteChange);

    const observer = new MutationObserver(maybeOpenExecutionConfig);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    maybeOpenExecutionConfig();
})();
