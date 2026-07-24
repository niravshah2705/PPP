import { useMemo, useState } from 'react';
import type { Exercise } from '../types/exercise';
import type { PlanDraft, PlanDraftItem, TemplateItem } from '../types/template';
import { appendExerciseToItems, validatePlanDraft } from '../lib/planDraft';
import { errorsByField } from '../lib/templateValidation';
import { ExercisePicker } from './ExercisePicker';
import { TemplateItemEditor } from './TemplateItemEditor';
import './PlanDraftEditor.css';

export interface PlanDraftEditorProps {
  /** The plan draft to edit (e.g. instantiated from a template). */
  draft: PlanDraft;
  /** Valid exercise ids used to validate item references, if known. */
  knownExerciseIds?: ReadonlySet<string>;
}

/**
 * Editor for a plan draft. Reuses the shared item editor so each item's dosage
 * (sets/reps/hold/rest) stays consistent with template editing, and hosts the
 * "Add exercise" picker so doctors can append extra exercises from the library
 * beyond the source template. Appended items are immediately editable and are
 * reflected in the summary and validation. Duplicates are permitted (the picker
 * flags them) so a doctor can deliberately add the same exercise twice.
 */
export function PlanDraftEditor({ draft, knownExerciseIds }: PlanDraftEditorProps) {
  const [items, setItems] = useState<PlanDraftItem[]>(() => draft.items.map((i) => ({ ...i })));

  const existingIds = useMemo(
    () => new Set(items.map((item) => item.exerciseId)),
    [items],
  );

  const errors = useMemo(
    () => validatePlanDraft({ ...draft, items }, knownExerciseIds),
    [draft, items, knownExerciseIds],
  );
  const fieldErrors = useMemo(() => errorsByField(errors), [errors]);

  const handleItemChange = (index: number, item: TemplateItem) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...item } : it)));

  const handleItemRemove = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleAddExercise = (exercise: Exercise) =>
    setItems((prev) => appendExerciseToItems(prev, exercise));

  return (
    <section className="plan-draft-editor" data-testid="plan-draft-editor">
      <header className="plan-draft-editor__header">
        <h2>{draft.name}</h2>
        <p className="plan-draft-editor__summary" data-testid="plan-draft-summary">
          {items.length} exercise{items.length === 1 ? '' : 's'} in plan
        </p>
      </header>

      <div className="plan-draft-editor__items">
        {fieldErrors.items && (
          <span className="plan-draft-editor__error" role="alert" data-testid="plan-draft-items-error">
            {fieldErrors.items}
          </span>
        )}
        {items.map((item, index) => {
          const duplicate =
            items.filter((it) => it.exerciseId === item.exerciseId).length > 1;
          return (
            <div key={index} className="plan-draft-editor__item" data-testid={`plan-item-${index}`}>
              <TemplateItemEditor
                item={item}
                index={index}
                fieldErrors={fieldErrors}
                onChange={handleItemChange}
                onRemove={handleItemRemove}
              />
              {duplicate && (
                <span className="plan-draft-editor__badge" data-testid={`plan-item-${index}-duplicate`}>
                  already in plan
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ExercisePicker existingExerciseIds={existingIds} onSelect={handleAddExercise} />
    </section>
  );
}
