import { describe, expect, it } from 'vitest';
import { WATER } from '../src/config/world';
import { oceanLevel, riverLevel, waterFeet } from '../src/game/world/waterLevel';

const DT = 1 / 60;

describe('water', () => {
  it('a river is flat across the channel at the centre-line bed height plus its depth', () => {
    const ground = (x: number) => x * 0.01; // the bed rises toward +x
    const level = riverLevel({ points: [[0, 0], [100, 0]], width: 10 } as never, ground, 8, 2);
    expect(level(50, 0)).toBeCloseTo(2.5);
    expect(level(50, 7)).toBeCloseTo(2.5);
    expect(level(50, 9)).toBeNull();
  });

  it('the bay is sea outside the land square', () => {
    const sea = oceanLevel(200, -0.25);
    expect(sea(0, 0)).toBeNull();
    expect(sea(0, 250)).toBe(-0.25);
  });

  it('running holds the hero on the surface; slowing down sinks him to wading depth, never deeper', () => {
    const run = waterFeet(0, -0.5, WATER.runSpeed + 1, 0, false, DT)!;
    expect(run.feetY).toBeGreaterThan(-0.5); // rises toward the surface
    let feet = -0.5;
    for (let i = 0; i < 30; i++) feet = waterFeet(0, feet, 10, 0, false, DT)!.feetY;
    expect(feet).toBeCloseTo(0);
    expect(waterFeet(0, feet, 10, 0, false, DT)!.on).toBe('run');
    // Too slow: the surface no longer holds him (he falls in) until wading depth.
    expect(waterFeet(0, -0.4, 1, 0, false, DT)).toBeNull();
    // From the bottom he comes straight up to wading depth.
    expect(waterFeet(0, -12, 1, -2, false, DT)).toEqual({ feetY: -WATER.wadeDepth, on: 'wade' });
    expect(waterFeet(0, -WATER.wadeDepth - 0.01, 1, -2, false, DT)!.on).toBe('wade');
    // Speed Force: runs on water even from a standstill. Jumping isn't held down.
    expect(waterFeet(0, 0, 0, 0, true, DT)!.on).toBe('run');
    expect(waterFeet(0, 0, 10, 5, false, DT)).toBeNull();
  });
});
