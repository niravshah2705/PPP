import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cameraNoticeMessage,
  classifyCameraError,
  detectWebXRSupport,
  requestCamera,
  requestImmersiveSession,
} from '../../src/lib/deviceCapabilities';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Replace navigator with a controlled shape for the duration of a test. */
function stubNavigator(nav: unknown) {
  vi.stubGlobal('navigator', nav);
}

describe('classifyCameraError', () => {
  it('maps permission errors to "denied"', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied');
    expect(classifyCameraError({ name: 'PermissionDeniedError' })).toBe('denied');
    expect(classifyCameraError({ name: 'SecurityError' })).toBe('denied');
  });

  it('maps missing-hardware errors to "no-camera"', () => {
    expect(classifyCameraError({ name: 'NotFoundError' })).toBe('no-camera');
    expect(classifyCameraError({ name: 'DevicesNotFoundError' })).toBe('no-camera');
    expect(classifyCameraError({ name: 'OverconstrainedError' })).toBe('no-camera');
  });

  it('maps unknown/undefined errors to "error"', () => {
    expect(classifyCameraError({ name: 'BoomError' })).toBe('error');
    expect(classifyCameraError(null)).toBe('error');
    expect(classifyCameraError(undefined)).toBe('error');
  });
});

describe('requestCamera', () => {
  it('returns "granted" with the stream when getUserMedia resolves', async () => {
    const stream = { id: 'stream-1' };
    stubNavigator({ mediaDevices: { getUserMedia: vi.fn(() => Promise.resolve(stream)) } });
    const result = await requestCamera();
    expect(result.status).toBe('granted');
    expect(result.stream).toBe(stream);
  });

  it('returns "denied" when the user blocks the camera', async () => {
    stubNavigator({
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.reject({ name: 'NotAllowedError' })),
      },
    });
    expect((await requestCamera()).status).toBe('denied');
  });

  it('returns "no-camera" when no device is present', async () => {
    stubNavigator({
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.reject({ name: 'NotFoundError' })),
      },
    });
    expect((await requestCamera()).status).toBe('no-camera');
  });

  it('returns "unsupported" when getUserMedia is unavailable', async () => {
    stubNavigator({});
    expect((await requestCamera()).status).toBe('unsupported');
  });
});

describe('detectWebXRSupport', () => {
  it('returns true when immersive-vr is supported', async () => {
    const isSessionSupported = vi.fn(() => Promise.resolve(true));
    stubNavigator({ xr: { isSessionSupported } });
    await expect(detectWebXRSupport()).resolves.toBe(true);
    expect(isSessionSupported).toHaveBeenCalledWith('immersive-vr');
  });

  it('returns false when immersive-vr is not supported', async () => {
    stubNavigator({ xr: { isSessionSupported: vi.fn(() => Promise.resolve(false)) } });
    await expect(detectWebXRSupport()).resolves.toBe(false);
  });

  it('returns false when navigator.xr is absent', async () => {
    stubNavigator({});
    await expect(detectWebXRSupport()).resolves.toBe(false);
  });

  it('returns false when the support check rejects', async () => {
    stubNavigator({ xr: { isSessionSupported: vi.fn(() => Promise.reject(new Error('x'))) } });
    await expect(detectWebXRSupport()).resolves.toBe(false);
  });
});

describe('requestImmersiveSession', () => {
  it('returns "started" with the session when requestSession resolves', async () => {
    const session = { id: 'xr-session' };
    const requestSession = vi.fn(() => Promise.resolve(session));
    stubNavigator({ xr: { isSessionSupported: vi.fn(), requestSession } });
    const result = await requestImmersiveSession();
    expect(result.status).toBe('started');
    expect(result.session).toBe(session);
    expect(requestSession).toHaveBeenCalledWith('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    });
  });

  it('forwards a custom mode and options', async () => {
    const requestSession = vi.fn(() => Promise.resolve({}));
    stubNavigator({ xr: { requestSession } });
    await requestImmersiveSession('immersive-ar', { requiredFeatures: ['hit-test'] });
    expect(requestSession).toHaveBeenCalledWith('immersive-ar', {
      requiredFeatures: ['hit-test'],
    });
  });

  it('returns "unsupported" when navigator.xr is absent', async () => {
    stubNavigator({});
    expect((await requestImmersiveSession()).status).toBe('unsupported');
  });

  it('returns "unsupported" when requestSession is not a function', async () => {
    stubNavigator({ xr: { isSessionSupported: vi.fn() } });
    expect((await requestImmersiveSession()).status).toBe('unsupported');
  });

  it('returns "rejected" when the device refuses the session', async () => {
    stubNavigator({
      xr: { requestSession: vi.fn(() => Promise.reject(new Error('no headset'))) },
    });
    const result = await requestImmersiveSession();
    expect(result.status).toBe('rejected');
    expect(result.session).toBeUndefined();
  });
});

describe('cameraNoticeMessage', () => {
  it('explains manual counting for each blocked state', () => {
    expect(cameraNoticeMessage('denied')).toMatch(/manually/i);
    expect(cameraNoticeMessage('no-camera')).toMatch(/no camera/i);
    expect(cameraNoticeMessage('unsupported')).toMatch(/manually/i);
  });

  it('mentions paused tracking and saved progress when revoked mid-session', () => {
    const msg = cameraNoticeMessage('lost', true);
    expect(msg).toMatch(/paused/i);
    expect(msg).toMatch(/saved/i);
  });
});
