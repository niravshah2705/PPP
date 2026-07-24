import { useMemo, useState } from 'react';
import type { Exercise } from '../types/exercise';
import type { Plan } from '../types/plan';
import type { PlanDraft, PlanDraftItem, TemplateItem } from '../types/template';
import { savePlan, PlanValidationError } from '../api/plans';
import { appendExerciseToItems, validatePlanForSave } from '../lib/planDraft';
import { patientPlanShareUrl } from '../lib/planLink';
import { errorsByField } from '../lib/templateValidation';
import { ExercisePicker } from './ExercisePicker';
import { TemplateItemEditor } from './TemplateItemEditor';
import './PlanDraftEditor.css';

export interface PlanDraftEditorProps {
  /** The plan draft to edit (e.g. instantiated from a template). */
  draft: PlanDraft;
  /** Valid exercise ids used to validate item references, if known. */
  knownExerciseIds?: ReadonlySet<string>;
  /** Called with the persisted plan after a successful save. */
  onSaved?: (plan: Plan) => void;
}

/**
 * Editor for a plan draft. Reuses the shared item editor so each item's dosage
 * (sets/reps/hold/rest) stays consistent with template editing, and hosts the
 * "Add exercise" picker so doctors can append extra exercises from the library
 * beyond the source template. Appended items are immediately editable and are
 * reflected in the summary and validation. Duplicates are permitted (the picker
 * flags them) so a doctor can deliberately add the same exercise twice.
 *
 * Assigning a patient and pressing "Save plan" persists the customized draft via
 * {@link savePlan} (create, or in-place update when the draft carries an id).
 * Saving is blocked while any field is invalid — the error surfaces inline and
 * nothing is persisted. On success the generated shareable patient link is shown
 * so the doctor can hand the plan off, connecting the builder to the patient view.
 */
export function PlanDraftEditor({ draft, knownExerciseIds, onSaved }: PlanDraftEditorProps) {
  const [items, setItems] = useState<PlanDraftItem[]>(() => draft.items.map((i) => ({ ...i })));
  const [patientName, setPatientName] = useState(draft.patientName ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | undefined>();
  const [savedPlan, setSavedPlan] = useState<Plan | undefined>();

  const existingIds = useMemo(
    () => new Set(items.map((item) => item.exerciseId)),
    [items],
  );

  const draftToSave = useMemo<PlanDraft>(
    () => ({ ...draft, patientName: patientName.trim() || undefined, items }),
    [draft, patientName, items],
  );

  const errors = useMemo(
    () => validatePlanForSave(draftToSave, knownExerciseIds),
    [draftToSave, knownExerciseIds],
  );
  // Item/name errors reflect the live draft immediately; the patient error is
  // only shown after a save attempt so the field isn't flagged before it's used.
  const localErrorMap = useMemo(() => {
    const map = errorsByField(errors);
    if (!submitted) delete map.patientName;
    return map;
  }, [errors, submitted]);

  const fieldErrors = { ...localErrorMap, ...serverErrors };
  const patientError = fieldErrors.patientName;

  const handleItemChange = (index: number, item: TemplateItem) =>
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...item } : it)));

  const handleItemRemove = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleAddExercise = (exercise: Exercise) =>
    setItems((prev) => appendExerciseToItems(prev, exercise));

  const handleSave = async () => {
    setSubmitted(true);
    setServerErrors({});
    setSaveError(undefined);

    // Guard locally so nothing invalid is ever sent or persisted; the offending
    // field's error is already visible inline.
    if (validatePlanForSave(draftToSave, knownExerciseIds).length > 0) return;

    setSaving(true);
    try {
      const saved = await savePlan(draftToSave, knownExerciseIds);
      setSavedPlan(saved);
      onSaved?.(saved);
    } catch (err) {
      if (err instanceof PlanValidationError) {
        setServerErrors(err.fieldErrors);
      } else {
        setSaveError(err instanceof Error ? err.message : 'Failed to save plan');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="plan-draft-editor" data-testid="plan-draft-editor">
      <header className="plan-draft-editor__header">
        <h2>{draft.name}</h2>
        <p className="plan-draft-editor__summary" data-testid="plan-draft-summary">
          {items.length} exercise{items.length === 1 ? '' : 's'} in plan
        </p>
      </header>

      <label className="plan-draft-editor__field">
        <span>Patient</span>
        <input
          type="text"
          value={patientName}
          aria-invalid={patientError ? true : undefined}
          aria-label="Patient name"
          data-testid="plan-draft-patient"
          onChange={(event) => setPatientName(event.target.value)}
        />
        {patientError && (
          <span className="plan-draft-editor__error" role="alert" data-testid="plan-draft-patient-error">
            {patientError}
          </span>
        )}
      </label>

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

      {saveError && (
        <p className="plan-draft-editor__error" role="alert" data-testid="plan-draft-save-error">
          {saveError}
        </p>
      )}

      <button
        type="button"
        className="plan-draft-editor__save"
        data-testid="plan-draft-save"
        disabled={saving}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : 'Save plan'}
      </button>

      {savedPlan && (
        <div className="plan-draft-editor__saved" role="status" data-testid="plan-draft-saved">
          <p>
            Plan saved for <strong>{savedPlan.patientName}</strong>. Share this link with the
            patient:
          </p>
          <a
            className="plan-draft-editor__share-link"
            href={patientPlanShareUrl(savedPlan.id)}
            data-testid="plan-draft-share-link"
          >
            {patientPlanShareUrl(savedPlan.id)}
          </a>
        </div>
      )}
    </section>
  );
}
