/**
 * Recorded-landmark fixture helpers for the rep-counter tests (NIR-771).
 *
 * Rather than hand-pick raw coordinates, these builders place three landmarks so
 * the interior angle at the vertex equals an exact target — the rep counter then
 * derives that angle back from the coordinates, exercising the real
 * `computeJointAngle` path. This keeps the fixtures deterministic and readable
 * while still feeding the module true landmark data.
 */

import type { AngleJoint } from '../../src/types/exercise';
import type { Landmark, LandmarkFrame } from '../../src/lib/repCounter';

/** Landmark indices used by the fixtures (a left-arm-ish triplet). */
export const JOINT: AngleJoint = { from: 11, vertex: 13, to: 15 };

const VERTEX = { x: 0.5, y: 0.5 };
const ARM = 0.2; // arm length in normalised units

/**
 * Build a single frame whose angle at {@link JOINT}.vertex equals `angleDeg`.
 *
 * The `from` arm points straight up; the `to` arm is rotated by `angleDeg`, so
 * the interior angle between them is exactly `angleDeg`. A per-frame
 * `confidence` is stamped on the three relevant landmarks; `timestamp` (ms) is
 * attached when provided (needed for hold-second accumulation).
 */
export function frameAtAngle(
  angleDeg: number,
  opts: { confidence?: number; timestamp?: number } = {},
): LandmarkFrame {
  const confidence = opts.confidence ?? 1;
  const rad = (angleDeg * Math.PI) / 180;

  const from: Landmark = { x: VERTEX.x, y: VERTEX.y - ARM, confidence };
  const vertex: Landmark = { x: VERTEX.x, y: VERTEX.y, confidence };
  const to: Landmark = {
    x: VERTEX.x + ARM * Math.sin(rad),
    y: VERTEX.y - ARM * Math.cos(rad),
    confidence,
  };

  // Fill an array up to the highest index; unrelated points are inert filler.
  const landmarks: Landmark[] = [];
  const max = Math.max(JOINT.from, JOINT.vertex, JOINT.to);
  for (let i = 0; i <= max; i += 1) landmarks.push({ x: 0, y: 0, confidence: 1 });
  landmarks[JOINT.from] = from;
  landmarks[JOINT.vertex] = vertex;
  landmarks[JOINT.to] = to;

  return opts.timestamp === undefined
    ? { landmarks }
    : { landmarks, timestamp: opts.timestamp };
}

/**
 * Build a sequence of frames from a list of target angles. Options set a common
 * confidence and/or start a monotonic timestamp clock at `fps` frames/sec.
 */
export function frames(
  angles: readonly number[],
  opts: { confidence?: number; fps?: number; startMs?: number } = {},
): LandmarkFrame[] {
  const { confidence, fps, startMs = 0 } = opts;
  const dt = fps ? 1000 / fps : undefined;
  return angles.map((angle, i) =>
    frameAtAngle(angle, {
      confidence,
      timestamp: dt === undefined ? undefined : startMs + i * dt,
    }),
  );
}

/** Repeat an angle `n` times — useful for dwelling at an extreme long enough to
 * clear a moving-average window. */
export function hold(angle: number, n: number): number[] {
  return Array.from({ length: n }, () => angle);
}
