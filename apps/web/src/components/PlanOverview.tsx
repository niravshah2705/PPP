import type { SharedPlan } from '../types/sharedPlan';
import { buildPlanOverview } from '../lib/planOverview';
import { InlineErrorCard } from './InlineErrorCard';
import './PlanOverview.css';

export interface PlanOverviewProps {
  /** The loaded patient-facing plan (from `/patient?planId=`). */
  plan: SharedPlan;
  /** Invoked when the patient taps Start — hands off to the session player. */
  onStart: () => void;
}

/**
 * Read-only overview a patient sees before starting their assigned plan
 * (NIR-765). It presents everything the patient needs to understand the session
 * up front — their name, each exercise with its `sets × reps/hold` target and
 * guidance note, and the estimated total duration — plus a single **Start**
 * button. It is display-only: there are no controls that mutate the plan.
 *
 * A plan with no exercises renders a clear "no exercises assigned" message
 * instead of an empty list with a dead Start button.
 */
export function PlanOverview({ plan, onStart }: PlanOverviewProps) {
  const overview = buildPlanOverview(plan);

  return (
    <section
      className="plan-overview"
      data-testid="plan-overview"
      aria-labelledby="plan-overview-title"
    >
      <header className="plan-overview__header">
        <h1 id="plan-overview-title" className="plan-overview__title">
          Your exercise plan
        </h1>
        {overview.patientName && (
          <p className="plan-overview__patient" data-testid="plan-overview-patient">
            Prepared for <strong>{overview.patientName}</strong>
          </p>
        )}
      </header>

      {overview.exerciseCount === 0 ? (
        <InlineErrorCard
          title="No exercises assigned"
          message="This plan has no exercises yet. Ask your clinician to add some."
        />
      ) : (
        <>
          <p className="plan-overview__summary" data-testid="plan-overview-summary">
            {overview.exerciseCount} exercise{overview.exerciseCount === 1 ? '' : 's'}
            {' · about '}
            {overview.totalDurationLabel}
          </p>

          <ol className="plan-overview__list" data-testid="plan-overview-list">
            {overview.items.map((item, index) => (
              <li
                key={`${item.exerciseId}-${index}`}
                className="plan-overview__item"
                data-testid="plan-overview-item"
              >
                <div className="plan-overview__item-head">
                  <span className="plan-overview__item-name">{item.name}</span>
                  <span
                    className="plan-overview__item-dosage"
                    data-testid="plan-overview-dosage"
                  >
                    {item.dosageLabel}
                  </span>
                </div>
                {item.note && (
                  <p className="plan-overview__item-note" data-testid="plan-overview-note">
                    {item.note}
                  </p>
                )}
              </li>
            ))}
          </ol>

          <p className="plan-overview__total" data-testid="plan-overview-duration">
            Estimated total duration:{' '}
            <strong>{overview.totalDurationLabel}</strong>
          </p>

          <button
            type="button"
            className="plan-overview__start"
            data-testid="plan-overview-start"
            onClick={onStart}
          >
            Start
          </button>
        </>
      )}
    </section>
  );
}
