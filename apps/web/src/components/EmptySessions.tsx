import { patientPlanShareUrl } from '../lib/planLink';
import './EmptySessions.css';

export interface EmptySessionsProps {
  planId: string;
}

/**
 * Empty state shown when a plan has no sessions yet. Instead of a blank
 * dashboard it guides the doctor to share the plan link so the patient can
 * start, and surfaces the exact link to copy.
 */
export function EmptySessions({ planId }: EmptySessionsProps) {
  const shareUrl = patientPlanShareUrl(planId);
  return (
    <div className="empty-sessions" data-testid="empty-sessions" role="status">
      <h2 className="empty-sessions__title">No sessions yet</h2>
      <p className="empty-sessions__body">
        This patient hasn’t completed any sessions for this plan. Share the plan
        link below so they can start — results will appear here as they train.
      </p>
      <a className="empty-sessions__link" href={shareUrl} data-testid="empty-plan-link">
        {shareUrl}
      </a>
    </div>
  );
}
