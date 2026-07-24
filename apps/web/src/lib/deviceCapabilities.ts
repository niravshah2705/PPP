/**
 * Device-capability detection for the exercise player.
 *
 * The demo runs on a wide range of devices, so a denied camera or a browser
 * without WebXR must never dead-end the patient. These helpers classify the
 * two capabilities the player degrades against — camera capture and immersive
 * WebXR — into small, testable results the UI can branch on.
 */

/**
 * Outcome of probing the camera.
 *
 * - `idle`        — not yet probed.
 * - `granted`     — the user allowed camera access.
 * - `denied`      — the user (or policy) blocked camera access.
 * - `no-camera`   — no camera hardware is available.
 * - `unsupported` — the browser exposes no `getUserMedia` API at all.
 * - `error`       — an unexpected/unknown failure.
 * - `lost`        — a previously-granted camera was disconnected mid-session.
 */
export type CameraStatus =
  | 'idle'
  | 'granted'
  | 'denied'
  | 'no-camera'
  | 'unsupported'
  | 'error'
  | 'lost';

export interface CameraProbeResult {
  status: CameraStatus;
  /** The live stream — present only when `status === 'granted'`. */
  stream?: MediaStream;
}

/** Minimal shape of the WebXR entry point we rely on (avoids @types/webxr). */
interface XrSystemLike {
  isSessionSupported(mode: string): Promise<boolean>;
  requestSession?(mode: string, options?: unknown): Promise<unknown>;
}

/**
 * Outcome of trying to open an immersive WebXR session.
 *
 * - `started`     — the session was granted; `session` is the live XRSession.
 * - `unsupported` — `navigator.xr.requestSession` is unavailable on this device.
 * - `rejected`    — the browser/device refused (e.g. no headset, denied, in use).
 */
export type ImmersiveSessionStatus = 'started' | 'unsupported' | 'rejected';

export interface ImmersiveSessionResult {
  status: ImmersiveSessionStatus;
  /** The live session — present only when `status === 'started'`. */
  session?: unknown;
}

/**
 * Map a `getUserMedia` rejection to a {@link CameraStatus}.
 *
 * Browsers vary in the exact `DOMException.name` they throw, so we group the
 * well-known permission/hardware errors and treat anything else as `error`.
 */
export function classifyCameraError(err: unknown): CameraStatus {
  const name = (err as { name?: string } | null | undefined)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'no-camera';
    default:
      return 'error';
  }
}

/**
 * Request the camera and classify the outcome.
 *
 * Never throws: any failure is mapped to a {@link CameraStatus} so callers can
 * degrade gracefully instead of handling raw exceptions.
 */
export async function requestCamera(
  constraints: MediaStreamConstraints = { video: true },
): Promise<CameraProbeResult> {
  const media = globalThis.navigator?.mediaDevices;
  if (!media || typeof media.getUserMedia !== 'function') {
    return { status: 'unsupported' };
  }
  try {
    const stream = await media.getUserMedia(constraints);
    return { status: 'granted', stream };
  } catch (err) {
    return { status: classifyCameraError(err) };
  }
}

/**
 * Whether the browser can start an immersive WebXR session.
 *
 * Returns `false` (rather than throwing) when `navigator.xr` is absent or the
 * support check rejects, so the player can fall back to the inline 3D demo and
 * hide the Enter-VR affordance.
 */
export async function detectWebXRSupport(
  mode: string = 'immersive-vr',
): Promise<boolean> {
  const xr = (globalThis.navigator as (Navigator & { xr?: XrSystemLike }) | undefined)?.xr;
  if (!xr || typeof xr.isSessionSupported !== 'function') return false;
  try {
    return await xr.isSessionSupported(mode);
  } catch {
    return false;
  }
}

/** Default features requested for an immersive session (best-effort, optional). */
const DEFAULT_XR_SESSION_INIT = {
  optionalFeatures: ['local-floor', 'bounded-floor'],
};

/**
 * Request an immersive WebXR session and classify the outcome.
 *
 * Never throws: an absent `navigator.xr.requestSession` maps to `unsupported`
 * and any rejection (no headset, denied, session already active) maps to
 * `rejected`, so callers can keep the inline 3D demo running instead of
 * handling raw exceptions. Callers hand the returned `session` to
 * `renderer.xr.setSession(...)` to begin presenting.
 */
export async function requestImmersiveSession(
  mode: string = 'immersive-vr',
  options: unknown = DEFAULT_XR_SESSION_INIT,
): Promise<ImmersiveSessionResult> {
  const xr = (globalThis.navigator as (Navigator & { xr?: XrSystemLike }) | undefined)?.xr;
  if (!xr || typeof xr.requestSession !== 'function') return { status: 'unsupported' };
  try {
    const session = await xr.requestSession(mode, options);
    return { status: 'started', session };
  } catch {
    return { status: 'rejected' };
  }
}

/** Human-readable, patient-facing copy for each non-tracking camera state. */
export function cameraNoticeMessage(status: CameraStatus, revoked = false): string {
  if (revoked || status === 'lost') {
    return 'Tracking paused — the camera was disconnected. Your progress is saved; finish by counting your reps manually.';
  }
  switch (status) {
    case 'denied':
      return 'Camera access was blocked. You can still complete this exercise by counting your reps manually.';
    case 'no-camera':
      return 'No camera was detected. Count your reps manually to complete the session.';
    case 'unsupported':
      return "This device can't use camera tracking. Count your reps manually to complete the session.";
    case 'error':
      return "We couldn't start the camera. Count your reps manually to complete the session.";
    default:
      return 'Count your reps manually to complete the session.';
  }
}
