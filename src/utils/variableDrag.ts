const VARIABLE_MIME = 'application/x-figranium-variable';

export const isVariableDrag = (dataTransfer: DataTransfer) => (
    Array.from(dataTransfer.types).includes(VARIABLE_MIME)
);

export const getVariableDragToken = (dataTransfer: DataTransfer) => (
    dataTransfer.getData(VARIABLE_MIME) || dataTransfer.getData('text/plain')
);

export const moveEditableCaretToPoint = (element: HTMLElement, clientX: number, clientY: number) => {
    const caretDocument = document as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    let range: Range | null = null;
    const position = caretDocument.caretPositionFromPoint?.(clientX, clientY);
    if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
    } else {
        range = caretDocument.caretRangeFromPoint?.(clientX, clientY) || null;
    }
    if (!range || !element.contains(range.startContainer)) {
        range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    return range;
};

const textWidth = (context: CanvasRenderingContext2D, value: string) => context.measureText(value).width;

const nearestColumn = (context: CanvasRenderingContext2D, line: string, targetWidth: number) => {
    let low = 0;
    let high = line.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (textWidth(context, line.slice(0, middle)) <= targetWidth) low = middle;
        else high = middle - 1;
    }
    if (low >= line.length) return line.length;
    const before = textWidth(context, line.slice(0, low));
    const after = textWidth(context, line.slice(0, low + 1));
    return targetWidth - before < after - targetWidth ? low : low + 1;
};

export const moveTextControlCaretToPoint = (
    control: HTMLInputElement | HTMLTextAreaElement,
    clientX: number,
    clientY: number,
) => {
    const style = window.getComputedStyle(control);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return control.selectionStart ?? control.value.length;
    context.font = style.font;

    const rect = control.getBoundingClientRect();
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingTop = Number.parseFloat(style.paddingTop) || 0;
    const x = Math.max(0, clientX - rect.left - paddingLeft + control.scrollLeft);
    const lines = control.value.split('\n');
    let row = 0;
    if (control instanceof HTMLTextAreaElement) {
        const fontSize = Number.parseFloat(style.fontSize) || 16;
        const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.5;
        row = Math.max(0, Math.min(lines.length - 1, Math.floor((clientY - rect.top - paddingTop + control.scrollTop) / lineHeight)));
    }
    const column = nearestColumn(context, lines[row] || '', x);
    const lineStart = lines.slice(0, row).reduce((total, line) => total + line.length + 1, 0);
    const index = lineStart + column;
    control.focus({ preventScroll: true });
    control.setSelectionRange(index, index);
    return index;
};
