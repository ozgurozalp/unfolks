import { useEffect } from 'react';

/**
 * Runs an effect once on mount (with optional cleanup on unmount).
 * Use this instead of a raw `useEffect` for one-time external syncs.
 */
export function useMountEffect(effect: () => void | (() => void)) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(effect, []);
}
