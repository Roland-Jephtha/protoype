import { useApp } from '../../state/appStore';
import { useSettings } from '../../state/settings';

const coarsePointer = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Whether the on-screen controls should show, per the user's setting. */
export function useTouchControlsVisible() {
  const mode = useSettings((s) => s.touchControls);
  const touchDetected = useApp((s) => s.touchDetected);
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return touchDetected || coarsePointer;
}
