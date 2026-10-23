import { PlaneGeometry, type Object3D } from 'three';
import type { GroundMotor } from './groundMovement';

/**
 * Procedural cape shared by the placeholder hero and GLB heroes.
 * Geometry hangs from y = 0 (shoulders) down to -length, wrapped around the back.
 */
export function createCapeGeometry(length = 1.2, topWidth = 0.36, hemWidth = 0.7) {
  const g = new PlaneGeometry(1, length, 6, 8);
  g.translate(0, -length / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const t = -pos.getY(i) / length; // 0 at shoulders, 1 at hem
    pos.setX(i, x * (topWidth + (hemWidth - topWidth) * t));
    // Wrap around the back; deeper folds toward the hem.
    pos.setZ(i, -Math.pow(Math.abs(x) * 2, 2) * (0.05 + 0.08 * t) + Math.sin(x * 18) * 0.012 * t);
  }
  g.computeVertexNormals();
  return g;
}

/** Per-instance cape animation state. */
export interface CapeState {
  lift: number;
  phase: number;
}

/**
 * Lifts the cape with speed and falling, plus a small flutter.
 * `pivot.rotation.x` > 0 swings the hem backwards (toward -Z).
 */
export function updateCape(pivot: Object3D, motor: GroundMotor, s: CapeState, dt: number) {
  const v = motor.velocity;
  const hSpeed = Math.hypot(v.x, v.z);
  const falling = motor.state === 'fall';
  const target = Math.min(1.25, 0.08 + hSpeed * 0.07 + (falling ? 0.5 : 0) + (motor.state === 'jump' ? -0.05 : 0));
  s.lift += (target - s.lift) * (1 - Math.exp(-6 * dt));
  s.phase += dt * (4 + hSpeed * 0.8);
  pivot.rotation.x = s.lift + Math.sin(s.phase) * 0.04 * (0.3 + hSpeed * 0.1);
}
