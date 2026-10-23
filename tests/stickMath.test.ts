import { describe, expect, it } from 'vitest';
import { applyRadialDeadZone, clampUnit, pointerOffsetToStick } from '../src/input/stickMath';

describe('pointerOffsetToStick', () => {
  it('clamps the knob to the stick radius and normalizes output (y up = forward)', () => {
    const s = pointerOffsetToStick(0, -200, 50);
    expect(s.knobY).toBeCloseTo(-50);
    expect(s.rawY).toBeCloseTo(1);
    expect(s.rawX).toBeCloseTo(0);
  });

  it('keeps offsets inside the radius untouched', () => {
    const s = pointerOffsetToStick(10, 20, 50);
    expect(s.knobX).toBe(10);
    expect(s.knobY).toBe(20);
    expect(s.rawX).toBeCloseTo(0.2);
    expect(s.rawY).toBeCloseTo(-0.4);
  });
});

describe('applyRadialDeadZone', () => {
  it('outputs zero inside the dead zone', () => {
    expect(applyRadialDeadZone(0.1, 0.05, 0.15).magnitude).toBe(0);
  });

  it('ramps from 0 at the dead-zone edge to 1 at full deflection', () => {
    expect(applyRadialDeadZone(0.15001, 0, 0.15).magnitude).toBeCloseTo(0, 3);
    expect(applyRadialDeadZone(1, 0, 0.15).magnitude).toBeCloseTo(1);
  });

  it('preserves direction exactly for any angle (360° movement)', () => {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 7) {
      const out = applyRadialDeadZone(Math.cos(a) * 0.8, Math.sin(a) * 0.8, 0.1, 1.4);
      expect(Math.atan2(out.y, out.x)).toBeCloseTo(Math.atan2(Math.sin(a), Math.cos(a)));
    }
  });

  it('response exponent >1 gives finer control at partial deflection', () => {
    const linear = applyRadialDeadZone(0.5, 0, 0, 1).magnitude;
    const curved = applyRadialDeadZone(0.5, 0, 0, 2).magnitude;
    expect(curved).toBeLessThan(linear);
  });

  it('never exceeds unit magnitude', () => {
    expect(applyRadialDeadZone(3, 4, 0.1).magnitude).toBeCloseTo(1);
  });
});

describe('clampUnit', () => {
  it('normalizes diagonal keyboard input', () => {
    const v = clampUnit(1, 1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  });
});
