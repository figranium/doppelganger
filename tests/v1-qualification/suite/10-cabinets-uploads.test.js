const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cabinets = require('../../../src/server/cabinets');
const { CABINETS_DIR } = require('../../../src/server/constants');
const { initDB } = require('../../../src/server/db');
const { executeAction } = require('../../../src/agent/figranite/action-handler');

const unique = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const makeDownload = (contents) => ({
    saveAs: async (destination) => {
        await fs.promises.mkdir(path.dirname(destination), { recursive: true });
        await fs.promises.writeFile(destination, contents);
    }
});

const cleanupCabinet = async (cabinetId) => {
    if (!cabinetId) return;
    const state = await cabinets.listCabinets();
    if (!state.cabinets.some(c => c.id === cabinetId)) return;
    const replacement = state.cabinets.find(c => c.id !== cabinetId);
    if (replacement) await cabinets.deleteCabinet(cabinetId, replacement.id, false);
};

const actionContext = (page, successfulUploads = new Map()) => ({
    page,
    logs: [],
    runtimeVars: {},
    resolveTemplate: value => value,
    captureScreenshot: async () => '',
    baseDelay: value => value,
    options: {
        deadClicks: false,
        humanTyping: false,
        allowTypos: false,
        naturalTyping: false,
        fatigue: false,
        idleMovements: false,
        overscroll: false,
        cursorGlide: false,
        randomizeClicks: false
    },
    baseUrl: 'http://127.0.0.1:11345',
    lastBlockOutput: null,
    setStopOutcome: () => {},
    setStopRequested: () => {},
    pendingDownloads: [],
    successfulUploads
});

const tests = [
    {
        id: 'CAB-001',
        name: 'Cabinet Bootstrap and Lifecycle Invariants',
        subsystem: 'cabinets',
        setup: 'Cabinet storage initialized',
        steps: 'Verify a default Cabinet exists, create and rename a temporary Cabinet, reject duplicate names, then delete it.',
        expected: 'At least one Cabinet always exists; create/rename/delete behavior is durable and duplicate names are rejected.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            await cabinets.ensure();
            const initial = await cabinets.listCabinets();
            assert.ok(initial.cabinets.length >= 1, 'At least one cabinet must exist');
            assert.ok(initial.cabinets.some(c => c.id === initial.defaultCabinetId), 'Default cabinet must exist');

            let created;
            try {
                created = await cabinets.createCabinet(unique('Qualification Cabinet'));
                const renamed = await cabinets.renameCabinet(created.id, unique('Renamed Qualification Cabinet'));
                assert.strictEqual(renamed.id, created.id);
                await assert.rejects(() => cabinets.createCabinet(renamed.name), /already has that name/i);
            } finally {
                await cleanupCabinet(created?.id);
            }
        }
    },
    {
        id: 'CAB-002',
        name: 'Download Capture, Metadata, and Filename Collision Isolation',
        subsystem: 'cabinets',
        setup: 'Temporary Cabinet and mocked intercepted downloads',
        steps: 'Save two downloads with the same filename and source metadata, then inspect Cabinet items and stored bytes.',
        expected: 'Both downloads survive independently, names do not collide, metadata is retained, and physical files exist.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Download Qualification'));
                const first = await cabinets.saveDownload(cabinet.id, makeDownload('first'), 'report.csv', { sourceTaskId: 'task_a', sourceRunId: 'run_a' });
                const second = await cabinets.saveDownload(cabinet.id, makeDownload('second'), 'report.csv', { sourceTaskId: 'task_b', sourceRunId: 'run_b' });
                const items = await cabinets.listItems(cabinet.id);
                assert.strictEqual(items.length, 2);
                assert.notStrictEqual(first.item.name.toLowerCase(), second.item.name.toLowerCase(), 'Colliding filenames must be made unique');
                assert.deepStrictEqual(new Set(items.map(i => i.sourceTaskId)), new Set(['task_a', 'task_b']));
                assert.deepStrictEqual(new Set(items.map(i => i.sourceRunId)), new Set(['run_a', 'run_b']));
                for (const item of items) {
                    assert.strictEqual(item.kind, 'file');
                    assert.strictEqual(item.status, 'unuploaded');
                    assert.ok(item.size > 0);
                    const resolved = await cabinets.getItem(cabinet.id, item.id);
                    assert.ok(fs.existsSync(resolved.path), `Stored Cabinet item must exist: ${item.id}`);
                }
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    },
    {
        id: 'CAB-003',
        name: 'Newest Unuploaded Queue Ordering and Status Transitions',
        subsystem: 'cabinets',
        setup: 'Temporary Cabinet containing multiple queued files',
        steps: 'Create two items, verify newest selection, mark it uploaded, verify the older item becomes next, then reset status.',
        expected: 'Upload consumption uses newest-unuploaded ordering and uploaded items are skipped until reset.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Queue Qualification'));
                const older = await cabinets.saveDownload(cabinet.id, makeDownload('older'), 'older.txt');
                await new Promise(resolve => setTimeout(resolve, 3));
                const newer = await cabinets.saveDownload(cabinet.id, makeDownload('newer'), 'newer.txt');
                assert.strictEqual((await cabinets.latestUnuploaded(cabinet.id)).item.id, newer.item.id);
                await cabinets.setStatus(cabinet.id, [newer.item.id], 'uploaded');
                assert.strictEqual((await cabinets.latestUnuploaded(cabinet.id)).item.id, older.item.id);
                await cabinets.setStatus(cabinet.id, [newer.item.id], 'unuploaded');
                assert.strictEqual((await cabinets.latestUnuploaded(cabinet.id)).item.id, newer.item.id);
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    },
    {
        id: 'CAB-004',
        name: 'Upload Action Defers Finalization Until Explicit Success Boundary',
        subsystem: 'blocks',
        setup: 'Temporary Cabinet, mocked file input, and real Upload/Finalize Uploads action handler',
        steps: 'Upload the newest item with markAsUploaded disabled, verify it remains queued, then execute Finalize Uploads and verify uploaded status.',
        expected: 'Selecting a file for upload does not finalize it prematurely; Finalize Uploads marks only successful uploads as uploaded.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Upload Qualification'));
                const saved = await cabinets.saveDownload(cabinet.id, makeDownload('payload'), 'payload.txt');
                let selectedPath = null;
                let evaluateCalls = 0;
                const page = {
                    evaluate: async () => {
                        evaluateCalls += 1;
                        return evaluateCalls === 1 ? { hasInput: true, directory: false } : undefined;
                    },
                    $: async () => ({ setInputFiles: async p => { selectedPath = p; } })
                };
                const successfulUploads = new Map();
                const context = actionContext(page, successfulUploads);

                const result = await executeAction({ type: 'upload', cabinetId: cabinet.id, selector: '#file', markAsUploaded: false }, context);
                assert.strictEqual(result.itemId, saved.item.id);
                assert.ok(selectedPath && fs.existsSync(selectedPath), 'Upload action must select the Cabinet item path');
                assert.strictEqual((await cabinets.listItems(cabinet.id)).find(i => i.id === saved.item.id).status, 'unuploaded');

                const finalized = await executeAction({ type: 'finalize_uploads' }, context);
                assert.strictEqual(finalized.finalized, 1);
                assert.strictEqual((await cabinets.listItems(cabinet.id)).find(i => i.id === saved.item.id).status, 'uploaded');
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    },
    {
        id: 'CAB-005',
        name: 'Failed Upload Does Not Consume Cabinet Item',
        subsystem: 'blocks',
        setup: 'Temporary Cabinet and mocked page with a missing upload target',
        steps: 'Attempt Upload against a selector that cannot be resolved, require failure, then inspect the Cabinet queue.',
        expected: 'A failed Upload leaves the item unuploaded and available for retry.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Failed Upload Qualification'));
                const saved = await cabinets.saveDownload(cabinet.id, makeDownload('retry-me'), 'retry.txt');
                const page = { evaluate: async () => null };
                await assert.rejects(
                    () => executeAction({ type: 'upload', cabinetId: cabinet.id, selector: '#missing', markAsUploaded: false }, actionContext(page)),
                    /Upload target not found/i
                );
                const item = (await cabinets.listItems(cabinet.id)).find(i => i.id === saved.item.id);
                assert.strictEqual(item.status, 'unuploaded');
                assert.strictEqual((await cabinets.latestUnuploaded(cabinet.id)).item.id, saved.item.id);
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    },
    {
        id: 'CAB-006',
        name: 'ZIP and Folder Round Trip Preserves Content',
        subsystem: 'cabinets',
        setup: 'Temporary Cabinet with two files',
        steps: 'ZIP two Cabinet items, verify originals are replaced by an archive, unzip it, and verify extracted files and bytes.',
        expected: 'Cabinet ZIP/unzip operations preserve file names and contents and produce an uploadable folder item.',
        severity: 'HIGH',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Archive Qualification'));
                const a = await cabinets.saveDownload(cabinet.id, makeDownload('alpha'), 'alpha.txt');
                const b = await cabinets.saveDownload(cabinet.id, makeDownload('beta'), 'beta.txt');
                const archive = await cabinets.zipItems(cabinet.id, [a.item.id, b.item.id], 'bundle.zip');
                assert.ok(archive.name.endsWith('.zip'));
                assert.strictEqual((await cabinets.listItems(cabinet.id)).length, 1);

                const folder = await cabinets.unzipItem(cabinet.id, archive.id);
                assert.strictEqual(folder.kind, 'folder');
                const resolved = await cabinets.getItem(cabinet.id, folder.id);
                const alpha = await fs.promises.readFile(path.join(resolved.path, 'alpha.txt'), 'utf8');
                const beta = await fs.promises.readFile(path.join(resolved.path, 'beta.txt'), 'utf8');
                assert.strictEqual(alpha, 'alpha');
                assert.strictEqual(beta, 'beta');
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    },
    {
        id: 'CAB-007',
        name: 'Concurrent Cabinet Mutations Remain Serialized and Lossless',
        subsystem: 'cabinets',
        setup: 'Temporary Cabinet and concurrent mocked downloads',
        steps: 'Save several same-named downloads concurrently and inspect the resulting catalog and physical items.',
        expected: 'Serialized mutations prevent metadata corruption, lost items, and filename collisions under concurrency.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Concurrency Qualification'));
                const writes = Array.from({ length: 6 }, (_, i) => cabinets.saveDownload(cabinet.id, makeDownload(`payload-${i}`), 'same.txt', { sourceRunId: `run_${i}` }));
                await Promise.all(writes);
                const items = await cabinets.listItems(cabinet.id);
                assert.strictEqual(items.length, 6);
                assert.strictEqual(new Set(items.map(i => i.name.toLowerCase())).size, 6, 'Every concurrent item needs a unique display name');
                assert.strictEqual(new Set(items.map(i => i.sourceRunId)).size, 6, 'No concurrent metadata write may be lost');
                for (const item of items) assert.ok(fs.existsSync((await cabinets.getItem(cabinet.id, item.id)).path));
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    },
    {
        id: 'CAB-008',
        name: 'Cabinet Catalog Persists Durable State in Active Storage Backend',
        subsystem: 'persistence',
        setup: 'Temporary Cabinet with one queued item',
        steps: 'Create a Cabinet and item, then independently read the active persistence backend (Postgres or catalog.json) and compare persisted identifiers and metadata.',
        expected: 'Cabinet metadata is durably represented in Postgres when configured, otherwise in catalog.json, rather than existing only in process memory.',
        severity: 'CRITICAL',
        blocksV1: true,
        run: async () => {
            let cabinet;
            try {
                cabinet = await cabinets.createCabinet(unique('Persistence Qualification'));
                const saved = await cabinets.saveDownload(cabinet.id, makeDownload('durable'), 'durable.txt', { sourceTaskId: 'qualification_task' });
                const pool = await initDB();
                let raw;
                if (pool) {
                    const result = await pool.query('SELECT data FROM cabinet_catalog WHERE id = 1');
                    raw = result.rows[0]?.data;
                    assert.ok(raw, 'Created Cabinet catalog must be persisted in Postgres');
                } else {
                    raw = JSON.parse(await fs.promises.readFile(path.join(CABINETS_DIR, 'catalog.json'), 'utf8'));
                }
                const persistedCabinet = raw.cabinets.find(c => c.id === cabinet.id);
                assert.ok(persistedCabinet, 'Created Cabinet must be persisted in the active storage backend');
                const persistedItem = persistedCabinet.items.find(i => i.id === saved.item.id);
                assert.ok(persistedItem, 'Created Cabinet item must be persisted in the active storage backend');
                assert.strictEqual(persistedItem.name, saved.item.name);
                assert.strictEqual(persistedItem.status, 'unuploaded');
                assert.strictEqual(persistedItem.sourceTaskId, 'qualification_task');
            } finally {
                await cleanupCabinet(cabinet?.id);
            }
        }
    }
];

module.exports = { tests };
