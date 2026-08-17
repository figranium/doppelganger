import { ExtractionField } from '../types';

const accessorFor = (field: ExtractionField): string => {
    switch (field.attribute) {
        case 'html':
            return 'el.innerHTML';
        case 'value':
            return '(el.value !== undefined ? el.value : el.textContent.trim())';
        case 'attr':
            return `el.getAttribute(${JSON.stringify(field.attrName || '')})`;
        case 'text':
        default:
            return 'el.textContent.trim()';
    }
};

export const generateExtractionScript = (fields: ExtractionField[]): string => {
    const validFields = (fields || []).filter(f => f.name.trim() && f.selector.trim());
    if (validFields.length === 0) {
        return '// Add fields in Visual mode, or write a script here.\n// Example: return { title: document.title };';
    }

    const lines = validFields.map(field => {
        const key = JSON.stringify(field.name);
        const selector = JSON.stringify(field.selector);
        const accessor = accessorFor(field);

        if (field.multiple) {
            return `  ${key}: Array.from(document.querySelectorAll(${selector})).map(el => ${accessor}),`;
        }
        return `  ${key}: (() => { const el = document.querySelector(${selector}); return el ? ${accessor} : null; })(),`;
    });

    return `return {\n${lines.join('\n')}\n};`;
};
