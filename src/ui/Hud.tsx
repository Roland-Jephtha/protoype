import { useEffect, useRef } from 'react';
import { REGIONS, type Side } from '../config/regions';
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
  takeoff: 'Taking off',
  hover: 'Hovering',
  fly: 'Flying',
  flyBoost: 'Boosting',
};

const FLIGHT_STATES = new Set(['takeoff', 'hover', 'fly', 'flyBoost']);
const ARROW: Record<Side, string> = { north: '↑', south: '↓', east: '→', west: '←' };
/** Show the edge hint within this distance of a region edge (m). */
const EDGE_HINT_DISTANCE = 80;

/**
 * In-game HUD: region / objective banner, compact speed readout, edge-travel
 * hint and the desktop mouse-capture prompt. Polls runtime at 10 Hz.
 */
export function Hud({ touchUi }: { touchUi: boolean }) {
  const speedRef = useRef<HTMLSpanElement>(null);
  const stateRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const pointerLocked = useApp((s) => s.pointerLocked);
  const regionId = useApp((s) => s.regionId);
  const region = REGIONS[regionId];

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = runtime.playerVelocity;
      // In flight, show full 3D speed (a straight climb at 60 km/h reads 60).
      const kmh = (FLIGHT_STATES.has(runtime.playerState) ? Math.hypot(v.x, v.y, v.z) : Math.hypot(v.x, v.z)) * 3.6;
      if (speedRef.current) speedRef.current.textContent = kmh.toFixed(0);
      if (stateRef.current) stateRef.current.textContent = STATE_LABEL[runtime.playerState] ?? '';

      // Nearest edge: point the way to the neighbouring region, or warn it's the boundary.
      if (edgeRef.current) {
        const p = runtime.playerPosition;
        const half = runtime.regionHalf;
        const dist: [Side, number][] = [
          ['north', p.z + half],
          ['south', half - p.z],
          ['east', half - p.x],
          ['west', p.x + half],
        ];
        const [side, d] = dist.reduce((a, b) => (b[1] < a[1] ? b : a));
        const dest = REGIONS[runtime.regionId].exits[side];
        const show = d < EDGE_HINT_DISTANCE;
        edgeRef.current.style.display = show ? '' : 'none';
        if (show) edgeRef.current.textContent = dest ? `${ARROW[side]} ${REGIONS[dest].name}` : 'Edge of the region';
      }
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="hud">
      <div className="hud-objective">
        <span className="hud-kicker">Free roam · {region.name}</span>
        <span className="hud-objective-text">{region.description}</span>
      </div>
      <div ref={edgeRef} className="hud-edge" style={{ display: 'none' }} />
      <div className={`hud-speed ${touchUi ? 'touch' : ''}`}>
        <span ref={speedRef} className="hud-speed-value">0</span>
        <span className="hud-speed-unit">km/h</span>
        <span ref={stateRef} className="hud-speed-state" />
      </div>
      {!touchUi && !pointerLocked && <div className="hud-prompt">Click to control the camera</div>}
    </div>
  );
}
