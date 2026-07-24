import { useSearchParams } from 'react-router-dom';
import { PatientPlanPlayer } from '../components/PatientPlanPlayer';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { usePlan } from '../hooks/usePlan';

/**
 * Patient entry point at `/patient?planId=` — the exact route the shareable
 * doctor→patient link ({@link patientPlanPath}) resolves to.
 *
 * It loads the plan behind the `planId` query param and hands it to the
 * {@link PatientPlanPlayer}, which owns the session lifecycle (resume/start,
 * per-exercise recording, finalise). Missing/unknown plans render a compact
 * error instead of a blank page.
 */
export function PatientPlanPage() {
  const [params] = useSearchParams();
  const planId = params.get('planId') ?? undefined;
  const { status, plan, error } = usePlan(planId);

  if (!planId) {
    return (
      <InlineErrorCard
        title="No plan selected"
        message="This link is missing a plan. Ask your clinician for the correct link."
      />
    );
  }

  if (status === 'loading') return <p>Loading your plan…</p>;
  if (status === 'ready' && plan) return <PatientPlanPlayer plan={plan} />;

  if (status === 'not-found') {
    return (
      <InlineErrorCard
        title="Plan not found"
        message={`No plan found for "${planId}". Ask your clinician for the correct link.`}
      />
    );
  }

  return (
    <InlineErrorCard
      title="Couldn’t load your plan"
      message={error ?? 'Please try again in a moment.'}
    />
  );
}
