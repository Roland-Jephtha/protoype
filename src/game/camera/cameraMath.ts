import { CAMERA } from '../../config/gameConfig';

/** Frame-rate independent exponential smoothing factor. */
export function damp(sharpness: number, dt: number): number {
  return 1 - Math.exp(-sharpness * dt);
}

export function clampPitch(pitch: number): number {
  return Math.min(CAMERA.maxPitch, Math.max(CAMERA.minPitch, pitch));
}

/**
 * Unit offset from the look target to the camera for a given yaw/pitch.
 * yaw 0 → camera behind the target on +Z looking toward -Z.
 * Negative pitch → camera above the target looking down.
 */
export function orbitOffset(yaw: number, pitch: number) {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: -Math.sin(pitch), z: Math.cos(yaw) * cp };
}

/**
 * Next camera distance given the collision-limited distance: pull in
 * immediately (never clip), ease back out slowly (no popping).
 */
export function nextCameraDistance(current: number, desired: number, collisionLimit: number, dt: number) {
  const target = Math.max(CAMERA.minDistance, Math.min(desired, collisionLimit));
  if (target < current) return target;
  return current + (target - current) * damp(CAMERA.collisionRecoverSharpness, dt);
}
