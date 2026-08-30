import assert from 'node:assert/strict';
import { Action } from '../src/types';
import {
    cloneActionsWithFreshIds,
    createActionSequence,
    buildActionScopeMap,
    expandActionIdsToBlocks,
    findMatchingEndIndex,
    getAllowedDropScopeIds,
    getIfFalseScopeId,
    getIfTrueScopeId,
    getLoopBodyScopeId,
    getActionBlockRange,
    moveActionBlock,
    moveActionBlockToScope,
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

const scoped = [
    action('root-before', 'click'),
    action('if', 'if'),
    action('true-a', 'click'),
    action('true-b', 'wait'),
    action('else', 'else'),
    action('false-a', 'screenshot'),
    action('if-end', 'end'),
    action('loop', 'while'),
    action('loop-a', 'click'),
    action('loop-b', 'wait'),
    action('loop-end', 'end'),
    action('root-after', 'navigate'),
];

const scopeMap = buildActionScopeMap(scoped);
assert.deepEqual(scopeMap.scopes.root.actionIds, ['root-before', 'if', 'loop', 'root-after']);
assert.deepEqual(scopeMap.scopes[getIfTrueScopeId('if')].actionIds, ['true-a', 'true-b']);
assert.deepEqual(scopeMap.scopes[getIfFalseScopeId('if')].actionIds, ['false-a']);
assert.deepEqual(scopeMap.scopes[getLoopBodyScopeId('loop')].actionIds, ['loop-a', 'loop-b']);

const movedDown = moveActionBlockToScope(scoped, 'true-a', getIfTrueScopeId('if'), null, () => 'unused');
assert.deepEqual(buildActionScopeMap(movedDown).scopes[getIfTrueScopeId('if')].actionIds, ['true-b', 'true-a']);

const swappedBranch = moveActionBlockToScope(scoped, 'true-a', getIfFalseScopeId('if'), null, () => 'unused');
assert.deepEqual(buildActionScopeMap(swappedBranch).scopes[getIfFalseScopeId('if')].actionIds, ['false-a', 'true-a']);

const movedToParent = moveActionBlockToScope(scoped, 'loop-a', 'root', 'root-after', () => 'unused');
assert.deepEqual(buildActionScopeMap(movedToParent).scopes.root.actionIds, ['root-before', 'if', 'loop', 'loop-a', 'root-after']);

const movedIntoLoop = moveActionBlockToScope(scoped, 'root-before', getLoopBodyScopeId('loop'), null, () => 'unused');
assert.deepEqual(buildActionScopeMap(movedIntoLoop).scopes[getLoopBodyScopeId('loop')].actionIds, ['loop-a', 'loop-b', 'root-before']);

const noElse = [
    action('if-empty-false', 'if'),
    action('true-only', 'click'),
    action('if-empty-false-end', 'end'),
    action('move-me', 'wait'),
];
const createdElse = moveActionBlockToScope(noElse, 'move-me', getIfFalseScopeId('if-empty-false'), null, () => 'created-else');
assert.deepEqual(createdElse.map(({ id }) => id), ['if-empty-false', 'true-only', 'created-else', 'move-me', 'if-empty-false-end']);

const loopAllowed = getAllowedDropScopeIds(scoped, 'loop-a');
assert(loopAllowed.has(getLoopBodyScopeId('loop')));
assert(loopAllowed.has('root'));
assert(!loopAllowed.has(getIfTrueScopeId('if')), 'Unrelated branches must remain unavailable');
assert.strictEqual(
    moveActionBlockToScope(scoped, 'loop', getLoopBodyScopeId('loop'), null, () => 'unused'),
    scoped,
    'A block cannot move into its own body',
);

console.log('Action block tests passed');
