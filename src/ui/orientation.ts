import { useEffect, useState } from 'react';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';

/**
 * Landscape-only presentation on phones.
 *
 * 1. On Play we try fullscreen + Screen Orientation lock (works on Android Chrome).
 * 2. Where locking isn't available (iOS Safari) and the phone is held upright,
 *    the whole app frame is rotated 90° with CSS so the game is still horizontal.
 *
 * While rotated, touch deltas arrive in screen space and must be mapped into the
 * rotated frame; `screenDeltaToGame` does that for the stick and look pad.
 */
export const orientationState = { rotated: false };

const portraitQuery = '(orientation: portrait)';
const coarsePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Screen-space delta → delta in the (possibly rotated 90° clockwise) game frame. */
export function screenDeltaToGame(dx: number, dy: number, rotated = orientationState.rotated) {
  return rotated ? { x: dy, y: -dx } : { x: dx, y: dy };
}

/** Best-effort fullscreen + landscape lock. Must be called from a user gesture. */
export async function tryLockLandscape(): Promise<boolean> {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen({ navigationUI: 'hide' });
    }
    const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (orientation?.lock) {
      await orientation.lock('landscape');
      return true;
    }
  } catch {
    // Unsupported (iOS) or refused — the CSS rotation fallback covers it.
  }
  return false;
}

/** True when the app frame should be CSS-rotated into landscape. */
export function useForcedLandscape(): boolean {
  const enabled = useSettings((s) => s.forceLandscape);
  const touchDetected = useApp((s) => s.touchDetected);
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.matchMedia(portraitQuery).matches);

  useEffect(() => {
    const mq = window.matchMedia(portraitQuery);
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const rotated = enabled && (touchDetected || coarsePointer) && portrait;
  useEffect(() => {
    orientationState.rotated = rotated;
  }, [rotated]);
  return rotated;
}
