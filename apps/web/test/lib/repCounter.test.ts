import { describe, expect, it } from 'vitest';
import type { ExerciseTracking } from '../../src/types/exercise';
import {
  DEFAULT_MIN_CONFIDENCE,
  DEFAULT_SMOOTHING_WINDOW,
  RepCounter,
  computeJointAngle,
  createRepCounter,
  normaliseTracking,
  observeFrame,
  observeSequence,
  type RepCounterEvent,
} from '../../src/lib/repCounter';
import { JOINT, frameAtAngle, frames, hold } from '../fixtures/landmarks';

/** Extension-is-up config (e.g. knee extension): big angle = up, small = down. */
const extensionUp: ExerciseTracking = {
  angleJoint: JOINT,
  repUpAngle: 160,
  repDownAngle: 70,
  smoothingWindow: 1,
  minConfidence: 0.5,
};

/** Flexion-is-up config (e.g. bicep curl): small angle = up, big = down. */
const flexionUp: ExerciseTracking = {
  angleJoint: JOINT,
  repUpAngle: 40,
  repDownAngle: 150,
  smoothingWindow: 1,
  minConfidence: 0.5,
};

const repsOf = (events: RepCounterEvent[]) => events.filter((e) => e.type === 'repCompleted');

describe('computeJointAngle', () => {
  it('reads a straight limb as ~180 degrees', () => {
    expect(computeJointAngle(frameAtAngle(180).landmarks, JOINT)).toBeCloseTo(180, 3);
  });

  it('reads a right angle as ~90 degrees', () => {
    expect(computeJointAngle(frameAtAngle(90).landmarks, JOINT)).toBeCloseTo(90, 3);
  });

  it('recovers an arbitrary target angle from the landmark coordinates', () => {
    expect(computeJointAngle(frameAtAngle(37).landmarks, JOINT)).toBeCloseTo(37, 3);
    expect(computeJointAngle(frameAtAngle(123).landmarks, JOINT)).toBeCloseTo(123, 3);
  });

  it('returns NaN when a landmark is missing', () => {
    expect(Number.isNaN(computeJointAngle([], JOINT))).toBe(true);
  });
});

describe('normaliseTracking', () => {
  it('applies defaults for optional fields', () => {
    const n = normaliseTracking({ angleJoint: JOINT, repUpAngle: 160, repDownAngle: 70 });
    expect(n.smoothingWindow).toBe(DEFAULT_SMOOTHING_WINDOW);
    expect(n.minConfidence).toBe(DEFAULT_MIN_CONFIDENCE);
    expect(n.isHold).toBe(false);
    expect(n.holdDirection).toBe('below');
    expect(n.extensionIsUp).toBe(true);
  });

  it('marks the exercise as a hold when holdAngle is present', () => {
    const n = normaliseTracking({ angleJoint: JOINT, repUpAngle: 160, repDownAngle: 70, holdAngle: 90 });
    expect(n.isHold).toBe(true);
  });

  it('detects flexion-is-up when repUpAngle < repDownAngle', () => {
    expect(normaliseTracking(flexionUp).extensionIsUp).toBe(false);
  });

  it('coerces the smoothing window to at least 1 and clamps confidence', () => {
    const n = normaliseTracking({
      angleJoint: JOINT,
      repUpAngle: 160,
      repDownAngle: 70,
      smoothingWindow: 0,
      minConfidence: 5,
    });
    expect(n.smoothingWindow).toBe(1);
    expect(n.minConfidence).toBe(1);
  });
});

describe('rep counting — down→up increments exactly once', () => {
  it('counts one rep for a full down→up cycle and reports its ROM', () => {
    const { state, events } = observeSequence(
      createRepCounter(extensionUp),
      frames([170, 60, 170]),
    );
    expect(state.reps).toBe(1);
    const reps = repsOf(events);
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ rep: 1, minAngle: expect.any(Number), maxAngle: expect.any(Number) });
    if (reps[0].type === 'repCompleted') {
      expect(reps[0].rangeOfMotionDeg).toBeCloseTo(110, 2);
    }
  });

  it('does not double-count a single down→up transition', () => {
    // Extra "up" frames after the rep must not each re-increment.
    const { state } = observeSequence(
      createRepCounter(extensionUp),
      frames([170, 60, 170, 168, 165, 170]),
    );
    expect(state.reps).toBe(1);
  });

  it('counts each rep in a multi-rep set exactly once', () => {
    const seq = frames([170, 60, 170, 55, 168, 62, 172]);
    const { state, events } = observeSequence(createRepCounter(extensionUp), seq);
    expect(state.reps).toBe(3);
    expect(repsOf(events)).toHaveLength(3);
  });

  it('works for flexion-is-up exercises (curl: small angle = up)', () => {
    const { state } = observeSequence(
      createRepCounter(flexionUp),
      frames([30, 160, 30, 165, 25]),
    );
    expect(state.reps).toBe(2);
  });

  it('emits a stageChanged event on each stage crossing', () => {
    const { events } = observeSequence(createRepCounter(extensionUp), frames([170, 60, 170]));
    const stages = events.filter((e) => e.type === 'stageChanged');
    expect(stages.map((e) => (e.type === 'stageChanged' ? e.stage : ''))).toEqual([
      'up',
      'down',
      'up',
    ]);
  });
});

describe('partial reps and hysteresis produce no false counts', () => {
  it('does not count a movement that never reaches the down threshold', () => {
    // Dips to 100 (inside the 70–160 dead-band) and returns — a partial rep.
    const { state } = observeSequence(createRepCounter(extensionUp), frames([170, 100, 170]));
    expect(state.reps).toBe(0);
  });

  it('does not count until BOTH thresholds have been crossed', () => {
    // down (60) then only back into the dead-band (100): no rep yet …
    let { state } = observeSequence(createRepCounter(extensionUp), frames([170, 60, 100]));
    expect(state.reps).toBe(0);
    expect(state.stage).toBe('down');
    // … then completing to the up threshold finally counts it.
    ({ state } = observeSequence(state, frames([165])));
    expect(state.reps).toBe(1);
  });

  it('hysteresis: jitter near the up threshold does not re-count', () => {
    const jitter = [161, 159, 162, 158, 160, 159, 163];
    const { state } = observeSequence(
      createRepCounter(extensionUp),
      frames([170, 60, 170, ...jitter]),
    );
    expect(state.reps).toBe(1);
  });

  it('a smoothed single-frame spike does not flip the stage', () => {
    // Default smoothing window damps one spurious 170 among deep-flex frames.
    const spiky: ExerciseTracking = { ...extensionUp, smoothingWindow: DEFAULT_SMOOTHING_WINDOW };
    const seq = frames([...hold(50, 6), 170, ...hold(50, 4)]);
    const { state, events } = observeSequence(createRepCounter(spiky), seq);
    expect(state.reps).toBe(0);
    expect(repsOf(events)).toHaveLength(0);
  });

  it('sustained (not jittery) motion still counts with smoothing enabled', () => {
    const smooth: ExerciseTracking = { ...extensionUp, smoothingWindow: DEFAULT_SMOOTHING_WINDOW };
    const seq = frames([...hold(170, 6), ...hold(55, 6), ...hold(170, 6)]);
    const { state } = observeSequence(createRepCounter(smooth), seq);
    expect(state.reps).toBe(1);
  });
});

describe('low-confidence gating', () => {
  it('pauses on low confidence and does not mutate stage or reps', () => {
    let state = createRepCounter(extensionUp);
    ({ state } = observeSequence(state, frames([170, 60]))); // now in "down"
    expect(state.stage).toBe('down');

    const low = observeFrame(state, frameAtAngle(170, { confidence: 0.1 }));
    expect(low.state.active).toBe(false);
    expect(low.state.reps).toBe(0);
    expect(low.state.stage).toBe('down'); // stage preserved across the pause
    expect(low.events.some((e) => e.type === 'paused')).toBe(true);
  });

  it('resumes cleanly and completes the rep once confidence returns', () => {
    let state = createRepCounter(extensionUp);
    ({ state } = observeSequence(state, frames([170, 60]))); // "down"
    ({ state } = observeFrame(state, frameAtAngle(165, { confidence: 0.1 }))); // dropped
    const resumed = observeFrame(state, frameAtAngle(165, { confidence: 0.9 }));
    expect(resumed.events.some((e) => e.type === 'resumed')).toBe(true);
    expect(resumed.state.reps).toBe(1);
  });
});

describe('hold-type exercises accumulate seconds instead of reps', () => {
  const holdConfig: ExerciseTracking = {
    angleJoint: JOINT,
    repUpAngle: 160,
    repDownAngle: 70,
    holdAngle: 90,
    holdDirection: 'below',
    smoothingWindow: 1,
  };

  it('accumulates seconds while held below the target and counts no reps', () => {
    // 11 frames at 10fps held at 60° → 10 × 0.1s = 1.0s.
    const { state, events } = observeSequence(
      createRepCounter(holdConfig),
      frames(hold(60, 11), { fps: 10 }),
    );
    expect(state.reps).toBe(0);
    expect(state.holdSeconds).toBeCloseTo(1.0, 6);
    expect(events.some((e) => e.type === 'holdProgress')).toBe(true);
  });

  it('does not accumulate time when not sustaining the hold', () => {
    // Above the 90° target the whole time → no held seconds.
    const { state } = observeSequence(
      createRepCounter(holdConfig),
      frames(hold(150, 11), { fps: 10 }),
    );
    expect(state.holdSeconds).toBe(0);
  });

  it('excludes paused gaps from the accumulated hold seconds', () => {
    let state = createRepCounter(holdConfig);
    ({ state } = observeFrame(state, frameAtAngle(60, { timestamp: 0 })));
    ({ state } = observeFrame(state, frameAtAngle(60, { timestamp: 100 }))); // +0.1
    ({ state } = observeFrame(state, frameAtAngle(60, { timestamp: 200 }))); // +0.1
    ({ state } = observeFrame(state, frameAtAngle(60, { confidence: 0.1, timestamp: 300 }))); // pause
    ({ state } = observeFrame(state, frameAtAngle(60, { timestamp: 400 }))); // resume, +0
    ({ state } = observeFrame(state, frameAtAngle(60, { timestamp: 500 }))); // +0.1
    expect(state.holdSeconds).toBeCloseTo(0.3, 6);
  });

  it('supports holds sustained above the target angle', () => {
    const above: ExerciseTracking = { ...holdConfig, holdDirection: 'above', holdAngle: 120 };
    const { state } = observeSequence(createRepCounter(above), frames(hold(150, 11), { fps: 10 }));
    expect(state.holdSeconds).toBeCloseTo(1.0, 6);
  });
});

describe('determinism', () => {
  it('produces identical results for the same landmark sequence', () => {
    const seq = frames([170, 60, 170, 55, 168], { fps: 30 });
    const a = observeSequence(createRepCounter(extensionUp), seq);
    const b = observeSequence(createRepCounter(extensionUp), seq);
    expect(a.state).toEqual(b.state);
    expect(a.events).toEqual(b.events);
  });
});

describe('RepCounter wrapper', () => {
  it('dispatches repCompleted events to filtered listeners', () => {
    const counter = new RepCounter(extensionUp);
    const completed: number[] = [];
    counter.on('repCompleted', (e) => {
      if (e.type === 'repCompleted') completed.push(e.rep);
    });
    for (const frame of frames([170, 60, 170, 55, 170])) counter.push(frame);
    expect(counter.reps).toBe(2);
    expect(completed).toEqual([1, 2]);
  });

  it('unsubscribes listeners', () => {
    const counter = new RepCounter(extensionUp);
    let calls = 0;
    const off = counter.on(() => {
      calls += 1;
    });
    counter.push(frameAtAngle(170));
    off();
    counter.push(frameAtAngle(60));
    expect(calls).toBe(1);
  });

  it('builds from a library exercise and reflects live state', () => {
    const counter = RepCounter.fromExercise({
      id: 'knee-ext',
      name: 'Knee Extension',
      tracking: extensionUp,
    });
    for (const frame of frames([170, 60, 170])) counter.push(frame);
    expect(counter.reps).toBe(1);
    expect(counter.stage).toBe('up');
    expect(counter.active).toBe(true);
  });

  it('throws when the exercise has no tracking config', () => {
    expect(() => RepCounter.fromExercise({ id: 'x', name: 'Demo only' })).toThrow(/tracking/);
  });
});
