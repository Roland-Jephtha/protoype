import { describe, expect, it } from 'vitest';
import { lightState, offsetPath, samplePath, stepTraffic, type Lane, type TrafficContext, type Vehicle } from '../src/game/vehicles/traffic';

const straight = (len = 400): Lane => ({ id: 'a', path: samplePath([[0, 0], [0, len]]), stops: [], speedLimit: 14 });
const far: TrafficContext = { player: { x: 999, y: 0, z: 999 }, groundY: () => 0, light: () => 'green' };
const car = (s: number, speed = 0): Vehicle => ({ lane: 0, s, speed, temper: 1, length: 4.4 });

function simulate(vs: Vehicle[], lanes: Lane[], seconds: number, ctx: TrafficContext) {
  for (let t = 0; t < seconds; t += 1 / 60) stepTraffic(vs, lanes, 1 / 60, ctx);
}

describe('samplePath', () => {
  it('measures length and interpolates position and heading', () => {
    const p = samplePath([[0, 0], [0, 100], [100, 100]]);
    expect(p.length).toBeCloseTo(200);
    expect(p.at(50)).toMatchObject({ x: 0, z: 50 });
    expect(p.at(150).x).toBeCloseTo(50);
    expect(p.at(150).angle).toBeCloseTo(Math.PI / 2);
  });
});

describe('traffic', () => {
  it('accelerates to its cruising speed', () => {
    const v = [car(0)];
    simulate(v, [straight()], 8, far);
    expect(v[0].speed).toBeCloseTo(14, 0);
  });

  it('never runs into the vehicle ahead', () => {
    const lead = car(30, 0);
    lead.temper = 0; // parked
    const follower = car(0, 14);
    const vs = [lead, follower];
    let minGap = Infinity;
    for (let t = 0; t < 10; t += 1 / 60) {
      stepTraffic(vs, [straight()], 1 / 60, far);
      minGap = Math.min(minGap, lead.s - follower.s - 4.4);
    }
    expect(minGap).toBeGreaterThan(1);
    expect(follower.speed).toBeLessThan(0.5);
  });

  it('stops at a red light and goes on green', () => {
    const lane: Lane = { ...straight(), stops: [{ s: 100, group: 'z' }] };
    const v = [car(0)];
    let state: 'red' | 'green' = 'red';
    const ctx: TrafficContext = { ...far, light: () => state };
    simulate(v, [lane], 20, ctx);
    expect(v[0].s).toBeLessThan(100);
    expect(v[0].s).toBeGreaterThan(90);
    expect(v[0].speed).toBeLessThan(0.3);
    state = 'green';
    simulate(v, [lane], 5, ctx);
    expect(v[0].s).toBeGreaterThan(110);
  });

  it('brakes for the hero standing in its lane, but not for one flying above', () => {
    const v = [car(0, 14)];
    simulate(v, [straight()], 6, { ...far, player: { x: 0, y: 0, z: 60 } });
    expect(v[0].s).toBeLessThan(60);
    expect(v[0].speed).toBeLessThan(0.5);
    const w = [car(0, 14)];
    simulate(w, [straight()], 6, { ...far, player: { x: 0, y: 40, z: 60 } });
    expect(w[0].s).toBeGreaterThan(70);
  });

  it('wraps to the start of the lane at the end', () => {
    const v = [car(395, 14)];
    simulate(v, [straight()], 1, far);
    expect(v[0].s).toBeLessThan(20);
  });

  it('alternates light groups and never shows both green', () => {
    for (let t = 0; t < 36; t += 0.25) {
      expect(lightState('x', t) === 'green' && lightState('z', t) === 'green').toBe(false);
    }
    expect(lightState('x', 1)).toBe('green');
    expect(lightState('z', 10)).toBe('green');
  });
});

describe('offsetPath', () => {
  it('offsets to the right of travel (heading +Z → right is -X; heading +X → right is +Z)', () => {
    expect(offsetPath([[0, 0], [0, 10]], 3)[0][0]).toBeCloseTo(-3);
    expect(offsetPath([[0, 0], [10, 0]], 3)[0][1]).toBeCloseTo(3);
  });
});
