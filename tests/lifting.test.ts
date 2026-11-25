import { describe, expect, it } from 'vitest';
import { clubAngle, ONE_HANDED } from '../src/game/combat/liftShapes';

describe('held weapons', () => {
  it('long things are one-handed clubs; vehicles and rocks are two-handed', () => {
    expect(ONE_HANDED.has('streetLight')).toBe(true);
    expect(ONE_HANDED.has('conifer')).toBe(true);
    expect(ONE_HANDED.has('sedan')).toBe(false);
    expect(ONE_HANDED.has('boulder')).toBe(false);
  });

  it('a swing chops from over the shoulder down in front, then comes back up', () => {
    const rest = clubAngle(-1, 0.5);
    expect(rest).toBeGreaterThan(Math.PI / 2); // up and back over the shoulder
    expect(clubAngle(0.2, 0.5)).toBeLessThan(0); // forward-down at the hit
    expect(clubAngle(0.49, 0.5)).toBeGreaterThan(1.5);
    expect(clubAngle(0.5, 0.5)).toBe(rest);
  });
});
