import { describe, expect, it } from 'vitest';
import type { Landmark, LandmarkFrame } from '../../src/lib/repCounter';
import {
  DEFAULT_TARGET_FPS,
  createPoseStreamState,
  frameConfidence,
  observePoseFrame,
  shouldSample,
  type PoseStreamState,
} from '../../src/lib/poseStream';

function frame(confidence: number, n = 4): LandmarkFrame {
  const landmarks: Landmark[] = Array.from({ length: n }, (_, i) => ({
    x: i / n,
    y: i / n,
    confidence,
  }));
  return { landmarks, timestamp: 0 };
}

/** Feed a sequence of frames through the reducer, returning the last result. */
function run(frames: Array<LandmarkFrame | null>, config = {}) {
  let state: PoseStreamState = createPoseStreamState();
  let last = observePoseFrame(state, frames[0] ?? null, config);
  state = last.state;
  for (const f of frames.slice(1)) {
    last = observePoseFrame(state, f, config);
    state = last.state;
  }
  return { last, state };
}

describe('frameConfidence', () => {
  it('averages per-landmark confidence', () => {
    expect(
      frameConfidence({
        landmarks: [{ x: 0, y: 0, confidence: 0.4 }, { x: 0, y: 0, confidence: 0.6 }],
      }),
    ).toBeCloseTo(0.5);
  });

  it('treats missing confidence as fully confident', () => {
    expect(frameConfidence({ landmarks: [{ x: 0, y: 0 }] })).toBe(1);
  });

  it('is 0 for a null or empty frame', () => {
    expect(frameConfidence(null)).toBe(0);
    expect(frameConfidence({ landmarks: [] })).toBe(0);
  });
});

describe('observePoseFrame — detection state machine', () => {
  it('starts searching and does not emit until debounced tracking', () => {
    // Two confident frames (debounce = 3) are not yet enough.
    const { last, state } = run([frame(0.9), frame(0.9)], { debounceFrames: 3 });
    expect(state.detection).toBe('searching');
    expect(last.emit).toBeNull();
    expect(last.hint).toBe(true);
  });

  it('promotes to tracking after debounceFrames reliable frames, then emits', () => {
    const good = frame(0.9);
    const { last, state } = run([good, good, good], { debounceFrames: 3 });
    expect(state.detection).toBe('tracking');
    expect(last.emit).toBe(good);
    expect(last.hint).toBe(false);
  });

  it('does not emit a low-confidence frame even while tracking', () => {
    const good = frame(0.9);
    // Reach tracking, then a single low-confidence frame (within debounce).
    let state = createPoseStreamState();
    for (const f of [good, good, good]) state = observePoseFrame(state, f, { debounceFrames: 3 }).state;
    const res = observePoseFrame(state, frame(0.1), { debounceFrames: 3 });
    expect(res.detection).toBe('tracking'); // debounce keeps it tracking…
    expect(res.emit).toBeNull(); // …but the unreliable frame is withheld.
  });

  it('demotes to searching after debounceFrames unreliable frames', () => {
    const good = frame(0.9);
    let state = createPoseStreamState();
    for (const f of [good, good, good]) state = observePoseFrame(state, f, { debounceFrames: 2 }).state;
    // Two unreliable frames (empty / low) demote.
    state = observePoseFrame(state, null, { debounceFrames: 2 }).state;
    const res = observePoseFrame(state, frame(0.2), { debounceFrames: 2 });
    expect(res.detection).toBe('searching');
    expect(res.hint).toBe(true);
    expect(res.emit).toBeNull();
  });

  it('treats a no-person (null) frame as unreliable with 0 confidence', () => {
    const res = observePoseFrame(createPoseStreamState(), null);
    expect(res.state.confidence).toBe(0);
    expect(res.detection).toBe('searching');
  });
});

describe('shouldSample throttle', () => {
  it('always samples the first frame', () => {
    expect(shouldSample(null, 0, 30)).toBe(true);
  });

  it('gates frames faster than the target rate', () => {
    // 30 fps → ~33.3ms interval.
    expect(shouldSample(0, 20, 30)).toBe(false);
    expect(shouldSample(0, 40, 30)).toBe(true);
  });

  it('defaults to a rate inside the 15–30 fps window', () => {
    expect(DEFAULT_TARGET_FPS).toBeGreaterThanOrEqual(15);
    expect(DEFAULT_TARGET_FPS).toBeLessThanOrEqual(30);
  });
});
