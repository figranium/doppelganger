function installTurnstileInterceptor(options = {}) {
    const root = globalThis;
    const state = root.__figraniumCaptcha = root.__figraniumCaptcha || {};
    state.blockManaged = Boolean(options.blockManaged);

    const wrapRender = () => {
        const api = root.turnstile;
        if (!api || typeof api.render !== 'function' || api.render.__figraniumWrapped) return;
        const originalRender = api.render;
        const wrappedRender = function (container, renderOptions = {}) {
            const managed = Boolean(renderOptions.cData && renderOptions.chlPageData);
            state.turnstile = {
                siteKey: renderOptions.sitekey || null,
                action: renderOptions.action || null,
                cData: renderOptions.cData || null,
                chlPageData: renderOptions.chlPageData || null,
                callback: typeof renderOptions.callback === 'function' ? renderOptions.callback : null,
                callbackName: typeof renderOptions.callback === 'string' ? renderOptions.callback : null,
                container: typeof container === 'string' ? root.document?.querySelector(container) : container,
                userAgent: navigator.userAgent,
                managed,
                blocked: managed && state.blockManaged,
                readyAt: Date.now(),
                callbackInvoked: false
            };
            if (managed && state.blockManaged) return `figranium-turnstile-${Date.now()}`;
            return originalRender.apply(this, arguments);
        };
        Object.defineProperty(wrappedRender, '__figraniumWrapped', { value: true });
        Object.defineProperty(wrappedRender, '__figraniumOriginal', { value: originalRender });
        api.render = wrappedRender;
    };

    wrapRender();
    const interval = setInterval(wrapRender, 10);
    root.addEventListener?.('pagehide', () => clearInterval(interval), { once: true });
}

module.exports = { installTurnstileInterceptor };
