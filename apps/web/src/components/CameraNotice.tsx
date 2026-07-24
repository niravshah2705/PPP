import { cameraNoticeMessage, type CameraStatus } from '../lib/deviceCapabilities';
import './CameraNotice.css';

export interface CameraNoticeProps {
  status: CameraStatus;
  /** True when a previously-granted camera was lost mid-session. */
  revoked?: boolean;
  /** Optional retry handler (offered when the patient can re-grant access). */
  onRetry?: () => void;
}

/**
 * Clear, non-blocking notice shown when camera tracking is unavailable.
 *
 * It explains why tracking is off and reassures the patient that they can still
 * finish by counting reps manually — it never blocks progression.
 */
export function CameraNotice({ status, revoked = false, onRetry }: CameraNoticeProps) {
  const retryable = revoked || status === 'denied' || status === 'lost' || status === 'error';
  return (
    <div className="camera-notice" role="status" data-testid="camera-notice" data-status={status}>
      <span className="camera-notice__icon" aria-hidden="true">
        {revoked || status === 'lost' ? '⏸' : '📷'}
      </span>
      <p className="camera-notice__message">{cameraNoticeMessage(status, revoked)}</p>
      {onRetry && retryable && (
        <button
          type="button"
          className="camera-notice__retry"
          data-testid="camera-retry-button"
          onClick={onRetry}
        >
          Retry camera
        </button>
      )}
    </div>
  );
}
