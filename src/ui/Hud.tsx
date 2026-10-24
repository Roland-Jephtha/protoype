import { useEffect, useRef } from 'react';
import { HERO_COMBAT } from '../config/combat';
import { REGIONS, type Side } from '../config/regions';
import { runtime } from '../game/runtime';
import { useApp } from '../state/appStore';
import { MissionHud } from './MissionScreens';

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
  const healthRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);
  const heatBarRef = useRef<HTMLDivElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);
  const hurtRef = useRef<HTMLDivElement>(null);
  const lastHealth = useRef<number>(HERO_COMBAT.maxHealth);
  const pointerLocked = useApp((s) => s.pointerLocked);
  const regionId = useApp((s) => s.regionId);
  const mode = useApp((s) => s.mode);
  const region = REGIONS[regionId];

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = runtime.playerVelocity;
      // In flight, show full 3D speed (a straight climb at 60 km/h reads 60).
      const kmh = (FLIGHT_STATES.has(runtime.playerState) ? Math.hypot(v.x, v.y, v.z) : Math.hypot(v.x, v.z)) * 3.6;
      if (speedRef.current) speedRef.current.textContent = kmh.toFixed(0);
      if (stateRef.current) stateRef.current.textContent = STATE_LABEL[runtime.playerState] ?? '';

      const c = runtime.combat;
      if (healthRef.current) healthRef.current.style.transform = `scaleX(${c.health / HERO_COMBAT.maxHealth})`;
      if (heatRef.current) heatRef.current.style.transform = `scaleX(${c.heat / HERO_COMBAT.heat.capacity})`;
      heatBarRef.current?.classList.toggle('overheated', c.overheated);
      if (crossRef.current) crossRef.current.style.display = runtime.aiming ? '' : 'none';
      // Flash red when hurt; the CSS transition fades it out.
      if (hurtRef.current && c.health < lastHealth.current - 0.5) {
        const el = hurtRef.current;
        el.style.transition = 'none';
        el.style.opacity = '1';
        requestAnimationFrame(() => {
          el.style.transition = '';
          el.style.opacity = '0';
        });
      }
      lastHealth.current = c.health;

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
      {mode === 'story' ? (
        <MissionHud touchUi={touchUi} />
      ) : (
        <div className="hud-objective">
          <span className="hud-kicker">Free roam · {region.name}</span>
          <span className="hud-objective-text">{region.description}</span>
        </div>
      )}
      <div ref={edgeRef} className="hud-edge" style={{ display: 'none' }} />
      <div ref={hurtRef} className="hud-hurt" />
      <div ref={crossRef} className="hud-crosshair" style={{ display: 'none' }} />
      <div className={`hud-vitals ${touchUi ? 'touch' : ''}`}>
        <div className="hud-bar hud-health" aria-label="Health">
          <div ref={healthRef} className="hud-bar-fill" />
        </div>
        <div ref={heatBarRef} className="hud-bar hud-heat" aria-label="Heat vision">
          <div ref={heatRef} className="hud-bar-fill" />
        </div>
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
