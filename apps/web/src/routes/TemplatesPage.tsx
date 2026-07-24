import { useCallback, useEffect, useState } from 'react';
import type { PlanDraft, Template } from '../types/template';
import { listTemplates } from '../api/templates';
import { mergePlanDrafts } from '../lib/planDraft';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplateGallery } from '../components/TemplateGallery';
import { PlanDraftEditor } from '../components/PlanDraftEditor';
import { usePatientContextOptional } from '../context/PatientContext';

type Mode = { kind: 'gallery' } | { kind: 'create' } | { kind: 'edit'; template: Template };

/**
 * Template management page at `/doctor/templates`. Shows the gallery, lets the
 * doctor create a new template or edit an existing one, and refreshes the
 * gallery after a save so new/updated templates appear immediately. "Use this
 * template" instantiates a fully-local editable plan draft via the
 * template-to-draft flow, bound to the current patient.
 *
 * Instantiating a second template while an unsaved draft exists never silently
 * discards work: it prompts the doctor to replace the current draft or merge the
 * new template's exercises into it (or cancel and keep editing). Once the draft
 * is saved, re-instantiating simply starts fresh — there is no unsaved work to
 * protect.
 */
export function TemplatesPage() {
  const patientCtx = usePatientContextOptional();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [mode, setMode] = useState<Mode>({ kind: 'gallery' });
  // The header owns the patient in the integrated app; fall back to a local
  // field only when this page is used without the shared context (e.g. tests).
  const [localPatient, setLocalPatient] = useState('');
  const currentPatient = patientCtx ? patientCtx.patient : localPatient;
  const [draft, setDraft] = useState<PlanDraft | undefined>();
  // Incoming draft awaiting a replace/merge/cancel decision when one is already
  // in progress and unsaved.
  const [pending, setPending] = useState<PlanDraft | undefined>();
  // Whether the active draft has been persisted; a saved draft carries no
  // unsaved work, so re-instantiating need not prompt.
  const [saved, setSaved] = useState(false);
  // Bumped whenever the active draft is (re)set so the editor remounts and
  // re-seeds from the new draft's items on replace/merge.
  const [draftSeq, setDraftSeq] = useState(0);

  const applyDraft = useCallback((next: PlanDraft) => {
    setDraft(next);
    setSaved(false);
    setPending(undefined);
    setDraftSeq((n) => n + 1);
  }, []);

  const handleUse = useCallback(
    (incoming: PlanDraft) => {
      // Guard unsaved work: prompt before discarding an in-progress draft.
      if (draft && !saved) {
        setPending(incoming);
        return;
      }
      applyDraft(incoming);
    },
    [draft, saved, applyDraft],
  );

  const handleReplace = useCallback(() => {
    if (pending) applyDraft(pending);
  }, [pending, applyDraft]);

  const handleMerge = useCallback(() => {
    if (pending && draft) applyDraft(mergePlanDrafts(draft, pending));
  }, [pending, draft, applyDraft]);

  const handleCancelPending = useCallback(() => setPending(undefined), []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setStatus('loading');
    try {
      const list = await listTemplates(signal);
      if (signal?.aborted) return;
      setTemplates(list);
      setStatus('ready');
    } catch {
      if (signal?.aborted) return;
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const handleSaved = async (saved: Template) => {
    await refresh();
    setMode({ kind: 'gallery' });
    // Keep focus context: surface the just-saved template name in the heading.
    setTemplates((prev) =>
      prev.some((t) => t.id === saved.id) ? prev : [...prev, saved],
    );
  };

  return (
    <section className="templates-page">
      <header className="templates-page__header">
        <h1>Templates</h1>
        {mode.kind === 'gallery' && (
          <button type="button" data-testid="new-template" onClick={() => setMode({ kind: 'create' })}>
            New template
          </button>
        )}
        {mode.kind !== 'gallery' && (
          <button type="button" data-testid="cancel-edit" onClick={() => setMode({ kind: 'gallery' })}>
            Back to gallery
          </button>
        )}
      </header>

      {mode.kind === 'gallery' && (
        <>
          {status === 'loading' && <p data-testid="templates-loading">Loading templates…</p>}
          {status === 'error' && (
            <p role="alert" data-testid="templates-error">
              Failed to load templates.
            </p>
          )}
          {status === 'ready' && (
            <>
              {patientCtx ? (
                <p className="templates-page__patient" data-testid="templates-current-patient-readout">
                  {currentPatient
                    ? `Building plan for ${currentPatient}`
                    : 'Choose a patient in the header to build for.'}
                </p>
              ) : (
                <label className="templates-page__patient">
                  <span>Building plan for</span>
                  <input
                    type="text"
                    data-testid="templates-current-patient"
                    aria-label="Current patient"
                    placeholder="Patient name"
                    value={localPatient}
                    onChange={(event) => setLocalPatient(event.target.value)}
                  />
                </label>
              )}
              <TemplateGallery
                templates={templates}
                currentPatientName={currentPatient}
                onUse={handleUse}
                onEdit={(template) => setMode({ kind: 'edit', template })}
              />
            </>
          )}

          {pending && (
            <div
              className="templates-page__replace-prompt"
              role="alertdialog"
              aria-label="Replace or merge the unsaved draft"
              data-testid="draft-replace-prompt"
            >
              <p>
                You have an unsaved plan draft. Replace it with “{pending.name}”, or merge
                that template’s exercises into your current draft?
              </p>
              <div className="templates-page__replace-actions">
                <button type="button" data-testid="draft-replace-confirm" onClick={handleReplace}>
                  Replace draft
                </button>
                <button type="button" data-testid="draft-merge-confirm" onClick={handleMerge}>
                  Merge exercises
                </button>
                <button type="button" data-testid="draft-replace-cancel" onClick={handleCancelPending}>
                  Keep editing
                </button>
              </div>
            </div>
          )}

          {draft && (
            <>
              <p data-testid="instantiated-draft">
                Started a plan draft from “{draft.name}” with {draft.items.length} exercise
                {draft.items.length === 1 ? '' : 's'}.
              </p>
              <PlanDraftEditor
                key={draftSeq}
                draft={draft}
                onSaved={() => setSaved(true)}
              />
            </>
          )}
        </>
      )}

      {mode.kind === 'create' && <TemplateEditor onSaved={handleSaved} />}
      {mode.kind === 'edit' && (
        <TemplateEditor template={mode.template} onSaved={handleSaved} />
      )}
    </section>
  );
}
