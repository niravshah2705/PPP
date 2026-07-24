import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PatientPlanPlayer } from '../components/PatientPlanPlayer';
import { PlanOverview } from '../components/PlanOverview';
import { InlineErrorCard } from '../components/InlineErrorCard';
import { usePatientPlan } from '../hooks/usePatientPlan';

/**
 * Patient entry point at `/patient` — the exact route the shareable
 * doctor→patient link ({@link patientPlanPath}) resolves to.
 *
 * It resolves the assigned plan from the URL — a `planId` directly, or a
 * `patientName` mapped to that patient's most recent plan — and first shows the
 * read-only {@link PlanOverview} (patient name, exercises with `sets × reps/hold`
 * targets and notes, estimated total duration, and a Start button). Starting
 * hands the same plan to the {@link PatientPlanPlayer}, which owns the session
 * lifecycle (resume/start, per-exercise recording, finalise).
 *
 * A missing/unknown plan renders a friendly empty state instead of a blank page
 * or a crash.
 */
export function PatientPlanPage() {
  const [params] = useSearchParams();
  const planId = params.get('planId') ?? undefined;
  const patientName = params.get('patientName') ?? undefined;
  const { status, plan, error } = usePatientPlan({ planId, patientName });
  const [started, setStarted] = useState(false);

  if (status === 'no-selection') {
    return (
      <InlineErrorCard
        title="No plan selected"
        message="This link is missing a plan. Ask your clinician for the correct link."
      />
    );
  }

  if (status === 'loading') return <p>Loading your plan…</p>;

  if (status === 'not-found') {
    return (
      <InlineErrorCard
        title="Plan not found"
        message={
          patientName && !planId
            ? `No plan found for "${patientName}". Ask your clinician for the correct link.`
            : 'We couldn’t find that plan. Ask your clinician for the correct link.'
        }
      />
    );
  }

  if (status !== 'ready' || !plan) {
    return (
      <InlineErrorCard
        title="Couldn’t load your plan"
        message={error ?? 'Please try again in a moment.'}
      />
    );
  }

  if (!started) {
    return <PlanOverview plan={plan} onStart={() => setStarted(true)} />;
  }

  return <PatientPlanPlayer plan={plan} autoStart />;
}
