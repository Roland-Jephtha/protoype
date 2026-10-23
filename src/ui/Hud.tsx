import { useEffect, useRef } from 'react';
import { runtime } from '../game/runtime';
import { useApp } from '../state/appStore';

const STATE_LABEL: Record<string, string> = {
  idle: 'Standing',
  walk: 'Walking',
  run: 'Running',
  sprint: 'Sprinting',
  jump: 'Airborne',
  fall: 'Falling',
  land: 'Landing',
  hardLand: 'Impact',
};

/**
 * In-game HUD. Phase 1: location/objective banner, compact speed readout,
 * and a mouse-capture prompt on desktop. Polls runtime at 10 Hz.
 */
export function Hud({ touchUi }: { touchUi: boolean }) {
  const speedRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);
  const pointerLocked = useApp((s) => s.pointerLocked);

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = runtime.playerVelocity;
      const kmh = Math.hypot(v.x, v.z) * 3.6;
      if (speedRef.current) speedRef.current.textContent = kmh.toFixed(0);
      if (stateRef.current) stateRef.current.textContent = STATE_LABEL[runtime.playerState] ?? '';
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="hud">
      <div className="hud-objective">
        <span className="hud-kicker">Free roam</span>
        <span className="hud-objective-text">Training plaza — test movement, stairs and jumps</span>
      </div>
      <div className={`hud-speed ${touchUi ? 'touch' : ''}`}>
        <span ref={speedRef} className="hud-speed-value">0</span>
        <span className="hud-speed-unit">km/h</span>
        <span ref={stateRef} className="hud-speed-state" />
      </div>
      {!touchUi && !pointerLocked && <div className="hud-prompt">Click to control the camera</div>}
    </div>
  );
}
