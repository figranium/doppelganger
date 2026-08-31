import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import MaterialIcon from '../MaterialIcon';
import RichInput from '../RichInput';
import CodeEditor from '../CodeEditor';
import ActionItem from './ActionItem';
import StickyNote from './StickyNote';
import { Task, Action, BlockTestResult, ExtractionField, ExtractionGroup, StickyNote as StickyNoteType } from '../../types';
import { generateExtractionScript } from '../../utils/extractionScriptGen';
import { taskFieldInspectId, taskGroupContainerInspectId, taskGroupFieldInspectId } from '../../utils/extractionFieldIds';
import CustomSelect from '../common/CustomSelect';
import { EXTRACTION_ATTRIBUTE_OPTIONS } from './extractionOptions';
import ConfigModalShell from './ConfigModalShell';
import ConfigVariableList from './ConfigVariableList';
import useVariableInsertion from './useVariableInsertion';
import ExecutionConfigModal from './ExecutionConfigModal';
import {
    findMatchingEndIndex,
    getIfFalseScopeId,
    getIfTrueScopeId,
    getLoopBodyScopeId,
    isBlockStartAction,
    isLoopAction,
} from '../../utils/actionBlocks';

// ── Extraction Script Block (scrape mode) ────────────────────────────────────

interface ExtractionScriptBlockProps {
    task: Task;
    onUpdate: (updates: Partial<Task>) => void;
    onAutoSave: () => void;
    onDelete: () => void;
    onStartInspect?: (id: string) => void;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    selectorOptionsById?: Record<string, string[]>;
}

const ExtractionScriptBlock: React.FC<ExtractionScriptBlockProps> = ({ task, onUpdate, onAutoSave, onDelete, onStartInspect, onStartGroupContainerInspect, onStartGroupFieldInspect, selectorOptionsById }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showAiPrompt, setShowAiPrompt] = useState(false);
    const [aiDescription, setAiDescription] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const { canInsertVariable, captureInsertionSelection, insertVariable } = useVariableInsertion();

    const scriptPreview = (task.extractionScript || '').split('\n').find(l => l.trim()) || '';

    const extractionMode: 'visual' | 'javascript' = task.extractionMode
        || (task.extractionScript && !(task.extractionFields && task.extractionFields.length) ? 'javascript' : 'visual');
    const fields = task.extractionFields || [];
    const groups = task.extractionGroups || [];
    const setFields = (next: ExtractionField[]) => {
        onUpdate({ extractionFields: next, extractionScript: generateExtractionScript(next, groups) });
    };
    const addField = () => {
        setFields([...fields, { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' }]);
    };
    const updateField = (id: string, updates: Partial<ExtractionField>) => {
        setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    };
    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
    };
    const switchExtractionMode = (mode: 'visual' | 'javascript') => {
        onUpdate({ extractionMode: mode });
    };

    const setGroups = (next: ExtractionGroup[]) => {
        onUpdate({ extractionGroups: next, extractionScript: generateExtractionScript(fields, next) });
    };
    const addGroup = () => {
        setGroups([...groups, { id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', containerSelector: '', fields: [] }]);
    };
    const updateGroup = (id: string, updates: Partial<ExtractionGroup>) => {
        setGroups(groups.map(g => g.id === id ? { ...g, ...updates } : g));
    };
    const removeGroup = (id: string) => {
        setGroups(groups.filter(g => g.id !== id));
    };
    const addGroupField = (groupId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        updateGroup(groupId, { fields: [...group.fields, { id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, name: '', selector: '', attribute: 'text' }] });
    };
    const updateGroupField = (groupId: string, fieldId: string, updates: Partial<ExtractionField>) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        updateGroup(groupId, { fields: group.fields.map(f => f.id === fieldId ? { ...f, ...updates } : f) });
    };
    const removeGroupField = (groupId: string, fieldId: string) => {
        const group = groups.find(g => g.id === groupId);
        if (!group) return;
        updateGroup(groupId, { fields: group.fields.filter(f => f.id !== fieldId) });
    };

    const handleGenerate = async () => {
        if (!aiDescription.trim()) return;
        setAiLoading(true);
        setAiError(null);
        try {
            const res = await fetch('/api/tasks/generate-script', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: aiDescription.trim() })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.details ? `${data.error}: ${data.details}` : (data.error || 'Generation failed'));
            onUpdate({ extractionScript: data.script });
            setShowAiPrompt(false);
            setAiDescription('');
        } catch (e: any) {
            setAiError(e.message);
        } finally {
            setAiLoading(false);
        }
    };

    const closeConfig = useCallback(() => {
        setIsOpen(false);
        setShowAiPrompt(false);
        setAiError(null);
        onAutoSave();
    }, [onAutoSave]);

    const modal = isOpen ? (
        <ConfigModalShell icon="data_object" title="Extraction Script" onClose={closeConfig}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)] lg:gap-8">
                <div
                    className="min-w-0 space-y-6"
                    onFocusCapture={(event) => captureInsertionSelection(event.target)}
                    onSelectCapture={(event) => captureInsertionSelection(event.target)}
                    onKeyUpCapture={(event) => captureInsertionSelection(event.target)}
                    onPointerUpCapture={(event) => captureInsertionSelection(event.target)}
                >
                    {/* Script */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Script</label>
                            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                                {(['visual', 'javascript'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => switchExtractionMode(mode)}
                                        className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-tight transition-all ${extractionMode === mode
                                            ? 'bg-white text-black'
                                            : 'text-white/50 hover:text-white'
                                            }`}
                                    >
                                        {mode === 'visual' ? 'Visual' : 'JavaScript'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {extractionMode === 'visual' ? (
                            <div className="space-y-2">
                                {fields.length === 0 && (
                                    <div className="text-xs text-white/40 bg-white/[0.03] border border-dashed border-white/10 rounded-xl p-4 text-center">
                                        No fields yet. Add a field, then use the target icon to pick its selector from the page.
                                    </div>
                                )}
                                {fields.map(extractionField => (
                                    <div key={extractionField.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <input
                                                value={extractionField.name}
                                                onChange={(e) => updateField(extractionField.id, { name: e.target.value })}
                                                placeholder="fieldName"
                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                                            />
                                            <button
                                                onClick={() => removeField(extractionField.id)}
                                                className="text-white/40 hover:text-red-400 transition-colors shrink-0"
                                                title="Remove field"
                                                aria-label="Remove field"
                                            >
                                                <MaterialIcon name="close" className="text-base" />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-white/25">
                                                <RichInput
                                                    value={extractionField.selector}
                                                    onChange={(v) => updateField(extractionField.id, { selector: v })}
                                                    variables={task.variables}
                                                    placeholder=".price, h1.title, ..."
                                                    className="text-xs"
                                                />
                                            </div>
                                            {onStartInspect && (
                                                <button
                                                    onClick={() => { setIsOpen(false); onStartInspect(taskFieldInspectId(extractionField.id)); }}
                                                    className="text-white opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                    title="Pick Selector in Browser"
                                                    aria-label="Pick Selector in Browser"
                                                >
                                                    <MaterialIcon name="my_location" className="text-lg" />
                                                </button>
                                            )}
                                        </div>
                                        {selectorOptionsById?.[taskFieldInspectId(extractionField.id)] && selectorOptionsById[taskFieldInspectId(extractionField.id)].length > 1 && (
                                            <div className="flex flex-wrap gap-1">
                                                {selectorOptionsById[taskFieldInspectId(extractionField.id)].map((opt, i) => (
                                                    <button
                                                        key={i}
                                                        onClick={() => updateField(extractionField.id, { selector: opt })}
                                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${extractionField.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                    >
                                                        {opt}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <CustomSelect
                                                value={extractionField.attribute}
                                                onChange={(attribute) => updateField(extractionField.id, { attribute })}
                                                options={EXTRACTION_ATTRIBUTE_OPTIONS}
                                                className="w-[170px] !min-h-8"
                                                ariaLabel={`${extractionField.name || 'Field'} attribute`}
                                            />
                                            {extractionField.attribute === 'attr' && (
                                                <input
                                                    value={extractionField.attrName || ''}
                                                    onChange={(e) => updateField(extractionField.id, { attrName: e.target.value })}
                                                    placeholder="href"
                                                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white"
                                                />
                                            )}
                                            {extractionField.attribute !== 'exists' && (
                                                <label className="flex items-center gap-1.5 text-xs text-white/50 cursor-pointer ml-auto">
                                                    <input
                                                        type="checkbox"
                                                        checked={!!extractionField.multiple}
                                                        onChange={(e) => updateField(extractionField.id, { multiple: e.target.checked })}
                                                        className="accent-current"
                                                    />
                                                    Multiple (list)
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <button
                                    onClick={addField}
                                    className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/10 text-xs font-bold uppercase tracking-tight text-white/50 hover:text-white hover:border-white/25 transition-colors"
                                >
                                    <MaterialIcon name="add" className="text-base" />
                                    Add Field
                                </button>

                                <div className="pt-2 mt-2 border-t border-dashed border-white/10 space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Repeating Groups</label>
                                        <p className="text-xs text-gray-500 mt-0.5">One row per matched container — e.g. every product card on a search results page — with a column per sub-field. Produces a multi-row CSV.</p>
                                    </div>
                                    {groups.map(group => (
                                        <div key={group.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <input
                                                    value={group.name}
                                                    onChange={(e) => updateGroup(group.id, { name: e.target.value })}
                                                    placeholder="groupName (e.g. products)"
                                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                                                />
                                                <button
                                                    onClick={() => removeGroup(group.id)}
                                                    className="text-white/40 hover:text-red-400 transition-colors shrink-0"
                                                    title="Remove group"
                                                    aria-label="Remove group"
                                                >
                                                    <MaterialIcon name="close" className="text-base" />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-white/25">
                                                    <RichInput
                                                        value={group.containerSelector}
                                                        onChange={(v) => updateGroup(group.id, { containerSelector: v })}
                                                        variables={task.variables}
                                                        placeholder="Row container, e.g. [data-component-type='s-search-result']"
                                                        className="text-xs"
                                                    />
                                                </div>
                                                {onStartGroupContainerInspect && (
                                                    <button
                                                        onClick={() => { setIsOpen(false); onStartGroupContainerInspect(group.id); }}
                                                        className="text-white opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                        title="Pick Row Container in Browser"
                                                        aria-label="Pick Row Container in Browser"
                                                    >
                                                        <MaterialIcon name="my_location" className="text-lg" />
                                                    </button>
                                                )}
                                            </div>
                                            {selectorOptionsById?.[taskGroupContainerInspectId(group.id)] && selectorOptionsById[taskGroupContainerInspectId(group.id)].length > 1 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {selectorOptionsById[taskGroupContainerInspectId(group.id)].map((opt, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => updateGroup(group.id, { containerSelector: opt })}
                                                            className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${group.containerSelector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                        >
                                                            {opt}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            <div className="pl-3 border-l-2 border-white/10 space-y-2">
                                                {group.fields.length === 0 && (
                                                    <p className="text-xs text-gray-500">No columns yet. Add one for each piece of data to pull from every row (e.g. title, price).</p>
                                                )}
                                                {group.fields.map(field => (
                                                    <div key={field.id} className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                value={field.name}
                                                                onChange={(e) => updateGroupField(group.id, field.id, { name: e.target.value })}
                                                                placeholder="columnName"
                                                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-white/25"
                                                            />
                                                            <button
                                                                onClick={() => removeGroupField(group.id, field.id)}
                                                                className="text-white/40 hover:text-red-400 transition-colors shrink-0"
                                                                title="Remove column"
                                                                aria-label="Remove column"
                                                            >
                                                                <MaterialIcon name="close" className="text-base" />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-white/25">
                                                                <RichInput
                                                                    value={field.selector}
                                                                    onChange={(v) => updateGroupField(group.id, field.id, { selector: v })}
                                                                    variables={task.variables}
                                                                    placeholder="Selector relative to row, e.g. h2 span"
                                                                    className="text-xs"
                                                                />
                                                            </div>
                                                            {onStartGroupFieldInspect && (
                                                                <button
                                                                    onClick={() => { setIsOpen(false); onStartGroupFieldInspect(group.id, field.id); }}
                                                                    className="text-white opacity-50 hover:opacity-100 transition-colors shrink-0"
                                                                    title="Pick Selector in Browser (within row)"
                                                                    aria-label="Pick Selector in Browser (within row)"
                                                                >
                                                                    <MaterialIcon name="my_location" className="text-lg" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {selectorOptionsById?.[taskGroupFieldInspectId(group.id, field.id)] && selectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].length > 1 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {selectorOptionsById[taskGroupFieldInspectId(group.id, field.id)].map((opt, i) => (
                                                                    <button
                                                                        key={i}
                                                                        onClick={() => updateGroupField(group.id, field.id, { selector: opt })}
                                                                        className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${field.selector === opt ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-white/[0.02] border-white/10 text-white/40 hover:text-white/80 hover:bg-white/[0.05]'}`}
                                                                    >
                                                                        {opt}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <CustomSelect
                                                                value={field.attribute}
                                                                onChange={(attribute) => updateGroupField(group.id, field.id, { attribute })}
                                                                options={EXTRACTION_ATTRIBUTE_OPTIONS}
                                                                className="w-[170px] !min-h-8"
                                                                ariaLabel={`${field.name || 'Group field'} attribute`}
                                                            />
                                                            {field.attribute === 'attr' && (
                                                                <input
                                                                    value={field.attrName || ''}
                                                                    onChange={(e) => updateGroupField(group.id, field.id, { attrName: e.target.value })}
                                                                    placeholder="href"
                                                                    className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs font-mono text-white"
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    onClick={() => addGroupField(group.id)}
                                                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-white/10 text-xs font-bold uppercase tracking-tight text-white/50 hover:text-white hover:border-white/25 transition-colors"
                                                >
                                                    <MaterialIcon name="add" className="text-sm" />
                                                    Add Column
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <button
                                        onClick={addGroup}
                                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-white/10 text-xs font-bold uppercase tracking-tight text-white/50 hover:text-white hover:border-white/25 transition-colors"
                                    >
                                        <MaterialIcon name="add" className="text-base" />
                                        Add Group
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center justify-end">
                                    <button
                                        onClick={() => { setShowAiPrompt(v => !v); setAiError(null); }}
                                        className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white transition-colors"
                                        title="Generate with AI"
                                    >
                                        <MaterialIcon name="auto_awesome" className="text-sm" />
                                        Generate
                                    </button>
                                </div>
                                {showAiPrompt && (
                                    <div className="flex flex-col gap-2 p-3 rounded-xl bg-white/5 border border-white/10">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={aiDescription}
                                            onChange={e => setAiDescription(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter' && !aiLoading) handleGenerate(); }}
                                            placeholder="e.g. extract all article titles and links"
                                            className="bg-transparent text-xs text-white placeholder-gray-600 focus:outline-none"
                                        />
                                        {aiError && <p className="text-xs text-red-400">{aiError}</p>}
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => { setShowAiPrompt(false); setAiError(null); }} className="text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Cancel</button>
                                            <button
                                                onClick={handleGenerate}
                                                disabled={aiLoading || !aiDescription.trim()}
                                                className="px-3 py-1 rounded-lg bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                                            >
                                                {aiLoading && <MaterialIcon name="autorenew" className="text-xs animate-spin" />}
                                                {aiLoading ? 'Generating…' : 'Generate'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 focus-within:border-white/20 transition-all">
                                    <CodeEditor
                                        value={task.extractionScript || ''}
                                        onChange={v => onUpdate({ extractionScript: v })}
                                        onBlur={onAutoSave}
                                        language="javascript"
                                        className="min-h-[180px]"
                                        placeholder="// Example: return { title: document.title };"
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    {/* Format */}
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-600 uppercase tracking-widest pl-1">Output Format</label>
                        <div className="bg-white/[0.03] border border-white/5 rounded-xl px-3 py-2.5 focus-within:border-white/20 transition-all">
                            <CustomSelect
                                value={task.extractionFormat || 'json'}
                                onChange={(extractionFormat) => onUpdate({ extractionFormat })}
                                options={[
                                    { value: 'json', label: 'JSON', icon: 'data_object' },
                                    { value: 'csv', label: 'CSV', icon: 'table_rows' },
                                ]}
                                className="!min-h-0 !border-0 !bg-transparent !p-0"
                                ariaLabel="Extraction format"
                            />
                        </div>
                    </div>
                </div>
                <aside className="min-w-0" aria-label="Extraction context">
                    <ConfigVariableList variables={task.variables} canInsertVariable={canInsertVariable} onInsertVariable={insertVariable} />
                </aside>
            </div>
        </ConfigModalShell>
    ) : null;

    const contextMenuPortal = contextMenu ? createPortal(
        <div
            className="fixed inset-0 z-[200]"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        >
            <div
                className="absolute bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-1 min-w-[140px]"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={() => { setContextMenu(null); onDelete(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-white/5 transition-colors"
                >
                    <MaterialIcon name="delete" className="text-sm" />
                    Remove extraction script
                </button>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <div
                onClick={() => setIsOpen(true)}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
                data-interactive-target="true"
                className="bg-black min-w-[280px] w-full max-w-sm mx-auto border border-white/20 p-5 rounded-2xl group/item relative transition-all duration-150 select-none touch-none cursor-pointer hover:border-white/40 hover:bg-white/[0.02]"
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        <MaterialIcon name="data_object" className="text-[12px] text-white" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-white shrink-0">Extraction Script</span>
                    {scriptPreview && (
                        <span className="text-white/40 text-xs font-mono truncate min-w-0 pointer-events-none">
                            {scriptPreview.trim()}
                        </span>
                    )}
                </div>
            </div>
            {modal}
            {contextMenuPortal}
        </>
    );
};

interface CanvasViewProps {
    currentTask: Task;
    setCurrentTask: (task: Task) => void;
    canvasOffset: { x: number; y: number };
    canvasScale: number;
    canvasViewportRef: React.RefObject<HTMLDivElement>;
    triggerExpanded: boolean;
    setTriggerExpanded: (val: boolean) => void;
    onOpenCabinet: (tab?: any) => void;
    handleAutoSave: (task?: Task) => void;
    dragState: any;
    dragOverIndex: number | null;
    selectedActionIds: Set<string>;
    setSelectedActionIds?: (ids: Set<string>) => void;
    actionStatusById: Record<string, string>;
    availableTasks: Task[];
    selectorOptionsById: Record<string, string[]>;
    onStartGroupContainerInspect?: (groupId: string) => void;
    onStartGroupFieldInspect?: (groupId: string, fieldId: string) => void;
    updateAction: (id: string, updates: Partial<Action>, saveImmediately?: boolean) => void;
    openActionPalette: (targetId?: string, insertIndex?: number) => void;
    openContextMenu: (e: React.MouseEvent, id: string) => void;
    handleActionPointerDown: (e: React.PointerEvent, id: string, index: number) => void;
    onOpenHeadful: (url: string, targetActionId?: string, taskSnapshot?: Task, variables?: any) => void;
    isHeadfulOpen?: boolean;
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    selectionBox: any;
    onAddStickyNote: (x: number, y: number) => void;
    onUpdateStickyNote: (id: string, updates: Partial<StickyNoteType>) => void;
    onDeleteStickyNote: (id: string) => void;
    onDuplicateStickyNote: (note: StickyNoteType) => void;
    selectedNoteIds: Set<string>;
    autoOpenActionId?: string | null;
    onClearAutoOpenActionId?: () => void;
}

const LOOP_CONNECTOR_WIDTH = 760;
const LOOP_MAIN_X = 380;
const LOOP_BODY_X = 600;
const LOOP_RAIL_X = 160;
const LOOP_BODY_TOP = 132;

const LoopConnector: React.FC = () => {
    const hostRef = useRef<HTMLDivElement>(null);
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const updateHeight = () => setHeight(Math.round(host.getBoundingClientRect().height));
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(host);
        return () => observer.disconnect();
    }, []);

    const bottomY = Math.max(LOOP_BODY_TOP + 48, height - 22);
    const closedLoopPath = [
        `M ${LOOP_MAIN_X} 58`,
        `H ${LOOP_BODY_X - 16}`,
        `Q ${LOOP_BODY_X} 58 ${LOOP_BODY_X} 74`,
        `V ${bottomY - 18}`,
        `Q ${LOOP_BODY_X} ${bottomY} ${LOOP_BODY_X - 18} ${bottomY}`,
        `H ${LOOP_RAIL_X + 18}`,
        `Q ${LOOP_RAIL_X} ${bottomY} ${LOOP_RAIL_X} ${bottomY - 18}`,
        'V 76',
        `Q ${LOOP_RAIL_X} 58 ${LOOP_RAIL_X + 18} 58`,
        `H ${LOOP_MAIN_X}`,
        'Z',
    ].join(' ');

    return (
        <div ref={hostRef} className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
            {height > 0 && (
                <svg
                    className="absolute inset-0 overflow-visible text-white/25"
                    width="100%"
                    height="100%"
                    viewBox={`0 0 ${LOOP_CONNECTOR_WIDTH} ${height}`}
                    preserveAspectRatio="none"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d={`M ${LOOP_MAIN_X} 0 V 58`} vectorEffect="non-scaling-stroke" />
                    <path d={closedLoopPath} vectorEffect="non-scaling-stroke" />
                    <path d={`M ${LOOP_MAIN_X} ${bottomY} V ${height}`} vectorEffect="non-scaling-stroke" />
                </svg>
            )}
        </div>
    );
};

const CanvasView: React.FC<CanvasViewProps> = ({
    currentTask,
    setCurrentTask,
    canvasOffset,
    canvasScale,
    canvasViewportRef,
    onOpenCabinet,
    handleAutoSave,
    dragState,
    dragOverIndex,
    selectedActionIds,
    actionStatusById,
    availableTasks,
    selectorOptionsById,
    onStartGroupContainerInspect,
    onStartGroupFieldInspect,
    updateAction,
    openActionPalette,
    openContextMenu,
    handleActionPointerDown,
    onOpenHeadful,
    isHeadfulOpen,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    selectionBox,
    onAddStickyNote,
    onUpdateStickyNote,
    onDeleteStickyNote,
    onDuplicateStickyNote,
    selectedNoteIds,
    autoOpenActionId,
    onClearAutoOpenActionId,
}) => {
    const onStartInspect = useCallback((id: string) => {
        if (!isHeadfulOpen) {
            onOpenHeadful?.(currentTask.url || 'https://www.google.com', id, currentTask, currentTask.variables);
        }
    }, [isHeadfulOpen, onOpenHeadful, currentTask.url, currentTask.variables]);

    const handleCreateVariable = useCallback((name: string) => {
        const nextVars = { ...currentTask.variables };
        if (name in nextVars) return;
        nextVars[name] = { type: 'string', value: '', autoCreated: true };
        const updated = { ...currentTask, variables: nextVars };
        setCurrentTask(updated);
        handleAutoSave(updated);
    }, [currentTask, setCurrentTask, handleAutoSave]);

    const handleDeleteVariable = useCallback((name: string) => {
        const nextVars = { ...currentTask.variables };
        if (!(name in nextVars) || !nextVars[name].autoCreated) return;
        delete nextVars[name];
        const updated = { ...currentTask, variables: nextVars };
        setCurrentTask(updated);
        handleAutoSave(updated);
    }, [currentTask, setCurrentTask, handleAutoSave]);

    const [blockTestResultsById, setBlockTestResultsById] = useState<Record<string, BlockTestResult>>({});
    const [isExecutionConfigOpen, setIsExecutionConfigOpen] = useState(false);

    const updateExecutionConfig = useCallback((updates: Partial<Task>, saveImmediately = false) => {
        const updated = { ...currentTask, ...updates };
        setCurrentTask(updated);
        if (saveImmediately) handleAutoSave(updated);
    }, [currentTask, setCurrentTask, handleAutoSave]);

    useEffect(() => {
        setBlockTestResultsById({});
    }, [currentTask.id]);

    const handleBlockTestResult = useCallback((result: BlockTestResult) => {
        setBlockTestResultsById((previous) => ({ ...previous, [result.actionId]: result }));
    }, []);

    const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; worldX: number; worldY: number } | null>(null);

    const handleCanvasContextMenu = useCallback((e: React.MouseEvent) => {
        // Only trigger on the canvas background, not on blocks or sticky notes
        const target = e.target as HTMLElement;
        if (target.closest('[data-action-id]') || target.closest('[data-sticky-note-id]') || target.closest('[data-interactive-target="true"]')) return;
        e.preventDefault();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const worldX = Math.round((e.clientX - rect.left - canvasOffset.x) / canvasScale);
        const worldY = Math.round((e.clientY - rect.top - canvasOffset.y) / canvasScale);
        const padding = 8;
        const menuW = 180;
        const menuH = 48;
        const x = Math.min(Math.max(e.clientX + 12, padding), window.innerWidth - menuW - padding);
        const y = Math.min(Math.max(e.clientY + 12, padding), window.innerHeight - menuH - padding);
        setCanvasContextMenu({ x, y, worldX, worldY });
    }, [canvasOffset, canvasScale]);

    const buildAst = (
        startIndex: number,
        endIndex: number,
        _depth: number = 0,
        actionWidth: 280 | 360 = 360,
    ): React.ReactNode[] => {
        const nodes: React.ReactNode[] = [];
        let i = startIndex;
        while (i < endIndex) {
            const currentIndex = i;
            const action = currentTask.actions[currentIndex];
            if (!action) { i++; continue; }

            const matchingEnd = findMatchingEndIndex(currentTask.actions, currentIndex);

            if (action.type === 'if' && matchingEnd !== null && matchingEnd < endIndex) {
                const blockStart = i;
                const blockEnd = matchingEnd;
                let nestLevel = 1;
                let j = i + 1;
                let elseIndex = -1;
                while (j < blockEnd && nestLevel > 0) {
                    const a = currentTask.actions[j];
                    if (isBlockStartAction(a.type)) nestLevel++;
                    if (a.type === 'end') {
                        nestLevel--;
                    }
                    if (a.type === 'else' && nestLevel === 1) {
                        elseIndex = j;
                    }
                    j++;
                }

                const trueStart = blockStart + 1;
                const trueEnd = elseIndex !== -1 ? elseIndex : blockEnd;
                const falseStart = elseIndex !== -1 ? elseIndex + 1 : -1;
                const falseEnd = elseIndex !== -1 ? blockEnd : -1;
                const isNestedIf = _depth > 0;
                const branchActionWidth = isNestedIf ? 280 : actionWidth;

                nodes.push(
                    <div key={action.id} className="flex flex-col items-center w-full">
                        <div className="w-[360px]">
                            <ActionItem
                                action={action}
                                task={currentTask}
                                index={currentIndex}
                                isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                isDragging={dragState?.id === action.id}
                                dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                isSelected={selectedActionIds.has(action.id)}
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                                onCreateVariable={handleCreateVariable}
                                onDeleteVariable={handleDeleteVariable}
                                autoOpenConfig={autoOpenActionId === action.id}
                                onCloseConfigModal={onClearAutoOpenActionId}
                                testResult={blockTestResultsById[action.id]}
                                onTestResult={handleBlockTestResult}
                            />
                        </div>
                        <div className={`flex mt-4 relative ${isNestedIf ? 'gap-6 -translate-x-[132px]' : 'gap-16'}`}>
                            <div className={`flex flex-col items-center ${isNestedIf ? 'w-[280px]' : 'min-w-[200px]'}`}>
                                <div className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">
                                    True
                                </div>
                                <div className="w-px h-6 bg-white/25" />
                                <div className="flex flex-col items-center gap-3">
                                    {buildAst(trueStart, trueEnd, _depth + 1, branchActionWidth)}
                                </div>
                                <div className="mt-2 flex flex-col items-center">
                                    <div className="w-px h-4 bg-white/20" />
                                    <button
                                        data-action-drop-scope={getIfTrueScopeId(action.id)}
                                        onClick={() => openActionPalette(undefined, trueEnd)}
                                        className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label="Add action (Ctrl + K)"
                                        title="Add action (Ctrl + K)"
                                    >
                                        <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                    </button>
                                </div>
                            </div>
                            <div className={`flex flex-col items-center ${isNestedIf ? 'w-[280px]' : 'min-w-[200px]'}`}>
                                    <div className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2">Otherwise</div>
                                    <div className="w-px h-6 bg-white/25" />
                                    <div className="flex flex-col items-center gap-3">
                                        {falseStart !== -1 ? buildAst(falseStart, falseEnd, _depth + 1, branchActionWidth) : null}
                                    </div>
                                    <div className="mt-2 flex flex-col items-center">
                                        <div className="w-px h-4 bg-white/20" />
                                        <button
                                            data-action-drop-scope={getIfFalseScopeId(action.id)}
                                            onClick={() => {
                                                if (falseStart !== -1) {
                                                    openActionPalette(undefined, falseEnd);
                                                } else {
                                                    const elseAction: Action = { id: 'act_' + Date.now() + '_else', type: 'else', selector: '', value: '' };
                                                    const newActions = [...currentTask.actions];
                                                    newActions.splice(blockEnd, 0, elseAction);
                                                    setCurrentTask({ ...currentTask, actions: newActions });
                                                    handleAutoSave({ ...currentTask, actions: newActions });
                                                    setTimeout(() => openActionPalette(undefined, blockEnd + 1), 50);
                                                }
                                            }}
                                            className="w-12 h-12 border border-dashed border-white/15 rounded-xl hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                            aria-label="Add action (Ctrl + K)"
                                            title="Add action (Ctrl + K)"
                                        >
                                            <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                        </button>
                                    </div>
                            </div>
                        </div>
                        <div className="flex flex-col items-center mt-3">
                            <div className="w-px h-2 bg-white/25" />
                            <button
                                onClick={() => openActionPalette(undefined, blockEnd + 1)}
                                className="w-8 h-8 border border-dashed border-white/10 rounded-lg hover:border-white/30 hover:bg-white/5 transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Add action (Ctrl + K)"
                                title="Add action (Ctrl + K)"
                            >
                                <MaterialIcon name="add" className="text-sm text-gray-600 group-hover:text-white transition-colors" />
                            </button>
                            <div className="w-px h-2 bg-white/25" />
                        </div>
                    </div>
                );
                i = blockEnd + 1;
            } else if (isLoopAction(action.type) && matchingEnd !== null && matchingEnd < endIndex) {
                const blockEnd = matchingEnd;
                const bodyStart = currentIndex + 1;
                const bodyEnd = blockEnd;
                const loopBodyScopeId = getLoopBodyScopeId(action.id);
                const isEmptyLoop = bodyStart === bodyEnd;

                nodes.push(
                    <div key={action.id} className="flex flex-col items-center w-full">
                        <div className="w-[360px]">
                            <ActionItem
                                action={action}
                                task={currentTask}
                                index={currentIndex}
                                isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                isDragging={dragState?.id === action.id}
                                dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                isSelected={selectedActionIds.has(action.id)}
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                                onCreateVariable={handleCreateVariable}
                                onDeleteVariable={handleDeleteVariable}
                                autoOpenConfig={autoOpenActionId === action.id}
                                onCloseConfigModal={onClearAutoOpenActionId}
                                testResult={blockTestResultsById[action.id]}
                                onTestResult={handleBlockTestResult}
                            />
                        </div>

                        <div className="relative w-[760px] min-h-[260px] shrink-0 pt-[132px] pb-11">
                            <LoopConnector />

                            {isEmptyLoop ? (
                                <button
                                    data-action-drop-scope={loopBodyScopeId}
                                    onClick={() => openActionPalette(undefined, bodyEnd)}
                                    className="absolute left-[576px] top-[123px] z-20 w-12 h-12 border border-dashed border-white/15 rounded-xl bg-[var(--app-bg)] hover:border-white/30 hover:bg-[var(--app-surface)] transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label="Add action inside loop (Ctrl + K)"
                                    title="Add action inside loop (Ctrl + K)"
                                >
                                    <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                </button>
                            ) : (
                            <div className="relative z-10 ml-[420px] w-[360px] flex flex-col items-center">
                                <div className="flex flex-col items-center gap-3 w-full">
                                    {buildAst(bodyStart, bodyEnd, _depth + 1)}
                                </div>
                                <div className="mt-2 flex flex-col items-center">
                                    <div className="h-4 border-l border-white/20" />
                                    <button
                                        data-action-drop-scope={loopBodyScopeId}
                                        onClick={() => openActionPalette(undefined, bodyEnd)}
                                        className="relative z-20 w-12 h-12 border border-dashed border-white/15 rounded-xl bg-[var(--app-bg)] hover:border-white/30 hover:bg-[var(--app-surface)] transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label="Add action inside loop (Ctrl + K)"
                                        title="Add action inside loop (Ctrl + K)"
                                    >
                                        <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                    </button>
                                </div>
                            </div>
                            )}
                        </div>

                        <div className="relative z-10 flex flex-col items-center">
                            <button
                                onClick={() => openActionPalette(undefined, blockEnd + 1)}
                                className="relative z-20 w-8 h-8 border border-dashed border-white/10 rounded-lg bg-[var(--app-bg)] hover:border-white/30 hover:bg-[var(--app-surface)] transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                aria-label="Add action after loop (Ctrl + K)"
                                title="Add action after loop (Ctrl + K)"
                            >
                                <MaterialIcon name="add" className="text-sm text-gray-600 group-hover:text-white transition-colors" />
                            </button>
                            <div className="h-2 border-l border-white/25" />
                        </div>
                    </div>
                );
                i = blockEnd + 1;
            } else if (action.type === 'end' || action.type === 'else') {
                i++;
            } else {
                nodes.push(
                    <div key={action.id} className="flex flex-col items-center">
                        <div className={actionWidth === 280 ? 'w-[280px]' : 'w-[360px]'}>
                            <ActionItem
                                action={action}
                                task={currentTask}
                                index={currentIndex}
                                isDragOver={dragOverIndex === currentIndex && dragState?.id !== action.id}
                                isDragging={dragState?.id === action.id}
                                dragTransformY={dragState?.id === action.id ? dragState.currentY - dragState.startY : undefined}
                                isSelected={selectedActionIds.has(action.id)}
                                status={actionStatusById[action.id] as any}
                                translateY={0}
                                variables={currentTask.variables}
                                availableTasks={availableTasks}
                                selectorOptions={selectorOptionsById[action.id]}
                                onUpdate={updateAction}
                                onAutoSave={handleAutoSave}
                                onOpenPalette={openActionPalette}
                                onOpenContextMenu={openContextMenu}
                                onPointerDown={handleActionPointerDown}
                                onStartInspect={onStartInspect}
                                onCreateVariable={handleCreateVariable}
                                onDeleteVariable={handleDeleteVariable}
                                autoOpenConfig={autoOpenActionId === action.id}
                                onCloseConfigModal={onClearAutoOpenActionId}
                                testResult={blockTestResultsById[action.id]}
                                onTestResult={handleBlockTestResult}
                            />
                        </div>
                        {i < endIndex - 1 && currentTask.actions[i + 1]?.type !== 'end' && (
                            <div className="flex flex-col items-center my-1">
                                <div className="w-px h-2 bg-white/25" />
                                <button
                                    onClick={() => openActionPalette(undefined, currentIndex + 1)}
                                    className="relative z-20 w-8 h-8 border border-dashed border-white/10 rounded-lg bg-[var(--app-bg)] hover:border-white/30 hover:bg-[var(--app-surface)] transition-all flex items-center justify-center group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                    aria-label="Add action (Ctrl + K)"
                                    title="Add action (Ctrl + K)"
                                >
                                    <MaterialIcon name="add" className="text-sm text-gray-600 group-hover:text-white transition-colors" />
                                </button>
                                <div className="w-px h-2 bg-white/25" />
                            </div>
                        )}
                    </div>
                );
                i++;
            }
        }
        return nodes;
    };

    return (
        <div
            ref={canvasViewportRef}
            className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onContextMenu={handleCanvasContextMenu}
        >
            {/* Dot grid — viewport space so backgroundPosition tracks canvas offset directly,
                preventing the repeating pattern from aliasing on exact-multiple wheel deltas */}
            <div
                className="absolute inset-0 pointer-events-none z-0"
                style={{
                    backgroundImage: `radial-gradient(circle, var(--app-dot) 0.8px, transparent 0)`,
                    backgroundSize: `${22 * canvasScale}px ${22 * canvasScale}px`,
                    backgroundPosition: `${canvasOffset.x}px ${canvasOffset.y}px`,
                }}
            />

            <div
                className="absolute origin-top-left"
                style={{
                    transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`,
                }}
            >
                {/* Sticky notes layer — below blocks (z-5 vs z-10) */}
                {(currentTask.stickyNotes || []).map((note) => (
                    <StickyNote
                        key={note.id}
                        note={note}
                        canvasScale={canvasScale}
                        isSelected={selectedNoteIds.has(note.id)}
                        onUpdate={onUpdateStickyNote}
                        onDelete={onDeleteStickyNote}
                        onDuplicate={onDuplicateStickyNote}
                    />
                ))}

                <div className="relative z-10 flex flex-col items-center pointer-events-none" style={{ paddingTop: '60px', minWidth: '500px' }}>
                    <div
                        className="w-[360px] bg-black border border-white/15 p-5 rounded-2xl shadow-2xl shadow-black/50 select-text cursor-auto relative z-10 pointer-events-auto"
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            setIsExecutionConfigOpen(true);
                        }}
                    >
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                aria-label="Configure On Execution"
                                title="Configure On Execution"
                                onClick={() => setIsExecutionConfigOpen(true)}
                                className="flex items-center gap-3 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg pr-2 transition-all"
                            >
                                <MaterialIcon name="bolt" className="text-white/40 text-base" />
                                <h3 className="text-white/60 font-bold tracking-widest uppercase text-xs">On Execution</h3>
                            </button>
                            <button
                                type="button"
                                onClick={() => onOpenCabinet('mode')}
                                className="p-2 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                title="Open Task Settings"
                                aria-label="Open Task Settings"
                            >
                                <MaterialIcon name="settings" className="text-lg" />
                            </button>
                        </div>
                        {currentTask.description && (
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">{currentTask.description}</p>
                        )}
                    </div>
                    {(currentTask.mode === 'agent' || currentTask.mode === 'scrape') && <div className="w-px h-10 bg-white/25" />}
                    {currentTask.mode === 'scrape' && (
                        <div className="w-[360px] pointer-events-auto">
                            {currentTask.extractionScript !== undefined ? (
                                <ExtractionScriptBlock
                                    task={currentTask}
                                    onUpdate={(updates) => { const merged = { ...currentTask, ...updates }; setCurrentTask(merged); handleAutoSave(merged); }}
                                    onAutoSave={() => handleAutoSave()}
                                    onDelete={() => { const t = { ...currentTask, extractionScript: undefined, extractionFormat: undefined }; setCurrentTask(t); handleAutoSave(t); }}
                                    onStartInspect={onStartInspect}
                                    onStartGroupContainerInspect={onStartGroupContainerInspect}
                                    onStartGroupFieldInspect={onStartGroupFieldInspect}
                                    selectorOptionsById={selectorOptionsById}
                                />
                            ) : (
                                <button
                                    onClick={() => { const t = { ...currentTask, extractionScript: '' }; setCurrentTask(t); handleAutoSave(t); }}
                                    data-interactive-target="true"
                                    className="w-full border border-dashed border-white/15 rounded-2xl p-5 hover:border-white/30 hover:bg-white/[0.03] transition-all flex items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                >
                                    <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-gray-300 transition-colors">Add Extraction Script</span>
                                </button>
                            )}
                        </div>
                    )}
                    {currentTask.mode === 'agent' && (
                        <div className="flex flex-col items-center w-full select-text cursor-auto pointer-events-auto">
                            <div className="space-y-6 w-full flex flex-col items-center relative">
                                {buildAst(0, currentTask.actions.length)}
                                <div className="pt-2 flex flex-col items-center">
                                    <div className="w-px h-6 bg-white/10" />
                                    <button
                                        data-action-drop-scope="root"
                                        onClick={() => openActionPalette()}
                                        className="w-[360px] bg-[#0a0a0a] border border-dashed border-white/15 rounded-2xl p-6 hover:border-white/30 hover:bg-white/[0.03] transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        aria-label="Add action (Ctrl + K)"
                                        title="Add action (Ctrl + K)"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-white/5 group-hover:bg-white/10 transition-all flex items-center justify-center">
                                            <MaterialIcon name="add" className="text-2xl text-gray-500 group-hover:text-white transition-colors" />
                                        </div>
                                        <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-gray-300 transition-colors">Add Action</span>
                                    </button>
                                </div>
                                <div className="w-px h-6 bg-white/25" />
                                <div className="w-[360px]">
                                    {currentTask.extractionScript !== undefined ? (
                                        <ExtractionScriptBlock
                                            task={currentTask}
                                            onUpdate={(updates) => { const merged = { ...currentTask, ...updates }; setCurrentTask(merged); handleAutoSave(merged); }}
                                            onAutoSave={() => handleAutoSave()}
                                            onDelete={() => { const t = { ...currentTask, extractionScript: undefined, extractionFormat: undefined }; setCurrentTask(t); handleAutoSave(t); }}
                                            onStartInspect={onStartInspect}
                                            onStartGroupContainerInspect={onStartGroupContainerInspect}
                                            onStartGroupFieldInspect={onStartGroupFieldInspect}
                                            selectorOptionsById={selectorOptionsById}
                                        />
                                    ) : (
                                        <button
                                            onClick={() => { const t = { ...currentTask, extractionScript: '' }; setCurrentTask(t); handleAutoSave(t); }}
                                            data-interactive-target="true"
                                            className="w-full border border-dashed border-white/15 rounded-2xl p-5 hover:border-white/30 hover:bg-white/[0.03] transition-all flex items-center justify-center gap-2 group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                                        >
                                            <MaterialIcon name="add" className="text-lg text-gray-500 group-hover:text-white transition-colors" />
                                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500 group-hover:text-gray-300 transition-colors">Add Extraction Script</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {selectionBox && (
                <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
                    <div
                        className="absolute bg-blue-500/10 border border-blue-400"
                        style={{
                            left: Math.min(selectionBox.startX, selectionBox.currentX),
                            top: Math.min(selectionBox.startY, selectionBox.currentY),
                            width: Math.abs(selectionBox.currentX - selectionBox.startX),
                            height: Math.abs(selectionBox.currentY - selectionBox.startY)
                        }}
                    />
                </div>
            )}

            {isExecutionConfigOpen && (
                <ExecutionConfigModal
                    task={currentTask}
                    onUpdate={updateExecutionConfig}
                    onClose={() => {
                        setIsExecutionConfigOpen(false);
                        handleAutoSave(currentTask);
                    }}
                />
            )}

            {canvasContextMenu && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setCanvasContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCanvasContextMenu(null); }} />
                    <div
                        className="fixed z-50 w-[180px] bg-[#0b0b0b] border border-white/10 rounded-xl shadow-2xl p-2 text-xs font-bold uppercase tracking-widest text-white/80"
                        style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
                    >
                        <button
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
                            onClick={() => {
                                onAddStickyNote(canvasContextMenu.worldX, canvasContextMenu.worldY);
                                setCanvasContextMenu(null);
                            }}
                        >
                            <span className="material-symbols-outlined text-white/50" style={{ fontSize: '14px' }}>sticky_note_2</span>
                            Add sticky note
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default CanvasView;
