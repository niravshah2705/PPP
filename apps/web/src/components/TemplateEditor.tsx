import { useMemo, useState } from 'react';
import type { Template, TemplateDraft, TemplateItem } from '../types/template';
import {
  createTemplate,
  updateTemplate,
  TemplateValidationError,
} from '../api/templates';
import { validateTemplateDraft } from '../lib/templateValidation';
import { AddExerciseControl } from './AddExerciseControl';
import { TemplateItemEditor } from './TemplateItemEditor';
import './TemplateEditor.css';

export interface TemplateEditorProps {
  /** Existing template when editing; omit to create a new one. */
  template?: Template;
  /** Valid exercise ids used to validate item references, if known. */
  knownExerciseIds?: ReadonlySet<string>;
  /** Called with the saved (created/updated) template on success. */
  onSaved?: (template: Template) => void;
}

function toDraft(template?: Template): TemplateDraft {
  return {
    id: template?.id,
    name: template?.name ?? '',
    description: template?.description ?? '',
    categoryTags: template ? [...template.categoryTags] : [],
    items: template ? template.items.map((i) => ({ ...i })) : [],
  };
}

/**
 * Create/edit form for a custom template. Reuses the shared item editor and
 * add-exercise control bound to a template draft, validates against the plan
 * rules, surfaces field errors on the correct controls, and only persists when
 * the draft is valid (POST for create, PUT for edit).
 */
export function TemplateEditor({ template, knownExerciseIds, onSaved }: TemplateEditorProps) {
  const [draft, setDraft] = useState<TemplateDraft>(() => toDraft(template));
  const [tagInput, setTagInput] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  const isEdit = Boolean(template?.id);

  // Show local validation only after a submit attempt; always show server errors.
  const localErrorMap = useMemo(() => {
    if (!submitted) return {};
    const map: Record<string, string> = {};
    for (const err of validateTemplateDraft(draft, knownExerciseIds)) {
      if (!(err.field in map)) map[err.field] = err.message;
    }
    return map;
  }, [submitted, draft, knownExerciseIds]);

  const fieldErrors = { ...localErrorMap, ...serverErrors };

  const patch = (p: Partial<TemplateDraft>) => setDraft((d) => ({ ...d, ...p }));

  const handleItemChange = (index: number, item: TemplateItem) =>
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => (i === index ? item : it)),
    }));

  const handleItemRemove = (index: number) =>
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== index) }));

  const handleAddItem = (item: TemplateItem) =>
    setDraft((d) => ({ ...d, items: [...d.items, item] }));

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || draft.categoryTags.includes(t)) {
      setTagInput('');
      return;
    }
    patch({ categoryTags: [...draft.categoryTags, t] });
    setTagInput('');
  };

  const removeTag = (tag: string) =>
    patch({ categoryTags: draft.categoryTags.filter((t) => t !== tag) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerErrors({});
    setSaveError(undefined);

    // Guard locally so nothing invalid is ever sent/persisted.
    if (validateTemplateDraft(draft, knownExerciseIds).length > 0) return;

    setSaving(true);
    try {
      const saved = isEdit
        ? await updateTemplate(template!.id, draft, knownExerciseIds)
        : await createTemplate(draft, knownExerciseIds);
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof TemplateValidationError) {
        setServerErrors(err.fieldErrors);
      } else {
        setSaveError(err instanceof Error ? err.message : 'Failed to save template');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="template-editor" onSubmit={handleSubmit} data-testid="template-editor" noValidate>
      <h2>{isEdit ? 'Edit template' : 'New template'}</h2>

      <label className="template-editor__field">
        <span>Name</span>
        <input
          type="text"
          value={draft.name}
          aria-invalid={fieldErrors.name ? true : undefined}
          data-testid="template-name"
          onChange={(e) => patch({ name: e.target.value })}
        />
        {fieldErrors.name && (
          <span className="template-editor__error" role="alert" data-testid="template-name-error">
            {fieldErrors.name}
          </span>
        )}
      </label>

      <label className="template-editor__field">
        <span>Description</span>
        <textarea
          value={draft.description ?? ''}
          data-testid="template-description"
          onChange={(e) => patch({ description: e.target.value })}
        />
        {fieldErrors.description && (
          <span className="template-editor__error" role="alert" data-testid="template-description-error">
            {fieldErrors.description}
          </span>
        )}
      </label>

      <div className="template-editor__field">
        <span>Category tags</span>
        <div className="template-editor__tags" data-testid="template-tags">
          {draft.categoryTags.map((tag) => (
            <span key={tag} className="template-editor__tag" data-testid={`tag-${tag}`}>
              {tag}
              <button type="button" aria-label={`Remove tag ${tag}`} onClick={() => removeTag(tag)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="template-editor__tag-add">
          <input
            type="text"
            placeholder="Add tag"
            aria-label="Add category tag"
            data-testid="tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
          />
          <button type="button" data-testid="tag-add-button" onClick={addTag}>
            Add tag
          </button>
        </div>
      </div>

      <div className="template-editor__items">
        <span>Items</span>
        {fieldErrors.items && (
          <span className="template-editor__error" role="alert" data-testid="template-items-error">
            {fieldErrors.items}
          </span>
        )}
        {draft.items.map((item, index) => (
          <TemplateItemEditor
            key={index}
            item={item}
            index={index}
            fieldErrors={fieldErrors}
            onChange={handleItemChange}
            onRemove={handleItemRemove}
          />
        ))}
        <AddExerciseControl onAdd={handleAddItem} />
      </div>

      {saveError && (
        <p className="template-editor__error" role="alert" data-testid="template-save-error">
          {saveError}
        </p>
      )}

      <button type="submit" data-testid="template-save" disabled={saving}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create template'}
      </button>
    </form>
  );
}
