import { describe, expect, it } from 'vitest';
import { CAMERA } from '../src/config/gameConfig';
import { clampPitch, nextCameraDistance, orbitOffset } from '../src/game/camera/cameraMath';

describe('camera math', () => {
  it('places the camera behind (+Z) the target at yaw 0', () => {
    const o = orbitOffset(0, 0);
    expect(o.z).toBeCloseTo(1);
    expect(o.x).toBeCloseTo(0);
  });

  it('negative pitch puts the camera above the target', () => {
    expect(orbitOffset(0, -0.5).y).toBeGreaterThan(0);
  });

  it('clamps pitch to the configured limits', () => {
    expect(clampPitch(10)).toBe(CAMERA.maxPitch);
    expect(clampPitch(-10)).toBe(CAMERA.minPitch);
  });

  it('pulls in instantly on collision but eases back out', () => {
    expect(nextCameraDistance(5, 5, 2, 1 / 60)).toBe(2);
    const out = nextCameraDistance(2, 5, 10, 1 / 60);
    expect(out).toBeGreaterThan(2);
    expect(out).toBeLessThan(5);
  });

  it('never goes closer than the minimum distance', () => {
    expect(nextCameraDistance(5, 5, 0, 1 / 60)).toBe(CAMERA.minDistance);
  });
});
