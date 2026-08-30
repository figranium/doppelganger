const assert = require('assert');
const { cloneTaskForVersion, appendTaskVersion, removeTaskVersion } = require('../src/server/utils');
const { MAX_TASK_VERSIONS } = require('../src/server/constants');

// 1. Test cloneTaskForVersion
console.log('Testing cloneTaskForVersion...');
const task = { id: '1', name: 'test', versions: [{ id: 'v1' }] };
const clone = cloneTaskForVersion(task);

assert.notStrictEqual(clone, task, 'Clone should be a different object');
assert.strictEqual(clone.id, task.id);
assert.strictEqual(clone.name, task.name);
assert.strictEqual(clone.versions, undefined, 'Clone should not contain versions property');

// Verify deep copy
task.name = 'changed';
assert.strictEqual(clone.name, 'test', 'Clone should be a deep copy');

// Test with null
assert.deepStrictEqual(cloneTaskForVersion(null), {}, 'Should return empty object for null');
console.log('✓ cloneTaskForVersion tests passed');

// 2. Test appendTaskVersion
console.log('Testing appendTaskVersion...');

// Case: null task
const nullTask = null;
assert.doesNotThrow(() => appendTaskVersion(nullTask), 'Should handle null task');

// Case: initialize versions array
const taskNoVersions = { id: 'task1', name: 'Task 1' };
appendTaskVersion(taskNoVersions);
assert.ok(Array.isArray(taskNoVersions.versions), 'Should initialize versions array');
assert.strictEqual(taskNoVersions.versions.length, 1);
assert.ok(taskNoVersions.versions[0].id.startsWith('ver_'), 'Version ID should start with ver_');
assert.ok(taskNoVersions.versions[0].timestamp <= Date.now());
assert.deepStrictEqual(taskNoVersions.versions[0].snapshot, { id: 'task1', name: 'Task 1' });

// Case: unshift new versions
const taskWithVersions = {
    id: 'task2',
    name: 'Task 2',
    versions: [
        { id: 'ver_old', timestamp: 123, snapshot: {} }
    ]
};
appendTaskVersion(taskWithVersions);
assert.strictEqual(taskWithVersions.versions.length, 2);
assert.ok(taskWithVersions.versions[0].id.startsWith('ver_'), 'New version should be at index 0');
assert.strictEqual(taskWithVersions.versions[1].id, 'ver_old', 'Old version should be at index 1');

// Case: cap at MAX_TASK_VERSIONS
const taskManyVersions = {
    id: 'task3',
    versions: []
};
for (let i = 0; i < MAX_TASK_VERSIONS + 5; i++) {
    appendTaskVersion(taskManyVersions);
}
assert.strictEqual(taskManyVersions.versions.length, MAX_TASK_VERSIONS, `Should cap at ${MAX_TASK_VERSIONS}`);

console.log('✓ appendTaskVersion tests passed');

console.log('Testing removeTaskVersion...');
const taskWithRemovableVersion = {
    id: 'task4',
    versions: [
        { id: 'ver_keep', timestamp: 1, snapshot: {} },
        { id: 'ver_delete', timestamp: 2, snapshot: {} },
    ],
};
assert.strictEqual(removeTaskVersion(taskWithRemovableVersion, 'ver_delete'), true);
assert.deepStrictEqual(taskWithRemovableVersion.versions.map((version) => version.id), ['ver_keep']);
assert.strictEqual(removeTaskVersion(taskWithRemovableVersion, 'ver_missing'), false);
assert.strictEqual(removeTaskVersion(null, 'ver_keep'), false);
console.log('✓ removeTaskVersion tests passed');

console.log('All server-utils tests passed successfully!');
