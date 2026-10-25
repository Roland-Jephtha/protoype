import { MISSION_RULES } from '../../config/combat';
import { useApp } from '../../state/appStore';
import { CAPSULE_REST_HEIGHT } from '../player/groundSnap';
import { runtime } from '../runtime';

/** Hero's feet height from the published capsule position. */
export const heroFeetY = () => runtime.playerPosition.y - CAPSULE_REST_HEIGHT;

/**
 * An enemy hits the hero: damage, plus a knockback impulse (m/s) that takes
 * control away for `controlLoss` seconds. Knocks him out at zero health.
 */
export function hitHero(amount: number, knock: { x: number; y: number; z: number } | null = null, controlLoss = 0.4) {
  if (runtime.combat.takeDamage(amount)) {
    knockOut();
    return;
  }
  if (knock) {
    runtime.heroImpulse.x += knock.x;
    runtime.heroImpulse.y += knock.y;
    runtime.heroImpulse.z += knock.z;
    runtime.heroControlLoss = Math.max(runtime.heroControlLoss, controlLoss);
  }
}

/** The hero was knocked out: back to the checkpoint with full health and a moment's grace. */
export function knockOut() {
  runtime.combat.reset();
  runtime.beam.active = false;
  runtime.heroImpulse.set(0, 0, 0);
  runtime.heroFrozen = 0;
  const app = useApp.getState();
  if (app.mode === 'story' && app.missionPhase === 'active') {
    runtime.knockouts++;
    if (runtime.knockouts >= MISSION_RULES.knockoutsToFail) {
      app.failMission('You were knocked out.');
      return;
    }
    app.restartCheckpoint();
    app.showToast('Knocked down — back to the checkpoint. One more and the mission fails.');
    return;
  }
  app.restartCheckpoint();
  app.showToast('Knocked down: back at the start point');
}
