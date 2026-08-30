import assert from 'node:assert/strict';
import { Action } from '../src/types';
import {
    cloneActionsWithFreshIds,
    createActionSequence,
    expandActionIdsToBlocks,
    findMatchingEndIndex,
    getActionBlockRange,
    moveActionBlock,
} from '../src/utils/actionBlocks';

const action = (id: string, type: Action['type']): Action => ({ id, type });

const nested = [
    action('before', 'click'),
    action('loop', 'repeat'),
    action('inside', 'click'),
    action('nested-if', 'if'),
    action('nested-body', 'wait'),
    action('nested-end', 'end'),
    action('loop-end', 'end'),
    action('after', 'screenshot'),
];

assert.equal(findMatchingEndIndex(nested, 1), 6);
assert.equal(findMatchingEndIndex(nested, 3), 5);
assert.equal(findMatchingEndIndex([action('legacy', 'foreach'), action('next', 'click')], 0), null);
assert.deepEqual(getActionBlockRange([action('legacy', 'foreach'), action('next', 'click')], 0), { start: 0, end: 0 });

assert.deepEqual(
    Array.from(expandActionIdsToBlocks(nested, ['loop'])),
    ['loop', 'inside', 'nested-if', 'nested-body', 'nested-end', 'loop-end'],
);

assert.deepEqual(
    moveActionBlock(nested, 'loop', 'before').map(({ id }) => id),
    ['loop', 'inside', 'nested-if', 'nested-body', 'nested-end', 'loop-end', 'before', 'after'],
);
assert.strictEqual(moveActionBlock(nested, 'loop', 'inside'), nested, 'A block cannot move into itself');

const clones = cloneActionsWithFreshIds(nested.slice(1, 7), (_item, index) => `clone-${index}`);
assert.deepEqual(clones.map(({ id }) => id), ['clone-0', 'clone-1', 'clone-2', 'clone-3', 'clone-4', 'clone-5']);
assert.deepEqual(clones.map(({ type }) => type), ['repeat', 'click', 'if', 'wait', 'end', 'end']);

for (const type of ['while', 'repeat', 'foreach'] as Action['type'][]) {
    assert.deepEqual(
        createActionSequence(action(`new-${type}`, type), `new-${type}-end`).map(({ type: itemType }) => itemType),
        [type, 'end'],
    );
}
assert.deepEqual(createActionSequence(action('new-click', 'click'), 'unused').map(({ type }) => type), ['click']);

console.log('Action block tests passed');
