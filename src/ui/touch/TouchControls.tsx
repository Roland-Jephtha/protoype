import { useEffect, useState } from 'react';
import type { Action } from '../../input/actions';
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
 * Punch and Heat (hold; slide the thumb to aim) sit left of the movement cluster,
 * then one Power button (Breath / Freeze / Nova; the small button cycles).
 */
const POWERS: { action: Action; label: string; icon: string }[] = [
  { action: 'breath', label: 'Breath', icon: '≋' },
  { action: 'freeze', label: 'Freeze', icon: '❄' },
  { action: 'nova', label: 'Nova', icon: '✺' },
];

export function TouchControls() {
  const [powerIndex, setPowerIndex] = useState(0);
  const power = POWERS[powerIndex];
  const opacity = useSettings((s) => s.touchControlOpacity);
  const scale = useSettings((s) => s.touchControlScale);
  const pause = useApp((s) => s.pause);
  const flying = useApp((s) => s.flying);
  const interactPrompt = useApp((s) => s.interactPrompt);
  const liftPrompt = useApp((s) => s.liftPrompt);
  const carrying = liftPrompt?.startsWith('Drop') ?? false;
  const contextPrompt = interactPrompt ?? liftPrompt;

  useEffect(() => () => input.releaseSource('touch'), []);

  return (
    <div className="touch-layer" style={{ ['--touch-opacity' as string]: opacity }}>
      <LookPad />
      <div className="touch-left">
        <VirtualStick scale={scale} />
      </div>
      {contextPrompt && (
        <div className="touch-interact">
          <TouchButton action="interact" label={contextPrompt.split(' · ')[0]} icon="✋" size={76 * scale} className="btn-interact" />
        </div>
      )}
      <div className="touch-right">
        <div className="touch-col">
          <TouchButton action="aim" label="Heat" icon="◉" size={60 * scale} className="btn-heat" dragToLook />
          <TouchButton action="attack" label={carrying ? 'Throw' : 'Punch'} icon="✊" size={72 * scale} className="btn-punch" />
        </div>
        <div className="touch-col">
          <div className="touch-power">
            <TouchButton key={power.action} action={power.action} label={power.label} icon={power.icon} size={60 * scale} className="btn-power" dragToLook={power.action !== 'nova'} />
            <button
              type="button"
              className="touch-power-cycle"
              aria-label="Next power"
              onPointerDown={(e) => {
                e.preventDefault();
                setPowerIndex((i) => (i + 1) % POWERS.length);
              }}
            >
              ⟳
            </button>
          </div>
        </div>
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
