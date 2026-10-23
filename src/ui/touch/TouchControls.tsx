import { useEffect } from 'react';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { useSettings } from '../../state/settings';
import { LookPad } from './LookPad';
import { TouchButton } from './TouchButton';
import { VirtualStick } from './VirtualStick';

/**
 * Mobile control layout (landscape-first, safe-area aware):
 *  - left: analog movement stick
 *  - right: camera look area beneath the action cluster
 *  - top-right: pause
 * Phase 1 shows only actions that actually do something (jump, sprint).
 * Attack / heat vision / interact buttons arrive with their systems.
 */
export function TouchControls() {
  const opacity = useSettings((s) => s.touchControlOpacity);
  const scale = useSettings((s) => s.touchControlScale);
  const pause = useApp((s) => s.pause);

  useEffect(() => () => input.releaseSource('touch'), []);

  return (
    <div className="touch-layer" style={{ ['--touch-opacity' as string]: opacity }}>
      <LookPad />
      <div className="touch-left">
        <VirtualStick scale={scale} />
      </div>
      <div className="touch-right">
        <TouchButton action="sprint" label="Sprint" icon="»" size={64 * scale} className="btn-sprint" />
        <TouchButton action="jump" label="Jump" icon="▲" size={84 * scale} className="btn-jump" />
      </div>
      <button
        type="button"
        className="touch-pause"
        aria-label="Pause"
        onPointerDown={(e) => {
          e.preventDefault();
          pause();
        }}
      >
        <span />
        <span />
      </button>
    </div>
  );
}
