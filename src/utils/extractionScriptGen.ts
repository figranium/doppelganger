import { ExtractionField, ExtractionGroup } from '../types';

const accessorFor = (field: ExtractionField): string => {
    switch (field.attribute) {
        case 'html':
            return 'el.innerHTML';
        case 'value':
            return '(el.value !== undefined ? el.value : el.textContent.trim())';
        case 'attr':
            return `el.getAttribute(${JSON.stringify(field.attrName || '')})`;
        case 'image':
            return `(() => {
        const src = el.currentSrc || el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
        if (src) return new URL(src, location.href).href;
        const srcset = el.getAttribute('srcset');
        if (srcset) {
          const candidates = srcset.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
          if (candidates.length) return new URL(candidates[candidates.length - 1], location.href).href;
        }
        const bg = getComputedStyle(el).backgroundImage;
        const match = bg && bg.match(/url\\((['"]?)(.*?)\\1\\)/);
        if (match && match[2]) return new URL(match[2], location.href).href;
        return null;
      })()`;
        case 'link':
            return `(() => {
        const href = el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('data-href');
        return href ? new URL(href, location.href).href : null;
      })()`;
        case 'text':
        default:
            return 'el.textContent.trim()';
    }
};

export const generateExtractionScript = (fields: ExtractionField[], groups: ExtractionGroup[] = []): string => {
    const validFields = (fields || []).filter(f => f.name.trim() && f.selector.trim());
    const validGroups = (groups || []).filter(g => g.name.trim() && g.containerSelector.trim() && (g.fields || []).some(f => f.name.trim() && f.selector.trim()));

    if (validFields.length === 0 && validGroups.length === 0) {
        return '// Add fields in Visual mode, or write a script here.\n// Example: return { title: document.title };';
    }

    const fieldLines = validFields.map(field => {
        const key = JSON.stringify(field.name);
        const selector = JSON.stringify(field.selector);

        if (field.attribute === 'exists') {
            return `  ${key}: document.querySelector(${selector}) !== null,`;
        }

        const accessor = accessorFor(field);
        if (field.multiple) {
            return `  ${key}: Array.from(document.querySelectorAll(${selector})).map(el => ${accessor}),`;
        }
        return `  ${key}: (() => { const el = document.querySelector(${selector}); return el ? ${accessor} : null; })(),`;
    });

    const groupLines = validGroups.map(group => {
        const key = JSON.stringify(group.name);
        const containerSelector = JSON.stringify(group.containerSelector);
        const validSubFields = (group.fields || []).filter(f => f.name.trim() && f.selector.trim());

        const subLines = validSubFields.map(field => {
            const fkey = JSON.stringify(field.name);
            const fSelector = JSON.stringify(field.selector);

            if (field.attribute === 'exists') {
                return `      ${fkey}: container.querySelector(${fSelector}) !== null,`;
            }

            const accessor = accessorFor(field);
            return `      ${fkey}: (() => { const el = container.querySelector(${fSelector}); return el ? ${accessor} : null; })(),`;
        });

        return `  ${key}: Array.from(document.querySelectorAll(${containerSelector})).map(container => ({\n${subLines.join('\n')}\n  })),`;
    });

    return `return {\n${[...fieldLines, ...groupLines].join('\n')}\n};`;
};
