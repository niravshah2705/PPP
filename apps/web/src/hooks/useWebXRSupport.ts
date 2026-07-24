import { useEffect, useState } from 'react';
import { detectWebXRSupport } from '../lib/deviceCapabilities';

export type WebXRSupport = 'checking' | 'supported' | 'unsupported';

/**
 * Resolve whether immersive WebXR is available.
 *
 * Pass `enabled = false` to skip the probe entirely (e.g. the chrome-free embed
 * never offers Enter-VR), which keeps that surface free of async state churn.
 */
export function useWebXRSupport(enabled = true): WebXRSupport {
  const [support, setSupport] = useState<WebXRSupport>(enabled ? 'checking' : 'unsupported');

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    detectWebXRSupport().then((ok) => {
      if (active) setSupport(ok ? 'supported' : 'unsupported');
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return support;
}
