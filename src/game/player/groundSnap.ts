import type RAPIER from '@dimforge/rapier3d-compat';
import { PLAYER } from '../../config/gameConfig';

/** Capsule centre height above the surface it rests on (incl. the controller's skin offset). */
export const CAPSULE_REST_HEIGHT = PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius + PLAYER.controllerOffset;

/** Distance from the capsule centre straight down to the nearest surface (Infinity if none within reach). */
export function groundDistance(world: RAPIER.World, rapier: typeof RAPIER, x: number, y: number, z: number, exclude: RAPIER.Collider): number {
  const ray = new rapier.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
  const hit = world.castRay(ray, CAPSULE_REST_HEIGHT + PLAYER.snapToGroundDistance + 0.05, true, undefined, undefined, exclude);
  return hit ? hit.timeOfImpact : Infinity;
}

/**
 * Keeps the capsule exactly on top of the ground after the character
 * controller has moved it. Two corrections, both along a ray straight down from
 * the capsule centre (so they only ever use a surface directly underneath):
 *
 * - Depenetration: Rapier's controller can let the capsule creep into large
 *   flat colliders during long grazing sweeps (sprinting at 80 km/h moves
 *   ~0.37 m per step) and never pushes back out. If the capsule bottom is below
 *   the surface, lift it to rest exactly on it.
 * - Snap down: running off small drops (a 15 cm curb) at speed would launch the
 *   character into a brief fall — playing the falling pose for a few frames. If
 *   we were grounded, aren't moving up, and a surface is within the snap
 *   distance, stay planted on it. Bigger drops still fall normally.
 *
 * On slopes and step edges the centre sits higher than the rest height, so the
 * depenetration never lifts there.
 */
export function settleOnGround(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  x: number,
  y: number,
  z: number,
  exclude: RAPIER.Collider,
  wasGrounded: boolean,
  verticalVelocity: number,
): { y: number; onGround: boolean } {
  const d = groundDistance(world, rapier, x, y, z, exclude);
  if (d < CAPSULE_REST_HEIGHT) return { y: y + (CAPSULE_REST_HEIGHT - d), onGround: verticalVelocity <= 0 };
  if (verticalVelocity > 0) return { y, onGround: false };
  if (wasGrounded && d <= CAPSULE_REST_HEIGHT + PLAYER.snapToGroundDistance) return { y: y - (d - CAPSULE_REST_HEIGHT), onGround: true };
  return { y, onGround: d < CAPSULE_REST_HEIGHT + 0.06 };
}
