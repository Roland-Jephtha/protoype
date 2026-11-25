import { describe, expect, it } from 'vitest';
import { SPEED_FORCE } from '../src/config/combat';
import { easeReadout, readoutKmh } from '../src/ui/speedReadout';

describe('Speed Force speedometer', () => {
  it('shows speed relative to the slowed world', () => {
    expect(readoutKmh(10, false)).toBeCloseTo(36);
    expect(readoutKmh(10, true)).toBeCloseTo(36 * SPEED_FORCE.readoutScale);
    expect(readoutKmh(10, true)).toBeGreaterThan(readoutKmh(10, false) * 5);
    // A normal run (~5.5 m/s) reads about 1000; boosting at sprint pace reads in the thousands.
    expect(readoutKmh(5.5, true)).toBeGreaterThan(800);
    expect(readoutKmh(33 * SPEED_FORCE.boostSpeed, true, true)).toBeGreaterThan(3000);
  });

  it('counts up toward the target instead of jumping', () => {
    let shown = 0;
    shown = easeReadout(shown, 2000, 0.1);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(2000);
    for (let i = 0; i < 60; i++) shown = easeReadout(shown, 2000, 0.1);
    expect(shown).toBe(2000);
  });
});
