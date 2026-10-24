import { describe, expect, it } from 'vitest';
import { circlerPose, stepPathWalker, stepWanderer, walkerPose, type PathWalker, type Wanderer, type WanderOptions } from '../src/game/life/behaviour';
import { mulberry32 } from '../src/game/world/cityLayout';
import { samplePath } from '../src/game/vehicles/traffic';

const far = { x: 999, y: 0, z: 999 };
const loop = samplePath([
  [0, 0],
  [0, 20],
  [20, 20],
  [20, 0],
  [0, 0],
]);
const walker = (s = 0, dir: 1 | -1 = 1): PathWalker => ({ s, dir, speed: 0, cruise: 1.4, pause: 0, walkFor: Infinity });

function runWalker(w: PathWalker, seconds: number, hero = far, closed = true) {
  const rand = mulberry32(1);
  for (let t = 0; t < seconds; t += 1 / 30) stepPathWalker(w, loop, 1 / 30, hero, { closed, rand });
}

describe('path walkers', () => {
  it('walk around a closed loop and wrap', () => {
    const w = walker(70);
    runWalker(w, 10);
    expect(w.s).toBeGreaterThan(0);
    expect(w.s).toBeLessThan(20);
  });

  it('turn around at the ends of an open path', () => {
    const w = walker(78);
    runWalker(w, 5, far, false);
    expect(w.dir).toBe(-1);
    expect(w.s).toBeLessThan(80);
  });

  it('stop for the hero standing in front of them', () => {
    const w = walker(0);
    runWalker(w, 20, { x: 0, y: 0, z: 6 });
    expect(w.s).toBeLessThan(6);
    expect(w.speed).toBeLessThan(0.1);
    expect(walkerPose(w, loop).angle).toBeCloseTo(0);
  });
});

describe('wanderers', () => {
  const opts = (walkable: (x: number, z: number) => boolean = () => true): WanderOptions => ({ walkSpeed: 1.5, runSpeed: 7, fleeRadius: 14, walkable, groundY: () => 0, rand: mulberry32(9) });
  const animal = (): Wanderer => ({ x: 0, z: 0, heading: 0, speed: 0, state: 'idle', timer: 0, tx: 0, tz: 0, home: { x: 0, z: 0, radius: 30 } });

  it('roams but stays near home', () => {
    const c = animal();
    const o = opts();
    let maxR = 0;
    for (let t = 0; t < 300; t += 1 / 20) {
      stepWanderer(c, 1 / 20, far, o);
      maxR = Math.max(maxR, Math.hypot(c.x, c.z));
    }
    expect(maxR).toBeGreaterThan(5);
    expect(maxR).toBeLessThan(33);
  });

  it('flees from a hero on the ground, ignores one flying high', () => {
    const c = animal();
    const o = opts();
    for (let t = 0; t < 2; t += 1 / 20) stepWanderer(c, 1 / 20, { x: 0, y: 0, z: 8 }, o);
    expect(c.state).toBe('flee');
    expect(c.z).toBeLessThan(-2);
    const d = animal();
    for (let t = 0; t < 2; t += 1 / 20) stepWanderer(d, 1 / 20, { x: 0, y: 40, z: 8 }, o);
    expect(d.state).not.toBe('flee');
  });

  it('never steps onto unwalkable ground', () => {
    const c = animal();
    const o = opts((x) => x < 5);
    for (let t = 0; t < 200; t += 1 / 20) {
      stepWanderer(c, 1 / 20, t > 100 ? { x: -6, y: 0, z: 0 } : far, o);
      expect(c.x).toBeLessThan(5);
    }
  });
});

describe('circlers', () => {
  it('fly a circle facing along it', () => {
    const c = { cx: 10, cz: 0, radius: 50, altitude: 60, rate: 0.2, phase: 0 };
    const a = circlerPose(c, 0);
    const b = circlerPose(c, 0.05);
    expect(Math.hypot(a.x - 10, a.z)).toBeCloseTo(50);
    expect(Math.atan2(b.x - a.x, b.z - a.z)).toBeCloseTo(a.angle, 1);
  });
});
