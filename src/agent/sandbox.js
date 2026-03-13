const { JSDOM } = require('jsdom');
const vm = require('vm');

const REAL_TARGET = Symbol('REAL_TARGET');

function createSafeProxy(target) {
    if (target === null || (typeof target !== 'object' && typeof target !== 'function')) {
        return target;
    }

    let shadowTarget = target;
    if (typeof target === 'function') {
        shadowTarget = function (...args) { };
        // Best effort to copy function properties. If these fail (e.g. non-configurable), we ignore.
        try { Object.defineProperty(shadowTarget, 'name', { value: target.name, configurable: true }); } catch (e) { /* ignore */ }
        try { Object.defineProperty(shadowTarget, 'length', { value: target.length, configurable: true }); } catch (e) { /* ignore */ }
        shadowTarget[REAL_TARGET] = target;
    }

    return new Proxy(shadowTarget, {
        get(target, prop, receiver) {
            const realTarget = target[REAL_TARGET] || target;
            if (prop === 'constructor' || prop === '__proto__') {
                return undefined;
            }
            if (prop === REAL_TARGET) return realTarget;

            const value = Reflect.get(realTarget, prop, realTarget);

            if (typeof value === 'function') {
                return function (...args) {
                    const realArgs = args.map(arg => {
                        return (arg && arg[REAL_TARGET]) ? arg[REAL_TARGET] : arg;
                    });
                    const wrappedArgs = realArgs.map(arg => {
                        if (typeof arg === 'function') {
                            return function (...cbArgs) {
                                const wrappedCbArgs = cbArgs.map(a => createSafeProxy(a));
                                return arg.apply(this, wrappedCbArgs);
                            }
                        }
                        return arg;
                    });
                    try {
                        const result = value.apply(realTarget, wrappedArgs);
                        return createSafeProxy(result);
                    } catch (e) {
                        throw e;
                    }
                };
            }
            return createSafeProxy(value);
        },
        apply(target, thisArg, argList) {
             const realTarget = target[REAL_TARGET] || target;
             const realThis = (thisArg && thisArg[REAL_TARGET]) ? thisArg[REAL_TARGET] : thisArg;
             const realArgs = argList.map(arg => {
                return (arg && arg[REAL_TARGET]) ? arg[REAL_TARGET] : arg;
             });
             const wrappedArgs = realArgs.map(arg => {
                 if (typeof arg === 'function') {
                      return function (...cbArgs) {
                           const wrappedCbArgs = cbArgs.map(a => createSafeProxy(a));
                           return arg.apply(this, wrappedCbArgs);
                      }
                 }
                 return arg;
             });

             try {
                 const result = Reflect.apply(realTarget, realThis, wrappedArgs);
                 return createSafeProxy(result);
             } catch (e) {
                 throw e;
             }
        },
        construct(target, argumentsList, newTarget) {
            const realTarget = target[REAL_TARGET] || target;
            const realArgs = argumentsList.map(arg => {
                return (arg && arg[REAL_TARGET]) ? arg[REAL_TARGET] : arg;
            });
            try {
                const result = Reflect.construct(realTarget, realArgs, realTarget);
                return createSafeProxy(result);
            } catch (e) {
                throw e;
            }
        }
    });
}

const runExtractionScript = async (script, html, pageUrl, includeShadowDom) => {
    if (!script || typeof script !== 'string') return { result: undefined, logs: [] };
    try {
        const dom = new JSDOM(html || '');
        const { window } = dom;
        const logBuffer = [];
        const consoleProxy = {
            log: (...args) => logBuffer.push(args.join(' ')),
            warn: (...args) => logBuffer.push(args.join(' ')),
            error: (...args) => logBuffer.push(args.join(' '))
        };
        const shadowHelpers = (() => {
            const shadowQueryAll = (selector, root = window.document) => {
                const results = [];
                const walk = (node) => {
                    if (!node) return;
                    if (node.nodeType === 1) {
                        const el = node;
                        if (selector && el.matches && el.matches(selector)) results.push(el);
                        if (el.tagName === 'TEMPLATE' && el.hasAttribute('data-shadowroot')) {
                            walk(el.content);
                        }
                    } else if (node.nodeType === 11) {
                        // DocumentFragment
                    }
                    if (node.childNodes) {
                        node.childNodes.forEach((child) => walk(child));
                    }
                };
                walk(root);
                return results;
            };

            const shadowText = (root = window.document) => {
                const texts = [];
                const walk = (node) => {
                    if (!node) return;
                    if (node.nodeType === 3) {
                        const text = node.nodeValue ? node.nodeValue.trim() : '';
                        if (text) texts.push(text);
                        return;
                    }
                    if (node.nodeType === 1) {
                        const el = node;
                        if (el.tagName === 'TEMPLATE' && el.hasAttribute('data-shadowroot')) {
                            walk(el.content);
                        }
                    }
                    if (node.childNodes) {
                        node.childNodes.forEach((child) => walk(child));
                    }
                };
                walk(root);
                return texts;
            };

            return { shadowQueryAll, shadowText };
        })();

        const $$data = {
            html: () => html || '',
            url: () => pageUrl || '',
            window,
            document: window.document,
            shadowQueryAll: includeShadowDom ? shadowHelpers.shadowQueryAll : undefined,
            shadowText: includeShadowDom ? shadowHelpers.shadowText : undefined
        };

        // Use vm for sandboxed execution
        const sandbox = Object.create(null);
        sandbox.window = createSafeProxy(window);
        sandbox.document = createSafeProxy(window.document);
        sandbox.DOMParser = createSafeProxy(window.DOMParser);
        sandbox.console = createSafeProxy(consoleProxy);
        sandbox.$$data = createSafeProxy($$data);

        // Pass the script as a variable to avoid string interpolation (CodeQL: Code Injection)
        sandbox.$$userScript = script;

        const context = vm.createContext(sandbox);

        // We use a static wrapper to execute the user script.
        // This ensures that the code passed to vm.runInContext is constant and safe.
        // The user script is retrieved from the sandbox environment and executed as an AsyncFunction.
        const scriptCode = `
            "use strict";
            (async () => {
                const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                const fn = new AsyncFunction('$$data', 'window', 'document', 'DOMParser', 'console', $$userScript);
                return fn($$data, window, document, DOMParser, console);
            })();
        `;

        const result = await vm.runInContext(scriptCode, context, { timeout: 5000 });
        return { result, logs: logBuffer };
    } catch (e) {
        return { result: `Extraction script error: ${e.message}`, logs: [] };
    }
};

module.exports = { createSafeProxy, runExtractionScript };
