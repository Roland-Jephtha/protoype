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
 * Only actions that actually do something are shown. In flight, Jump becomes
 * Up, Sprint becomes Boost, and a Down button appears.
 * Attack / heat vision / interact buttons arrive with their systems.
 */
export function TouchControls() {
  const opacity = useSettings((s) => s.touchControlOpacity);
  const scale = useSettings((s) => s.touchControlScale);
  const pause = useApp((s) => s.pause);
  const flying = useApp((s) => s.flying);

  useEffect(() => () => input.releaseSource('touch'), []);

  return (
    <div className="touch-layer" style={{ ['--touch-opacity' as string]: opacity }}>
      <LookPad />
      <div className="touch-left">
        <VirtualStick scale={scale} />
      </div>
      <div className="touch-right">
        {flying && <TouchButton action="descend" label="Down" icon="▼" size={60 * scale} className="btn-down" />}
        <TouchButton action="sprint" label={flying ? 'Boost' : 'Sprint'} icon="»" size={64 * scale} className="btn-sprint" />
        <div className="touch-col">
          <TouchButton action="fly" label={flying ? 'Land' : 'Fly'} icon={flying ? '⤓' : '✈'} size={56 * scale} className="btn-fly" />
          <TouchButton action="jump" label={flying ? 'Up' : 'Jump'} icon="▲" size={84 * scale} className="btn-jump" />
        </div>
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
