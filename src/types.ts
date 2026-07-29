export type TaskMode = 'scrape' | 'agent' | 'headful';

export interface Credential {
    id: string;
    name: string;
    provider: 'baserow';
    config: {
        baseUrl: string;
        token: string;
    };
}

export interface TaskOutput {
    provider: 'baserow';
    credentialId: string;
    databaseId?: string;
    tableId: string;
    onError: 'fail' | 'ignore';
}
export type ViewMode = 'visual' | 'json' | 'api' | 'history';
export type VarType = 'string' | 'number' | 'boolean';

export interface Variable {
    type: VarType;
    value: any;
    autoCreated?: boolean;
    /**
     * Marks the variable as sensitive (passwords, tokens, card numbers).
     * The real value is still used during execution, but every occurrence of it
     * is replaced with [REDACTED] in logs, results, API responses, webhooks and
     * execution history, and it is masked on screen before being typed so it
     * never reaches screenshots or recordings.
     */
    secret?: boolean;
}

export interface StealthConfig {
    allowTypos: boolean;
    idleMovements: boolean;
    overscroll: boolean;
    deadClicks: boolean;
    fatigue: boolean;
    naturalTyping: boolean;
    cursorGlide: boolean;
    randomizeClicks: boolean;
}

export interface Action {
    id: string;
    type:
    | 'click'
    | 'type'
    | 'wait'
    | 'wait_selector'
    | 'press'
    | 'scroll'
    | 'javascript'
    | 'csv'
    | 'hover'
    | 'merge'
    | 'screenshot'
    | 'if'
    | 'else'
    | 'end'
    | 'while'
    | 'repeat'
    | 'foreach'
    | 'stop'
    | 'set'
    | 'on_error'
    | 'navigate'
    | 'wait_downloads'
    | 'start'
    | 'http_request'
    | 'get_content';
    selector?: string;
    value?: string;
    key?: string;
    disabled?: boolean;
    varName?: string;
    conditionVar?: string;
    conditionVarType?: VarType;
    conditionOp?: string;
    conditionValue?: string;
    typeMode?: 'append' | 'replace';
    /** `set` only — flag the captured value as sensitive for the rest of the run. */
    secret?: boolean;
    method?: string;
    headers?: string;
    body?: string;
}

export interface TaskSchedule {
    enabled: boolean;
    frequency?: 'interval' | 'hourly' | 'daily' | 'weekly' | 'monthly';
    intervalMinutes?: number;
    hour?: number;
    minute?: number;
    daysOfWeek?: number[];
    dayOfMonth?: number;
    cron?: string;
    lastRun?: number;
    lastRunStatus?: 'success' | 'error';
    lastRunDurationMs?: number;
    nextRun?: number;
}

export type StickyNoteColor = 'default' | 'yellow' | 'pink' | 'green' | 'purple';

export interface StickyNote {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    content: string;
    color: StickyNoteColor;
}

export interface Task {
    id?: string;
    name: string;
    description?: string;
    url: string;
    mode: TaskMode;
    wait: number;
    selector?: string;
    rotateUserAgents: boolean;
    rotateProxies: boolean;
    rotateViewport: boolean;
    humanTyping: boolean;
    stealth: StealthConfig;
    actions: Action[];
    stickyNotes?: StickyNote[];
    variables: Record<string, Variable>;
    last_opened?: number;
    extractionScript?: string;
    extractionFormat?: 'json' | 'csv';
    includeHtml?: boolean;
    output?: TaskOutput;
    includeShadowDom?: boolean;
    /** Mask secret values on screen before typing (default true). */
    redactCaptures?: boolean;
    disableRecording?: boolean;
    statelessExecution?: boolean;
    versions?: TaskVersion[];
    schedule?: TaskSchedule;
}

export interface TaskVersion {
    id: string;
    timestamp: number;
    snapshot: Task;
}

export interface Results {
    url: string;
    finalUrl?: string;
    html?: string;
    data?: any;
    screenshotUrl?: string;
    downloads?: { name: string; url: string; path: string }[];
    logs: string[];
    timestamp: string;
}

export interface Execution {
    id: string;
    timestamp: number;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    source: string;
    mode: string;
    taskId?: string | null;
    taskName?: string | null;
    url?: string | null;
    taskSnapshot?: Task | null;
    result?: any;
}

export interface CaptureEntry {
    name: string;
    url: string;
    size: number;
    modified: number;
    type: 'screenshot' | 'recording';
}

export interface User {
    id: number;
    name: string;
    email: string;
}

export interface ConfirmRequest {
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    title?: string;
}
