/**
 * Pure 2D skeleton-overlay drawing (NIR-770).
 *
 * Draws the MediaPipe pose landmarks + {@link POSE_CONNECTIONS} bones onto a 2D
 * canvas context. The drawing is a pure function of `(context, landmarks,
 * style)`: it only calls a small, structural subset of the Canvas 2D API
 * ({@link Canvas2DLike}), so it can be verified against a fake recording context
 * in tests — no real DOM/canvas required.
 *
 * Landmarks are image-normalised ([0, 1]); they are scaled to the context's
 * canvas size here. Points/bones below the confidence floor are skipped so a
 * flickering low-confidence limb never paints a misleading skeleton. `mirror`
 * flips X to match a selfie-view video (the default for a front camera).
 */

import type { Landmark } from './repCounter';
import { POSE_CONNECTIONS } from './poseLandmarker';

/** The minimal Canvas 2D surface the overlay draws through (fake-able in tests). */
export interface Canvas2DLike {
  readonly canvas: { width: number; height: number };
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  stroke(): void;
  fill(): void;
  lineWidth: number;
  // Widened to the DOM union so a real CanvasRenderingContext2D is assignable;
  // the overlay only ever assigns plain colour strings.
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

/** Visual style for the skeleton overlay (all optional; sensible defaults). */
export interface SkeletonStyle {
  /** Bone line width in px. */
  lineWidth?: number;
  /** Bone colour. */
  strokeStyle?: string;
  /** Joint dot radius in px. */
  pointRadius?: number;
  /** Joint dot colour. */
  fillStyle?: string;
  /** Skip landmarks whose confidence is below this (default 0.5). */
  minConfidence?: number;
  /** Flip horizontally for a selfie-view video (default true). */
  mirror?: boolean;
}

const DEFAULTS: Required<SkeletonStyle> = {
  lineWidth: 4,
  strokeStyle: '#22d3ee',
  pointRadius: 5,
  fillStyle: '#f0fdfa',
  minConfidence: 0.5,
  mirror: true,
};

function projectX(x: number, width: number, mirror: boolean): number {
  return (mirror ? 1 - x : x) * width;
}

function isVisible(lm: Landmark | undefined, min: number): lm is Landmark {
  return !!lm && (lm.confidence ?? 1) >= min;
}

/** Clear the whole overlay (used between frames and when tracking pauses). */
export function clearOverlay(ctx: Canvas2DLike, width?: number, height?: number): void {
  ctx.clearRect(0, 0, width ?? ctx.canvas.width, height ?? ctx.canvas.height);
}

/**
 * Draw the skeleton for one frame of landmarks onto `ctx`.
 *
 * Clears the canvas, then strokes every {@link POSE_CONNECTIONS} bone whose both
 * endpoints clear the confidence floor, and fills a dot at every visible joint.
 * A frame with no visible landmarks simply leaves a cleared canvas.
 */
export function drawSkeleton(
  ctx: Canvas2DLike,
  landmarks: readonly Landmark[],
  style: SkeletonStyle = {},
): void {
  const s = { ...DEFAULTS, ...style };
  const { width, height } = ctx.canvas;

  clearOverlay(ctx, width, height);
  if (landmarks.length === 0) return;

  // Bones.
  ctx.lineWidth = s.lineWidth;
  ctx.strokeStyle = s.strokeStyle;
  for (const { start, end } of POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!isVisible(a, s.minConfidence) || !isVisible(b, s.minConfidence)) continue;
    ctx.beginPath();
    ctx.moveTo(projectX(a.x, width, s.mirror), a.y * height);
    ctx.lineTo(projectX(b.x, width, s.mirror), b.y * height);
    ctx.stroke();
  }

  // Joints.
  ctx.fillStyle = s.fillStyle;
  for (const lm of landmarks) {
    if (!isVisible(lm, s.minConfidence)) continue;
    ctx.beginPath();
    ctx.arc(projectX(lm.x, width, s.mirror), lm.y * height, s.pointRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
