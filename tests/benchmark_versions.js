const task = {
    id: 'test_task',
    name: 'Large Task',
    actions: Array(50).fill({ type: 'click', selector: '.btn' }),
    variables: { foo: { type: 'string', value: 'bar' } },
    versions: []
};

// Fill with 30 versions
for (let i = 0; i < 30; i++) {
    task.versions.push({
        id: 'ver_' + i,
        timestamp: Date.now(),
        snapshot: { ...task, versions: undefined }
    });
}

console.log('Task size (approx):', JSON.stringify(task).length, 'bytes');

function oldClone(task) {
    const copy = JSON.parse(JSON.stringify(task || {}));
    if (copy.versions) delete copy.versions;
    return copy;
}

function newClone(task) {
    if (!task) return {};
    const { versions, ...rest } = task;
    return JSON.parse(JSON.stringify(rest));
}

const iterations = 1000;

console.time('Old Clone');
for (let i = 0; i < iterations; i++) {
    oldClone(task);
}
console.timeEnd('Old Clone');

console.time('New Clone');
for (let i = 0; i < iterations; i++) {
    newClone(task);
}
console.timeEnd('New Clone');
