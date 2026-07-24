import { describe, expect, it } from 'vitest';
import type { Landmark } from '../../src/lib/repCounter';
import { POSE_LANDMARK_COUNT } from '../../src/lib/poseLandmarker';
import {
  clearOverlay,
  drawSkeleton,
  type Canvas2DLike,
} from '../../src/lib/skeletonOverlay';

interface Call {
  op: string;
  args: number[];
}

/** A recording fake of the small Canvas 2D subset the overlay uses. */
function fakeCtx(width = 100, height = 200) {
  const calls: Call[] = [];
  const ctx: Canvas2DLike = {
    canvas: { width, height },
    clearRect: (...a) => calls.push({ op: 'clearRect', args: a }),
    beginPath: () => calls.push({ op: 'beginPath', args: [] }),
    moveTo: (...a) => calls.push({ op: 'moveTo', args: a }),
    lineTo: (...a) => calls.push({ op: 'lineTo', args: a }),
    arc: (...a) => calls.push({ op: 'arc', args: a }),
    stroke: () => calls.push({ op: 'stroke', args: [] }),
    fill: () => calls.push({ op: 'fill', args: [] }),
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
  };
  return { ctx, calls };
}

/** A full 33-landmark pose at a fixed confidence. */
function fullPose(confidence = 1): Landmark[] {
  return Array.from({ length: POSE_LANDMARK_COUNT }, (_, i) => ({
    x: (i % 10) / 10,
    y: (i % 10) / 10,
    confidence,
  }));
}

describe('clearOverlay', () => {
  it('clears the full canvas', () => {
    const { ctx, calls } = fakeCtx(100, 200);
    clearOverlay(ctx);
    expect(calls[0]).toEqual({ op: 'clearRect', args: [0, 0, 100, 200] });
  });
});

describe('drawSkeleton', () => {
  it('clears then draws bones (stroke) and joints (fill) for a visible pose', () => {
    const { ctx, calls } = fakeCtx();
    drawSkeleton(ctx, fullPose(1), { mirror: false });
    expect(calls[0].op).toBe('clearRect');
    expect(calls.some((c) => c.op === 'stroke')).toBe(true);
    expect(calls.filter((c) => c.op === 'fill')).toHaveLength(POSE_LANDMARK_COUNT);
  });

  it('scales normalised coords to the canvas size', () => {
    const { ctx, calls } = fakeCtx(100, 200);
    // A single joint at (0.5, 0.25) — no bones (only one point).
    drawSkeleton(ctx, [{ x: 0.5, y: 0.25, confidence: 1 }], { mirror: false });
    const arc = calls.find((c) => c.op === 'arc');
    expect(arc?.args[0]).toBeCloseTo(50); // 0.5 * 100
    expect(arc?.args[1]).toBeCloseTo(50); // 0.25 * 200
  });

  it('mirrors X for a selfie view', () => {
    const { ctx, calls } = fakeCtx(100, 200);
    drawSkeleton(ctx, [{ x: 0.2, y: 0.5, confidence: 1 }], { mirror: true });
    const arc = calls.find((c) => c.op === 'arc');
    expect(arc?.args[0]).toBeCloseTo(80); // (1 - 0.2) * 100
  });

  it('skips landmarks below the confidence floor', () => {
    const { ctx, calls } = fakeCtx();
    drawSkeleton(ctx, fullPose(0.1), { mirror: false, minConfidence: 0.5 });
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
    expect(calls.some((c) => c.op === 'fill')).toBe(false);
  });

  it('skips a bone when either endpoint is low-confidence', () => {
    const { ctx, calls } = fakeCtx();
    // Landmarks 11 & 12 form a bone; make 11 confident, 12 not.
    const pose = fullPose(0.1);
    pose[11] = { x: 0.4, y: 0.4, confidence: 1 };
    drawSkeleton(ctx, pose, { mirror: false, minConfidence: 0.5 });
    // 11 is a visible joint (a fill), but no bone can be stroked (its partners are hidden).
    expect(calls.filter((c) => c.op === 'fill')).toHaveLength(1);
    expect(calls.some((c) => c.op === 'stroke')).toBe(false);
  });

  it('only clears for an empty pose', () => {
    const { ctx, calls } = fakeCtx();
    drawSkeleton(ctx, [], { mirror: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].op).toBe('clearRect');
  });
});
