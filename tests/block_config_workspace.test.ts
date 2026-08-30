import assert from 'node:assert/strict';
import { Action, Variable } from '../src/types';
import {
    getActionInputEntries,
    getExpectedOutput,
} from '../src/components/editor/BlockConfigWorkspace';

const variables: Record<string, Variable> = {
    query: { type: 'string', value: 'Figranium' },
};
const action: Action = {
    id: 'type-query',
    type: 'type',
    selector: '#search',
    value: '{$query}',
    typeMode: 'replace',
};

assert.deepEqual(getActionInputEntries(action, variables), [
    { key: 'selector', label: 'Selector', raw: '#search', resolved: '#search' },
    { key: 'value', label: 'Value', raw: '{$query}', resolved: 'Figranium' },
    { key: 'typeMode', label: 'Typing mode', raw: 'replace', resolved: 'replace' },
]);
assert.equal(getExpectedOutput(action), 'This block has no direct output value.');
assert.equal(getExpectedOutput({ id: 'script', type: 'javascript' }), 'The value returned by the script.');

console.log('Block config workspace helpers passed');
