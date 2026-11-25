import { describe, expect, it } from 'vitest';
import { SOLDIER } from '../src/config/enemies';
import { createSoldier, damageSoldier, separate, stepSoldier, type Soldier, type SoldierContext, type SoldierEvent } from '../src/game/enemies/soldierBrain';
import { mulberry32 } from '../src/game/world/cityLayout';

const DT = 1 / 60;
const flat = () => 0;
const ctxAt = (x: number, z: number, heroSpeed = 0, heroActive = true): SoldierContext => ({ hero: { x, y: 0, z }, heroSpeed, heroActive, groundY: flat, rand: mulberry32(9) });

function run(s: Soldier, seconds: number, ctx: SoldierContext) {
  const ev: SoldierEvent[] = [];
  for (let t = 0; t < seconds; t += DT) ev.push(...stepSoldier(s, DT, ctx));
  return ev;
}

describe('LexCorp soldiers', () => {
  it('a brute closes in, warns before every punch, and lands it on a hero who stands still', () => {
    const s = createSoldier('brute', 0, 0, flat);
    const ev = run(s, 8, ctxAt(15, 0));
    const warns = ev.filter((e) => e.type === 'warn').length;
    const punches = ev.filter((e) => e.type === 'punch');
    expect(Math.hypot(s.x - 15, s.z)).toBeLessThan(SOLDIER.meleeRange + 0.5);
    expect(punches.length).toBeGreaterThan(1);
    expect(warns).toBeGreaterThanOrEqual(punches.length);
    expect(punches.some((e) => e.type === 'punch' && e.hit)).toBe(true);
  });

  it('a rifleman keeps his distance and shoots; a fast-moving hero is never hit', () => {
    const s = createSoldier('rifle', 0, 0, flat);
    const ev = run(s, 10, ctxAt(4, 0));
    const d = Math.hypot(s.x - 4, s.z);
    expect(d).toBeGreaterThan(SOLDIER.rifleMin - 3);
    expect(ev.some((e) => e.type === 'shot')).toBe(true);
    const fast = createSoldier('rifle', 0, 0, flat);
    const shots = run(fast, 10, ctxAt(15, 0, 30)).filter((e) => e.type === 'shot');
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every((e) => e.type === 'shot' && !e.hit)).toBe(true);
  });

  it('a light hit staggers and cancels the attack; a big one sends him flying; enough damage knocks him out', () => {
    const s = createSoldier('brute', 0, 0, flat);
    s.mode = 'windup';
    s.timer = 0.5;
    damageSoldier(s, 5, { x: 3, y: 1, z: 0 });
    expect(s.mode).toBe('stagger');
    expect(run(s, SOLDIER.staggerTime * 0.9, ctxAt(1, 0)).some((e) => e.type === 'punch')).toBe(false);
    damageSoldier(s, 5, { x: 25, y: 8, z: 0 });
    expect(s.mode).toBe('launched');
    run(s, 0.25, ctxAt(50, 0));
    expect(s.y).toBeGreaterThan(0.3);
    damageSoldier(s, 999, { x: 10, y: 5, z: 0 });
    const ev = run(s, 3, ctxAt(50, 0));
    expect(ev.some((e) => e.type === 'out')).toBe(true);
    expect(s.mode).toBe('out');
  });

  it('squad members keep apart', () => {
    const a = createSoldier('brute', 0, 0, flat);
    const b = createSoldier('brute', 0.2, 0, flat);
    separate([a, b]);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(SOLDIER.spacing - 1e-6);
  });
});
