import { useMemo, useState } from 'react';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { PlanDraftEditor } from '../components/PlanDraftEditor';
import { PlanList } from '../components/PlanList';
import { usePlans } from '../hooks/usePlans';
import {
  duplicatePlanToDraft,
  filterPlansByQuery,
  planToEditDraft,
} from '../lib/planList';
import { patientPlanShareUrl } from '../lib/planLink';
import type { Plan } from '../types/plan';
import type { PlanDraft } from '../types/template';
import './PlansPage.css';

type Mode =
  | { kind: 'list' }
  | { kind: 'builder'; draft: PlanDraft; editing: boolean };

/**
 * Route `/doctor/plans`.
 *
 * The doctor's plan-manage view: a newest-first list of every plan with
 * client-side search by patient name and source template. Each row can be
 * opened in the builder along the edit path (saving updates the same plan),
 * have its patient deep link copied, or be duplicated into a new draft with the
 * patient cleared for reassignment.
 */
export function PlansPage() {
  const { status, plans, error } = usePlans();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [copiedPlanId, setCopiedPlanId] = useState<string | undefined>();

  const visible = useMemo(() => filterPlansByQuery(plans, query), [plans, query]);

  const handleOpen = (plan: Plan) =>
    setMode({ kind: 'builder', draft: planToEditDraft(plan), editing: true });

  const handleDuplicate = (plan: Plan) =>
    setMode({ kind: 'builder', draft: duplicatePlanToDraft(plan), editing: false });

  const handleCopyLink = async (plan: Plan) => {
    const url = patientPlanShareUrl(plan.id);
    try {
      await navigator.clipboard?.writeText(url);
      setCopiedPlanId(plan.id);
    } catch {
      // Clipboard denied/unavailable: leave the button label unchanged rather
      // than claiming a copy that did not happen.
    }
  };

  if (mode.kind === 'builder') {
    const { draft, editing } = mode;
    return (
      <main className="plans-page" data-testid="plans-page">
        <header className="plans-page__header">
          <h1 className="plans-page__title">{editing ? 'Edit plan' : 'New plan'}</h1>
          <button type="button" data-testid="plans-back" onClick={() => setMode({ kind: 'list' })}>
            Back to plans
          </button>
        </header>
        <p className="plans-page__builder-context" data-testid="plans-builder-context">
          {editing ? (
            <>
              Editing plan for <strong>{draft.patientName}</strong>
              {draft.templateName ? ` (from ${draft.templateName})` : ''}. Saving updates this plan.
            </>
          ) : (
            <>
              New draft{draft.templateName ? ` from ${draft.templateName}` : ''}.{' '}
              <span data-testid="plans-patient-cleared">
                Assign a patient — the original patient was cleared.
              </span>
            </>
          )}
        </p>
        <PlanDraftEditor key={draft.id ?? 'new'} draft={draft} />
      </main>
    );
  }

  return (
    <main className="plans-page" data-testid="plans-page">
      <header className="plans-page__header">
        <h1 className="plans-page__title">Plans</h1>
      </header>

      {status === 'loading' && (
        <p className="plans-page__loading" data-testid="plans-loading">
          Loading plans…
        </p>
      )}

      {status === 'error' && (
        <InlineErrorCard
          title="Couldn’t load plans"
          message={error ?? 'Something went wrong loading plans. Please try again.'}
        />
      )}

      {status === 'empty' && (
        <p className="plans-page__empty" data-testid="plans-empty">
          No plans yet. Create one from a template to get started.
        </p>
      )}

      {status === 'ready' && (
        <>
          <label className="plans-page__search">
            <span className="plans-page__search-label">Search</span>
            <input
              type="search"
              data-testid="plans-search"
              placeholder="Search by patient or template"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <PlanList
            plans={visible}
            onOpen={handleOpen}
            onDuplicate={handleDuplicate}
            onCopyLink={handleCopyLink}
            copiedPlanId={copiedPlanId}
          />
        </>
      )}
    </main>
  );
}
