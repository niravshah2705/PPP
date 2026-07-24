import { formatDate } from '../lib/sessionSummary';
import type { Plan } from '../types/plan';
import './PlanList.css';

export interface PlanListProps {
  plans: Plan[];
  /** Open a plan in the builder along the edit path. */
  onOpen: (plan: Plan) => void;
  /** Duplicate a plan into a new draft (patient cleared). */
  onDuplicate: (plan: Plan) => void;
  /** Copy the plan's patient deep link to the clipboard. */
  onCopyLink: (plan: Plan) => void;
  /** Id of the plan whose link was just copied (drives transient feedback). */
  copiedPlanId?: string;
}

/**
 * Table of all plans for the doctor's manage view. Each row shows the patient,
 * source template, last-updated date, and item count, with actions to open the
 * plan in the builder, copy its patient link, or duplicate it. Rows are
 * expected pre-sorted newest-first by the caller.
 */
export function PlanList({ plans, onOpen, onDuplicate, onCopyLink, copiedPlanId }: PlanListProps) {
  if (plans.length === 0) {
    return (
      <p className="plan-list__empty" data-testid="plan-list-empty">
        No plans match your search.
      </p>
    );
  }

  return (
    <table className="plan-list" data-testid="plan-list">
      <thead>
        <tr>
          <th scope="col">Patient</th>
          <th scope="col">Template</th>
          <th scope="col">Updated</th>
          <th scope="col">Exercises</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {plans.map((plan) => (
          <tr key={plan.id} className="plan-list__row" data-testid={`plan-row-${plan.id}`}>
            <td className="plan-list__patient" data-testid={`plan-patient-${plan.id}`}>
              {plan.patientName}
            </td>
            <td className="plan-list__template" data-testid={`plan-template-${plan.id}`}>
              {plan.templateName ?? '—'}
            </td>
            <td className="plan-list__updated" data-testid={`plan-updated-${plan.id}`}>
              {formatDate(plan.updatedAt)}
            </td>
            <td className="plan-list__count" data-testid={`plan-count-${plan.id}`}>
              {plan.items.length}
            </td>
            <td className="plan-list__actions">
              <button
                type="button"
                data-testid={`plan-open-${plan.id}`}
                onClick={() => onOpen(plan)}
              >
                Open
              </button>
              <button
                type="button"
                data-testid={`plan-copy-${plan.id}`}
                onClick={() => onCopyLink(plan)}
              >
                {copiedPlanId === plan.id ? 'Copied!' : 'Copy link'}
              </button>
              <button
                type="button"
                data-testid={`plan-duplicate-${plan.id}`}
                onClick={() => onDuplicate(plan)}
              >
                Duplicate
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
