import { useEffect, useRef } from 'react';
import { HERO_COMBAT, SPEED_FORCE } from '../config/combat';
import { REGIONS, type Side } from '../config/regions';
import { runtime } from '../game/runtime';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';
import { MissionHud } from './MissionScreens';
import { easeReadout, readoutKmh } from './speedReadout';

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
  const speedBoxRef = useRef<HTMLDivElement>(null);
  const shownKmh = useRef(0);
  const stateRef = useRef<HTMLSpanElement>(null);
  const edgeRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef<HTMLDivElement>(null);
  const heatBarRef = useRef<HTMLDivElement>(null);
  const solarRef = useRef<HTMLDivElement>(null);
  const speedForceRef = useRef<HTMLDivElement>(null);
  const speedTintRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const lastNova = useRef(0);
  const crossRef = useRef<HTMLDivElement>(null);
  const hurtRef = useRef<HTMLDivElement>(null);
  const lastHealth = useRef<number>(HERO_COMBAT.maxHealth);
  const bossRef = useRef<HTMLDivElement>(null);
  const bossNameRef = useRef<HTMLSpanElement>(null);
  const bossFillRef = useRef<HTMLDivElement>(null);
  const frozenRef = useRef<HTMLDivElement>(null);
  const finisherRef = useRef<HTMLDivElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const comboNumRef = useRef<HTMLSpanElement>(null);
  const lastChain = useRef(0);
  const pointerLocked = useApp((s) => s.pointerLocked);
  const regionId = useApp((s) => s.regionId);
  const mode = useApp((s) => s.mode);
  const liftPrompt = useApp((s) => s.liftPrompt);
  const interactPrompt = useApp((s) => s.interactPrompt);
  const region = REGIONS[regionId];
  const quality = useSettings((s) => s.graphicsQuality);

  useEffect(() => {
    const id = window.setInterval(() => {
      const v = runtime.playerVelocity;
      // In flight, show full 3D speed (a straight climb at 60 km/h reads 60).
      const ms = FLIGHT_STATES.has(runtime.playerState) ? Math.hypot(v.x, v.y, v.z) : Math.hypot(v.x, v.z);
      // In Speed Force: speed relative to the slowed world, counting up.
      shownKmh.current = easeReadout(shownKmh.current, readoutKmh(ms, runtime.speedForce), 0.1);
      if (speedRef.current) speedRef.current.textContent = shownKmh.current.toFixed(0);
      if (stateRef.current) stateRef.current.textContent = runtime.speedForce ? 'Speed Force' : (STATE_LABEL[runtime.playerState] ?? '');
      speedBoxRef.current?.classList.toggle('speedforce', runtime.speedForce);

      const c = runtime.combat;
      if (healthRef.current) healthRef.current.style.transform = `scaleX(${c.health / HERO_COMBAT.maxHealth})`;
      if (heatRef.current) heatRef.current.style.transform = `scaleX(${c.heat / HERO_COMBAT.heat.capacity})`;
      heatBarRef.current?.classList.toggle('overheated', c.overheated);
      if (solarRef.current) solarRef.current.style.transform = `scaleX(${c.solar / HERO_COMBAT.solar.capacity})`;
      if (speedForceRef.current) speedForceRef.current.style.transform = `scaleX(${c.speedEnergy / SPEED_FORCE.capacity})`;
      if (speedTintRef.current) {
        // Streaks and edge blur grow with speed.
        const k = c.speedForce ? Math.min(1, 0.35 + ms / 30) : 0;
        speedTintRef.current.style.opacity = k.toFixed(2);
      }
      // White flash on a Super Nova.
      if (flashRef.current && runtime.novaFlash !== lastNova.current) {
        lastNova.current = runtime.novaFlash;
        const el = flashRef.current;
        el.style.transition = 'none';
        el.style.opacity = '1';
        requestAnimationFrame(() => {
          el.style.transition = '';
          el.style.opacity = '0';
        });
      }
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

      const boss = runtime.boss;
      if (bossRef.current) bossRef.current.style.display = boss ? '' : 'none';
      if (boss && bossNameRef.current && bossFillRef.current) {
        bossNameRef.current.textContent = boss.name;
        bossFillRef.current.style.transform = `scaleX(${boss.health / boss.max})`;
      }
      bossRef.current?.classList.toggle('enraged', boss?.phase === 2);
      finisherRef.current?.classList.toggle('on', !!runtime.finisher);
      // Combo counter: shows from 2 hits, pops on every new hit, gold on super hits.
      const chain = c.chain;
      const box = comboRef.current;
      if (box && comboNumRef.current) {
        box.classList.toggle('on', chain >= 2);
        if (chain > lastChain.current && chain >= 2) {
          comboNumRef.current.textContent = `×${chain}`;
          box.classList.toggle('super', chain % HERO_COMBAT.punch.superEvery === 0);
          box.classList.remove('pop');
          void box.offsetWidth; // restart the pop animation
          box.classList.add('pop');
        }
      }
      lastChain.current = chain;
      if (frozenRef.current) frozenRef.current.style.opacity = runtime.heroFrozen > 0 ? '1' : '0';

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
      <div ref={flashRef} className="hud-flash" />
      <div ref={frozenRef} className="hud-frozen" />
      <div ref={speedTintRef} className={`hud-speedforce ${quality === 'low' ? 'no-blur' : ''}`}>
        <div className="hud-speedforce-streaks" />
      </div>
      <div ref={finisherRef} className="hud-finisher" />
      <div ref={comboRef} className="hud-combo">
        <span ref={comboNumRef} className="hud-combo-num">×2</span>
        <span className="hud-combo-label">Hits</span>
      </div>
      <div ref={bossRef} className="hud-boss" style={{ display: 'none' }}>
        <span ref={bossNameRef} className="hud-boss-name" />
        <div className="hud-bar hud-boss-bar">
          <div ref={bossFillRef} className="hud-bar-fill" />
          <div className="hud-boss-phase" />
        </div>
      </div>
      <div ref={crossRef} className="hud-crosshair" style={{ display: 'none' }} />
      <div className={`hud-vitals ${touchUi ? 'touch' : ''}`}>
        <div className="hud-bar hud-health" aria-label="Health">
          <div ref={healthRef} className="hud-bar-fill" />
        </div>
        <div ref={heatBarRef} className="hud-bar hud-heat" aria-label="Heat vision">
          <div ref={heatRef} className="hud-bar-fill" />
        </div>
        <div className="hud-bar hud-solar" aria-label="Solar energy">
          <div ref={solarRef} className="hud-bar-fill" />
        </div>
        <div className="hud-bar hud-speedbar" aria-label="Speed Force">
          <div ref={speedForceRef} className="hud-bar-fill" />
        </div>
      </div>
      <div ref={speedBoxRef} className={`hud-speed ${touchUi ? 'touch' : ''}`}>
        <span ref={speedRef} className="hud-speed-value">0</span>
        <span className="hud-speed-unit">km/h</span>
        <span ref={stateRef} className="hud-speed-state" />
      </div>
      {!touchUi && !pointerLocked && <div className="hud-prompt">Click to control the camera</div>}
      {!touchUi && liftPrompt && !interactPrompt && (
        <div className="hud-interact">
          {liftPrompt.startsWith('Drop') ? 'Click · Throw    E · Drop' : `E · ${liftPrompt.split(' · ')[0]}`}
        </div>
      )}
    </div>
  );
}
