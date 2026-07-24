import { useEffect, useMemo, useState } from 'react';
import type { Exercise } from '../types/exercise';
import type { Plan } from '../types/plan';
import type { PlanDraft, PlanDraftItem, TemplateItem } from '../types/template';
import { savePlan, PlanValidationError } from '../api/plans';
import { usePatientContextOptional } from '../context/PatientContext';
import {
  appendExerciseToItems,
  estimatePlanDurationSeconds,
  formatPlanDuration,
  movePlanItem,
  validatePlanForSave,
} from '../lib/planDraft';
import { patientPlanPath, patientPlanShareUrl } from '../lib/planLink';
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
 * {@link savePlan} (create, or in-place update when the draft carries an id, so
 * editing a loaded plan never creates a duplicate). Saving is blocked while any
 * field is invalid — the error surfaces inline and nothing is persisted. On
 * success the confirmation shows the returned plan id, a copyable shareable
 * patient link, and an "open as patient" shortcut, all pointing at the same
 * route the patient view resolves. A conflict or network failure leaves the
 * draft intact and offers a retry.
 */
export function PlanDraftEditor({ draft, knownExerciseIds, onSaved }: PlanDraftEditorProps) {
  const patientCtx = usePatientContextOptional();
  const [items, setItems] = useState<PlanDraftItem[]>(() => draft.items.map((i) => ({ ...i })));
  const [localPatientName, setLocalPatientName] = useState(draft.patientName ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | undefined>();
  const [savedPlan, setSavedPlan] = useState<Plan | undefined>();
  const [copied, setCopied] = useState(false);

  // The patient comes from the shared header context when it's mounted (the real
  // app), falling back to a local field when this editor is used standalone.
  const usingContext = patientCtx !== null;
  const patientName = usingContext ? patientCtx!.patientName : localPatientName;
  const patientTrimmed = patientName.trim();
  const hasPatient = patientTrimmed.length > 0;

  // Let the header selector guard against silently swapping the patient while
  // this draft is unsaved (see PatientContextSelector). Cleared once saved and
  // when the editor unmounts. Depends on the stable setter (not the memoized
  // context object) so raising the flag doesn't feed back into a re-render loop.
  const setDraftDirty = patientCtx?.setDraftDirty;
  useEffect(() => {
    if (!setDraftDirty) return;
    setDraftDirty(!savedPlan);
    return () => setDraftDirty(false);
  }, [setDraftDirty, savedPlan]);

  const existingIds = useMemo(
    () => new Set(items.map((item) => item.exerciseId)),
    [items],
  );

  const draftToSave = useMemo<PlanDraft>(
    () => ({ ...draft, patientName: patientTrimmed || undefined, items }),
    [draft, patientTrimmed, items],
  );

  // Live estimated total duration; recomputed on every edit so the summary
  // reflects dosage/reorder/remove changes immediately.
  const durationLabel = useMemo(
    () => formatPlanDuration(estimatePlanDurationSeconds(items)),
    [items],
  );
  const isEmpty = items.length === 0;

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

  const handleItemMove = (from: number, to: number) =>
    setItems((prev) => movePlanItem(prev, from, to));

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
      setCopied(false);
      onSaved?.(saved);
    } catch (err) {
      // Validation errors land on the offending controls; a conflict or network
      // failure leaves the draft untouched (still in state) and is surfaced with
      // a retry affordance so the doctor never loses their work.
      if (err instanceof PlanValidationError) {
        setServerErrors(err.fieldErrors);
      } else {
        setSaveError(err instanceof Error ? err.message : 'Failed to save plan');
      }
    } finally {
      setSaving(false);
    }
  };

  const shareUrl = savedPlan ? patientPlanShareUrl(savedPlan.id) : '';

  const handleCopyLink = async () => {
    if (!savedPlan) return;
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
    } catch {
      // Clipboard denied/unavailable: leave the label unchanged rather than
      // claiming a copy that did not happen. The link is still selectable.
      setCopied(false);
    }
  };

  return (
    <section className="plan-draft-editor" data-testid="plan-draft-editor">
      <header className="plan-draft-editor__header">
        <h2>{draft.name}</h2>
        <p className="plan-draft-editor__summary" data-testid="plan-draft-summary">
          {items.length} exercise{items.length === 1 ? '' : 's'} in plan
          {' · est. '}
          <span data-testid="plan-draft-duration">{durationLabel}</span>
        </p>
      </header>

      {usingContext ? (
        <p className="plan-draft-editor__patient-readout" data-testid="plan-draft-patient-readout">
          {hasPatient ? (
            <>
              Building plan for <strong>{patientTrimmed}</strong>
            </>
          ) : (
            'No patient selected.'
          )}
        </p>
      ) : (
        <label className="plan-draft-editor__field">
          <span>Patient</span>
          <input
            type="text"
            value={patientName}
            aria-invalid={patientError ? true : undefined}
            aria-label="Patient name"
            data-testid="plan-draft-patient"
            onChange={(event) => setLocalPatientName(event.target.value)}
          />
          {patientError && (
            <span className="plan-draft-editor__error" role="alert" data-testid="plan-draft-patient-error">
              {patientError}
            </span>
          )}
        </label>
      )}

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
              <div className="plan-draft-editor__reorder" role="group" aria-label={`Reorder item ${index + 1}`}>
                <button
                  type="button"
                  className="plan-draft-editor__move"
                  aria-label={`Move item ${index + 1} up`}
                  data-testid={`plan-item-${index}-move-up`}
                  disabled={index === 0}
                  onClick={() => handleItemMove(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="plan-draft-editor__move"
                  aria-label={`Move item ${index + 1} down`}
                  data-testid={`plan-item-${index}-move-down`}
                  disabled={index === items.length - 1}
                  onClick={() => handleItemMove(index, index + 1)}
                >
                  ↓
                </button>
              </div>
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
        <div className="plan-draft-editor__save-failure" role="alert" data-testid="plan-draft-save-error">
          <p className="plan-draft-editor__error">{saveError}</p>
          {/* The draft is still in state, so retrying re-sends it as-is. */}
          <button
            type="button"
            className="plan-draft-editor__retry"
            data-testid="plan-draft-retry"
            disabled={saving}
            onClick={handleSave}
          >
            Retry save
          </button>
        </div>
      )}

      {!hasPatient && (
        <p className="plan-draft-editor__hint" role="note" data-testid="plan-draft-patient-hint">
          {usingContext
            ? 'Set a patient in the header to save or assign this plan.'
            : 'Assign a patient to save or assign this plan.'}
        </p>
      )}

      <button
        type="button"
        className="plan-draft-editor__save"
        data-testid="plan-draft-save"
        disabled={saving || isEmpty || !hasPatient}
        onClick={handleSave}
      >
        {saving ? 'Saving…' : 'Save plan'}
      </button>

      {savedPlan && (
        <div className="plan-draft-editor__saved" role="status" data-testid="plan-draft-saved">
          <p>
            Plan saved for <strong>{savedPlan.patientName}</strong> (plan id{' '}
            <code data-testid="plan-draft-plan-id">{savedPlan.id}</code>). Share this link with the
            patient:
          </p>
          <div className="plan-draft-editor__share">
            <a
              className="plan-draft-editor__share-link"
              href={shareUrl}
              data-testid="plan-draft-share-link"
            >
              {shareUrl}
            </a>
            <button
              type="button"
              className="plan-draft-editor__copy"
              data-testid="plan-draft-copy-link"
              onClick={handleCopyLink}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
          <a
            className="plan-draft-editor__open-as-patient"
            href={patientPlanPath(savedPlan.id)}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="plan-draft-open-as-patient"
          >
            Open as patient
          </a>
        </div>
      )}
    </section>
  );
}
