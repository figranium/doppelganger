import { useEffect, useMemo, useRef } from 'react';
import { highlightCode, SyntaxLanguage } from '../utils/syntaxHighlight';
import { getVariableDragToken, isVariableDrag, moveTextControlCaretToPoint } from '../utils/variableDrag';

interface CodeEditorProps {
    value: string;
    onChange?: (val: string) => void;
    onBlur?: (val: string) => void;
    language: SyntaxLanguage;
    placeholder?: string;
    className?: string;
    readOnly?: boolean;
    variables?: Record<string, any>;
    allowVariableInsertion?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, onBlur, language, placeholder, className, readOnly, variables, allowVariableInsertion = true }) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const preRef = useRef<HTMLPreElement>(null);

    const displayValue = value || placeholder || '';
    const isPlaceholder = !value && !!placeholder;
    const highlighted = useMemo(() => highlightCode(displayValue, language, variables), [displayValue, language, variables]);

    useEffect(() => {
        const textarea = textareaRef.current;
        const pre = preRef.current;
        if (!textarea || !pre) return;
        const syncScroll = () => {
            pre.scrollTop = textarea.scrollTop;
            pre.scrollLeft = textarea.scrollLeft;
        };
        textarea.addEventListener('scroll', syncScroll);
        return () => {
            textarea.removeEventListener('scroll', syncScroll);
        };
    }, []);

    return (
        <div
            className={`code-editor ${className || ''}`}
            onWheel={(event) => {
                const textarea = textareaRef.current;
                if (!textarea) return;
                if (textarea.scrollHeight <= textarea.clientHeight) return;
                textarea.scrollTop += event.deltaY;
                textarea.scrollLeft += event.deltaX;
                textarea.focus();
                event.preventDefault();
            }}
        >
            <pre
                ref={preRef}
                className={`code-editor-pre ${isPlaceholder ? 'code-editor-placeholder' : ''}`}
                aria-hidden
                dangerouslySetInnerHTML={{ __html: highlighted }}
            />
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange?.(e.target.value)}
                onBlur={(e) => onBlur?.(e.target.value)}
                spellCheck={false}
                wrap="off"
                readOnly={readOnly}
                className={`code-editor-textarea ${readOnly ? 'code-editor-textarea-readonly' : ''}`}
                aria-label="Code editor"
                data-variable-insertion-target={!readOnly && allowVariableInsertion ? 'true' : undefined}
                tabIndex={readOnly ? -1 : 0}
                onDragOver={(event) => {
                    if (readOnly || !allowVariableInsertion || !isVariableDrag(event.dataTransfer)) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'copy';
                    moveTextControlCaretToPoint(event.currentTarget, event.clientX, event.clientY);
                }}
                onDrop={(event) => {
                    if (readOnly || !allowVariableInsertion || !isVariableDrag(event.dataTransfer)) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const token = getVariableDragToken(event.dataTransfer);
                    if (!token) return;
                    const index = moveTextControlCaretToPoint(event.currentTarget, event.clientX, event.clientY);
                    const nextValue = `${value.slice(0, index)}${token}${value.slice(index)}`;
                    onChange?.(nextValue);
                    requestAnimationFrame(() => {
                        const caret = index + token.length;
                        textareaRef.current?.focus({ preventScroll: true });
                        textareaRef.current?.setSelectionRange(caret, caret);
                    });
                }}
            />
        </div>
    );
};

export default CodeEditor;
