import { Task } from '../types';

export const serializeTaskSnapshot = (task?: Task | null) => {
    if (!task) return '';
    const clone = JSON.parse(JSON.stringify(task));
    delete clone.last_opened;
    return JSON.stringify(clone);
};

export const parseBooleanFlag = (value: any) => {
    if (typeof value === 'boolean') return value;
    if (value === undefined || value === null) return false;
    const normalized = String(value).toLowerCase();
    return normalized === 'true' || normalized === '1';
};

export const formatLabel = (value: string) => value ? value[0].toUpperCase() + value.slice(1) : value;

export const ensureActionIds = (task: Task) => {
    if (!task.actions || !Array.isArray(task.actions)) return task;
    let changed = false;
    const nextActions = task.actions.map((action, index) => {
        if (action.id) return action;
        changed = true;
        return { ...action, id: `act_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}` };
    });
    return changed ? { ...task, actions: nextActions } : task;
};

export const makeDefaultTask = (): Task => ({
    name: "Imported Task",
    url: "",
    mode: "scrape",
    wait: 3,
    selector: "",
    rotateUserAgents: false,
    rotateProxies: false,
    rotateViewport: false,
    humanTyping: false,
    stealth: {
        allowTypos: false,
        idleMovements: false,
        overscroll: false,
        deadClicks: false,
        fatigue: false,
        naturalTyping: false,
        cursorGlide: false,
        randomizeClicks: false
    },
    actions: [],
    variables: {},
    includeShadowDom: true,
    disableRecording: false,
    statelessExecution: false
} as Task);

export const normalizeImportedTask = (raw: any, index: number): Task | null => {
    if (!raw || typeof raw !== 'object') return null;
    const base = makeDefaultTask();
    const merged: Task = { ...base, ...raw };
    if (!merged.name || typeof merged.name !== 'string') {
        merged.name = `Imported Task ${index + 1}`;
    }
    if (!merged.mode || !['scrape', 'agent', 'headful'].includes(merged.mode)) {
        merged.mode = 'scrape';
    }
    if (typeof merged.wait !== 'number') merged.wait = 3;
    if (!merged.stealth) merged.stealth = base.stealth;
    if (!merged.variables || Array.isArray(merged.variables)) merged.variables = {};
    if (!Array.isArray(merged.actions)) merged.actions = [];
    if (merged.rotateProxies === undefined) merged.rotateProxies = false;
    if (merged.disableRecording === undefined) merged.disableRecording = false;
    merged.disableRecording = parseBooleanFlag(merged.disableRecording);
    if (merged.statelessExecution === undefined) merged.statelessExecution = false;
    merged.statelessExecution = parseBooleanFlag(merged.statelessExecution);
    delete merged.versions;
    delete merged.last_opened;
    return merged;
};

export const buildNewTask = (): Task => {
    return {
        name: "Task " + Math.floor(Math.random() * 100),
        url: "",
        mode: "agent",
        wait: 3,
        selector: "",
        rotateUserAgents: false,
        rotateProxies: false,
        rotateViewport: false,
        humanTyping: false,
        stealth: {
            allowTypos: false,
            idleMovements: false,
            overscroll: false,
            deadClicks: false,
            fatigue: false,
            naturalTyping: false,
            cursorGlide: false,
            randomizeClicks: false
        },
        actions: [],
        variables: {},
        extractionFormat: 'json',
        includeHtml: false,
        includeShadowDom: true,
        disableRecording: false,
        statelessExecution: false
    };
};
