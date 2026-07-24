import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODEL_ASSET_PATH,
  DEFAULT_WASM_BASE_PATH,
  POSE_CONNECTIONS,
  POSE_LANDMARK_COUNT,
  createPoseLandmarker,
  toLandmarkFrame,
  type RawPoseResult,
} from '../../src/lib/poseLandmarker';

describe('POSE_CONNECTIONS topology', () => {
  it('references only valid landmark indices', () => {
    for (const { start, end } of POSE_CONNECTIONS) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThanOrEqual(0);
      expect(start).toBeLessThan(POSE_LANDMARK_COUNT);
      expect(end).toBeLessThan(POSE_LANDMARK_COUNT);
      expect(start).not.toBe(end);
    }
  });

  it('has no duplicate bones (either orientation)', () => {
    const seen = new Set<string>();
    for (const { start, end } of POSE_CONNECTIONS) {
      const key = [start, end].sort((a, b) => a - b).join('-');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('toLandmarkFrame', () => {
  it('maps the first pose, carrying visibility → confidence and defaulting z', () => {
    const result: RawPoseResult = {
      landmarks: [
        [
          { x: 0.1, y: 0.2, z: 0.3, visibility: 0.9 },
          { x: 0.4, y: 0.5 }, // no z / visibility
        ],
      ],
    };
    const frame = toLandmarkFrame(result, 1234);
    expect(frame.timestamp).toBe(1234);
    expect(frame.landmarks).toEqual([
      { x: 0.1, y: 0.2, z: 0.3, confidence: 0.9 },
      { x: 0.4, y: 0.5, z: 0, confidence: 1 },
    ]);
  });

  it('uses only the first detected pose', () => {
    const result: RawPoseResult = {
      landmarks: [
        [{ x: 0, y: 0, visibility: 1 }],
        [{ x: 0.9, y: 0.9, visibility: 1 }],
      ],
    };
    expect(toLandmarkFrame(result, 0).landmarks).toHaveLength(1);
  });

  it('yields an empty landmark list when no pose is present', () => {
    expect(toLandmarkFrame({ landmarks: [] }, 5).landmarks).toEqual([]);
  });
});

describe('createPoseLandmarker (injected MediaPipe module)', () => {
  function fakeVision(landmarks: unknown) {
    const detectForVideo = vi.fn(() => ({ landmarks }));
    const close = vi.fn();
    const createFromOptions = vi.fn(async () => ({ detectForVideo, close }));
    const forVisionTasks = vi.fn(async () => ({ wasm: true }));
    const load = vi.fn(async () => ({
      FilesetResolver: { forVisionTasks },
      PoseLandmarker: { createFromOptions },
    })) as unknown as Parameters<typeof createPoseLandmarker>[1];
    return { detectForVideo, close, createFromOptions, forVisionTasks, load };
  }

  it('wires the WASM fileset + VIDEO-mode options with sane defaults', async () => {
    const f = fakeVision([[{ x: 0, y: 0, z: 0, visibility: 1 }]]);
    await createPoseLandmarker({}, f.load);

    expect(f.forVisionTasks).toHaveBeenCalledWith(DEFAULT_WASM_BASE_PATH);
    const [, opts] = f.createFromOptions.mock.calls[0] as unknown as [
      unknown,
      Record<string, unknown>,
    ];
    expect(opts).toMatchObject({
      runningMode: 'VIDEO',
      numPoses: 1,
      baseOptions: { modelAssetPath: DEFAULT_MODEL_ASSET_PATH, delegate: 'GPU' },
    });
  });

  it('detect() maps a found pose and returns null when empty', async () => {
    const f = fakeVision([[{ x: 0.2, y: 0.3, z: 0, visibility: 0.8 }]]);
    const detector = await createPoseLandmarker({}, f.load);

    const video = {} as HTMLVideoElement;
    const frame = detector.detect(video, 42);
    expect(f.detectForVideo).toHaveBeenCalledWith(video, 42);
    expect(frame).toEqual({
      landmarks: [{ x: 0.2, y: 0.3, z: 0, confidence: 0.8 }],
      timestamp: 42,
    });

    // No pose → null.
    const empty = fakeVision([]);
    const d2 = await createPoseLandmarker({}, empty.load);
    expect(d2.detect(video, 1)).toBeNull();
  });

  it('close() releases the underlying landmarker', async () => {
    const f = fakeVision([]);
    const detector = await createPoseLandmarker({}, f.load);
    detector.close();
    expect(f.close).toHaveBeenCalledTimes(1);
  });
});
