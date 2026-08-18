export const TASK_FIELD_INSPECT_PREFIX = 'extraction_field_';
export const TASK_GROUP_CONTAINER_INSPECT_PREFIX = 'extraction_group_container_';
export const TASK_GROUP_FIELD_INSPECT_PREFIX = 'extraction_group_field_';

export const taskFieldInspectId = (fieldId: string) => `${TASK_FIELD_INSPECT_PREFIX}${fieldId}`;

export const taskGroupContainerInspectId = (groupId: string) => `${TASK_GROUP_CONTAINER_INSPECT_PREFIX}${groupId}`;

export const taskGroupFieldInspectId = (groupId: string, fieldId: string) =>
    `${TASK_GROUP_FIELD_INSPECT_PREFIX}${groupId}__${fieldId}`;

export const parseGroupFieldInspectId = (id: string): { groupId: string; fieldId: string } | null => {
    if (!id.startsWith(TASK_GROUP_FIELD_INSPECT_PREFIX)) return null;
    const rest = id.slice(TASK_GROUP_FIELD_INSPECT_PREFIX.length);
    const sepIndex = rest.indexOf('__');
    if (sepIndex === -1) return null;
    return { groupId: rest.slice(0, sepIndex), fieldId: rest.slice(sepIndex + 2) };
};
