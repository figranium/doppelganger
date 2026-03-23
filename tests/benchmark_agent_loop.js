
const { performance } = require('perf_hooks');

// Mock data to simulate a large task with many actions
const data = {
    url: 'https://example.com',
    apiKey: 'test-key',
    includeShadowDom: true,
    disableRecording: false,
    statelessExecution: true,
    rotateViewport: false,
    variables: { var1: 'val1', var2: 'val2', longVar: 'a'.repeat(1000) },
    actions: Array.from({ length: 1000 }, (_, i) => ({ id: `act_${i}`, type: 'click', selector: '.btn' })),
    extractionScript: 'return document.title',
    includeHtml: true,
    extractionFormat: 'json'
};

const deadClicks = true;
const humanTyping = true;
const allowTypos = true;
const naturalTyping = true;
const fatigue = true;
const idleMovements = true;
const overscroll = true;
const cursorGlide = true;
const randomizeClicks = true;

const iterations = 10000;

function runBaseline() {
    const start = performance.now();
    let lastMouse = null;
    for (let i = 0; i < iterations; i++) {
        const act = data.actions[i % data.actions.length];
        // This simulates what's inside the while loop in src/agent/index.js (Baseline)
        const actionContext = {
            page: {}, // mock
            logs: [],
            runtimeVars: {},
            resolveTemplate: (v) => v,
            captureScreenshot: async () => '',
            baseDelay: (ms) => ms,
            options: {
                ...data,
                api_key: data.apiKey || data.key,
                deadClicks,
                humanTyping,
                allowTypos,
                naturalTyping,
                fatigue,
                idleMovements,
                overscroll,
                cursorGlide,
                randomizeClicks
            },
            baseUrl: 'http://localhost',
            lastBlockOutput: null,
            get lastMouse() { return lastMouse; },
            set lastMouse(val) { lastMouse = val; },
            setStopOutcome: (out) => { },
            setStopRequested: (req) => { },
            pendingDownloads: new Set(),
            waitForNewDownload: () => Promise.resolve()
        };
        // simulate usage
        if (actionContext.options.api_key !== 'test-key') throw new Error();
        actionContext.lastMouse = { x: i, y: i };
    }
    const end = performance.now();
    return end - start;
}

function runOptimized() {
    const start = performance.now();
    let lastMouse = null;
    // Hoisted options
    const options = {
        ...data,
        api_key: data.apiKey || data.key,
        deadClicks,
        humanTyping,
        allowTypos,
        naturalTyping,
        fatigue,
        idleMovements,
        overscroll,
        cursorGlide,
        randomizeClicks
    };

    // Partially hoisted actionContext (only stable parts)
    const actionContextBase = {
        page: {}, // mock
        logs: [],
        runtimeVars: {},
        resolveTemplate: (v) => v,
        captureScreenshot: async () => '',
        baseDelay: (ms) => ms,
        options,
        baseUrl: 'http://localhost',
        setStopOutcome: (out) => { },
        setStopRequested: (req) => { },
        pendingDownloads: new Set(),
        waitForNewDownload: () => Promise.resolve()
    };

    for (let i = 0; i < iterations; i++) {
        const act = data.actions[i % data.actions.length];

        // Re-use pre-calculated context and only attach loop-varying properties/accessors
        const actionContext = {
            ...actionContextBase,
            lastBlockOutput: null,
            get lastMouse() { return lastMouse; },
            set lastMouse(val) { lastMouse = val; }
        };

        if (actionContext.options.api_key !== 'test-key') throw new Error();
        actionContext.lastMouse = { x: i, y: i };
    }
    const end = performance.now();
    return end - start;
}

console.log('Starting benchmark...');
const baselineTime = runBaseline();
console.log(`Baseline time: ${baselineTime.toFixed(2)}ms`);

const optimizedTime = runOptimized();
console.log(`Optimized time: ${optimizedTime.toFixed(2)}ms`);

const improvement = ((baselineTime - optimizedTime) / baselineTime) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);

if (baselineTime > optimizedTime) {
    console.log('Optimization verified.');
} else {
    console.log('Optimization did not yield performance gain in this environment.');
}
