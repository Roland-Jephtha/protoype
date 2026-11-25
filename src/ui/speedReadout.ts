import { SPEED_FORCE } from '../config/combat';

/**
 * What the speedometer shows (km/h). In Speed Force the world runs at
 * `worldScale`, so relative to everything around him the hero is moving
 * 1 / worldScale times faster than his real speed.
 */
export function readoutKmh(speedMs: number, speedForce: boolean): number {
  const kmh = speedMs * 3.6;
  return speedForce ? kmh / SPEED_FORCE.worldScale : kmh;
}

/** Eases the shown number toward the target so it visibly counts up (per `dt` seconds). */
export function easeReadout(shown: number, target: number, dt: number): number {
  const k = 1 - Math.exp(-SPEED_FORCE.readoutSharpness * dt);
  const next = shown + (target - shown) * k;
  return Math.abs(target - next) < 0.5 ? target : next;
}
