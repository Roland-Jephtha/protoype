import { WATER } from '../../config/world';
import type { PathDef } from './terrainNoise';

/** Water surface height at a point, or null where there's no water. */
export type WaterLevel = (x: number, z: number) => number | null;

/** A river: flat across the channel at the bed's centre-line height plus `depth`, within `halfWidth` of the centre line. */
export function riverLevel(path: PathDef, ground: (x: number, z: number) => number, halfWidth: number, depth: number): WaterLevel {
  const pts = path.points;
  return (x, z) => {
    let best = Infinity;
    let cx = 0;
    let cz = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const px = ax + dx * t;
      const pz = az + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) {
        best = d;
        cx = px;
        cz = pz;
      }
    }
    return best <= halfWidth ? ground(cx, cz) + depth : null;
  };
}

/** Open sea everywhere outside a square of land (|x|, |z| < landHalf). */
export function oceanLevel(landHalf: number, level: number): WaterLevel {
  return (x, z) => (Math.abs(x) < landHalf && Math.abs(z) < landHalf ? null : level);
}

export type OnWater = 'run' | 'wade' | null;

/**
 * Where the hero's feet go over water: fast enough (running, or Speed Force)
 * and he runs on the surface; slower and he sinks to wading/swimming depth.
 * Returns the new feet height and state, or null if the water doesn't hold him
 * (above it, or flying).
 */
export function waterFeet(level: number | null, feetY: number, horizontalSpeed: number, verticalSpeed: number, speedForce: boolean, dt: number): { feetY: number; on: OnWater } | null {
  if (level === null || verticalSpeed > 0.5) return null;
  const fast = horizontalSpeed >= WATER.runSpeed || speedForce;
  const target = level - (fast ? 0 : WATER.wadeDepth);
  if (feetY > target + 0.02) return null;
  // From wading depth up onto the surface is quick but not a snap; from deeper (a river bed,
  // the seabed) he comes straight up — ground snapping would otherwise hold him down there.
  const y = feetY < level - WATER.wadeDepth - 0.05 ? target : Math.min(target, feetY + WATER.riseRate * dt);
  return { feetY: y, on: y >= target - 0.05 ? (fast ? 'run' : 'wade') : null };
}
