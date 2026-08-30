import { useCallback, useRef, useState } from 'react';

type VariableInsertionTarget = HTMLInputElement | HTMLTextAreaElement | HTMLDivElement;

interface VariableInsertionSelection {
    target: VariableInsertionTarget;
    start?: number;
    end?: number;
    range?: Range;
}

const isVariableInsertionTarget = (target: EventTarget | null): target is VariableInsertionTarget => (
    target instanceof HTMLElement && target.dataset.variableInsertionTarget === 'true'
);

const useVariableInsertion = () => {
    const [canInsertVariable, setCanInsertVariable] = useState(false);
    const insertionSelectionRef = useRef<VariableInsertionSelection | null>(null);

    const captureInsertionSelection = useCallback((target: EventTarget | null) => {
        if (!isVariableInsertionTarget(target)) return;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            insertionSelectionRef.current = {
                target,
                start: target.selectionStart ?? target.value.length,
                end: target.selectionEnd ?? target.value.length,
            };
        } else {
            const selection = window.getSelection();
            const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
            insertionSelectionRef.current = {
                target,
                range: range && target.contains(range.commonAncestorContainer) ? range.cloneRange() : undefined,
            };
        }
        setCanInsertVariable(true);
    }, []);

    const insertVariable = useCallback((name: string) => {
        const saved = insertionSelectionRef.current;
        if (!saved) return;
        const token = `{$${name}}`;
        const { target } = saved;
        target.focus();

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            const start = saved.start ?? target.value.length;
            const end = saved.end ?? start;
            target.setRangeText(token, start, end, 'end');
            target.dispatchEvent(new Event('input', { bubbles: true }));
            const caret = start + token.length;
            target.setSelectionRange(caret, caret);
            insertionSelectionRef.current = { target, start: caret, end: caret };
            return;
        }

        const selection = window.getSelection();
        const range = saved.range || document.createRange();
        if (!saved.range) {
            range.selectNodeContents(target);
            range.collapse(false);
        }
        selection?.removeAllRanges();
        selection?.addRange(range);
        range.deleteContents();
        const node = document.createTextNode(token);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
        insertionSelectionRef.current = { target, range: range.cloneRange() };
        target.dispatchEvent(new Event('input', { bubbles: true }));
    }, []);

    return { canInsertVariable, captureInsertionSelection, insertVariable };
};

export default useVariableInsertion;
