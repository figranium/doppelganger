export interface ReservedVariableDefinition {
    name: string;
    label: string;
    description: string;
    icon: string;
    hasValue?: boolean;
}

export const BLOCK_OUTPUT_VARIABLE: ReservedVariableDefinition = {
    name: 'block.output',
    label: 'Block output',
    description: 'Output from the previous block',
    icon: 'output',
};

export const MORE_RESERVED_VARIABLES: ReservedVariableDefinition[] = [
    { name: 'now', label: 'Current time', description: 'Current ISO-8601 timestamp', icon: 'schedule', hasValue: true },
    { name: 'loop.index', label: 'Loop index', description: 'Zero-based index in a foreach loop', icon: 'format_list_numbered' },
    { name: 'loop.count', label: 'Loop count', description: 'Number of items in the current foreach loop', icon: 'tag' },
    { name: 'loop.item', label: 'Loop item', description: 'Current foreach item', icon: 'data_object' },
    { name: 'loop.text', label: 'Loop text', description: 'Text of the current foreach item', icon: 'text_fields' },
    { name: 'loop.html', label: 'Loop HTML', description: 'HTML of the current foreach item', icon: 'code' },
];

const RESERVED_VARIABLES = [BLOCK_OUTPUT_VARIABLE, ...MORE_RESERVED_VARIABLES];

export const getReservedVariable = (name: string) => RESERVED_VARIABLES.find((variable) => variable.name === name);

