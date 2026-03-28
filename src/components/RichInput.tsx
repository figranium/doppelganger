import { useRef, useEffect } from 'react';
import { Variable } from '../types';
import { highlightCode, SyntaxLanguage } from '../utils/syntaxHighlight';

interface RichInputProps {
    value: string;
    onChange: (val: string) => void;
    onBlur?: (val: string) => void;
    placeholder?: string;
    variables: Record<string, Variable>;
    className?: string;
    syntax?: SyntaxLanguage;
}

const RichInput: React.FC<RichInputProps> = ({ value, onChange, onBlur, placeholder, variables, className, syntax = 'plain' }) => {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (ref.current) {
            const currentHtml = ref.current.innerHTML;
            const targetHtml = highlightCode(value, syntax, variables);
            if (currentHtml !== targetHtml) {
                const selection = window.getSelection();
                let offset = 0;
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const preRange = range.cloneRange();
                    preRange.selectNodeContents(ref.current);
                    preRange.setEnd(range.endContainer, range.endOffset);
                    offset = preRange.toString().length;
                }

                ref.current.innerHTML = targetHtml;

                if (offset > 0) {
                    const walker = document.createTreeWalker(ref.current, NodeFilter.SHOW_TEXT);
                    let charCount = 0;
                    let node = walker.nextNode();
                    while (node) {
                        const length = node.textContent?.length || 0;
                        if (charCount + length >= offset) {
                            const range = document.createRange();
                            range.setStart(node, offset - charCount);
                            range.collapse(true);
                            selection?.removeAllRanges();
                            selection?.addRange(range);
                            break;
                        }
                        charCount += length;
                        node = walker.nextNode();
                    }
                }
            }
        }
    }, [value, variables]);

    return (
        <div
            ref={ref}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder || 'Text input'}
            className={`rich-input-content w-full bg-transparent focus:outline-none text-white min-h-[1.5rem] ${className}`}
            data-placeholder={placeholder}
            onInput={(e) => onChange(e.currentTarget.textContent || '')}
            onBlur={(e) => {
                const val = e.currentTarget.textContent || '';
                onChange(val);
                onBlur?.(val);
            }}
        />
    );
};

export default RichInput;
