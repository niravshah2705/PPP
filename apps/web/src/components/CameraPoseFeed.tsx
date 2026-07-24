import { usePoseTracking, type UsePoseTrackingOptions } from '../hooks/usePoseTracking';
import './CameraPoseFeed.css';

export interface CameraPoseFeedProps
  extends Omit<UsePoseTrackingOptions, 'active'> {
  /** Whether the feed should run (defaults to true when a stream is present). */
  active?: boolean;
}

/**
 * Live camera + MediaPipe skeleton overlay (NIR-770).
 *
 * Renders the granted camera stream into a `<video>` with a `<canvas>` overlay
 * on top, and drives {@link usePoseTracking} to paint a real-time 33-point
 * skeleton and emit landmarks to `onLandmarks`. Camera permission is owned by
 * the parent (this only consumes the stream), so this component focuses on the
 * feed's own states:
 *
 * - `searching` — a reliable pose isn't visible (low light / no person / partly
 *   out of frame): a non-blocking "position yourself in frame" hint is shown
 *   instead of drawing an unreliable skeleton.
 * - `loading`   — the WASM runtime is initialising.
 * - `error`     — inference couldn't start; the raw camera view remains so the
 *   session is never blocked.
 */
export function CameraPoseFeed({ active, stream, ...rest }: CameraPoseFeedProps) {
  const isActive = active ?? stream !== null;
  const { videoRef, canvasRef, status, detection } = usePoseTracking({
    ...rest,
    stream,
    active: isActive,
  });

  return (
    <div
      className="camera-pose-feed"
      data-testid="camera-pose-feed"
      data-status={status}
      data-detection={detection}
    >
      <video
        ref={videoRef}
        className="camera-pose-feed__video"
        data-testid="camera-pose-video"
        autoPlay
        muted
        playsInline
      />
      <canvas
        ref={canvasRef}
        className="camera-pose-feed__overlay"
        data-testid="camera-pose-overlay"
        aria-hidden="true"
      />

      {status === 'loading' && (
        <div className="camera-pose-feed__banner" data-testid="pose-loading" role="status">
          Starting pose tracking…
        </div>
      )}

      {status === 'searching' && (
        <div className="camera-pose-feed__banner" data-testid="pose-hint" role="status">
          Position yourself in frame — make sure your whole body is visible and
          well lit.
        </div>
      )}

      {status === 'error' && (
        <div className="camera-pose-feed__banner" data-testid="pose-error" role="status">
          Pose tracking is unavailable on this device — the camera view is still
          shown.
        </div>
      )}
    </div>
  );
}
