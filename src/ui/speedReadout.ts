import { SPEED_FORCE } from '../config/combat';

/**
 * What the speedometer shows (km/h). In Speed Force everything around him
 * crawls, so relative to the world he is enormously fast: ~1000 km/h at a
 * normal run, 3000–4000 when he boosts.
 */
export function readoutKmh(speedMs: number, speedForce: boolean, boosting = false): number {
  const kmh = speedMs * 3.6;
  return speedForce ? kmh * (boosting ? SPEED_FORCE.readoutBoosted : SPEED_FORCE.readoutScale) : kmh;
}

/** Eases the shown number toward the target so it visibly counts up (per `dt` seconds). */
export function easeReadout(shown: number, target: number, dt: number): number {
  const k = 1 - Math.exp(-SPEED_FORCE.readoutSharpness * dt);
  const next = shown + (target - shown) * k;
  return Math.abs(target - next) < 0.5 ? target : next;
}
