import { HERO_HIT, MISSION_RULES } from '../../config/combat';
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
    const heavy = controlLoss >= HERO_HIT.knockdownAt;
    const flying = runtime.moveMode === 'flight';
    // Heavy blows put him down until he's back on his feet.
    const down = heavy && !flying ? HERO_HIT.fall + HERO_HIT.lie + HERO_HIT.getUp * 0.5 : controlLoss;
    runtime.heroImpulse.x += knock.x;
    runtime.heroImpulse.y += knock.y;
    runtime.heroImpulse.z += knock.z;
    runtime.heroControlLoss = Math.max(runtime.heroControlLoss, down);
    const h = runtime.heroHit;
    // A light hit doesn't interrupt a knockdown already under way.
    if (heavy || h.t < 0 || h.kind === 'stagger') {
      const yaw = runtime.heroFacingYaw;
      h.t = 0;
      h.kind = heavy ? (flying ? 'tumble' : 'knockdown') : 'stagger';
      // Hit from behind: falls on his face; from the front: on his back.
      h.forward = knock.x * Math.sin(yaw) + knock.z * Math.cos(yaw) > 0;
    }
  }
}

/** Hit-reaction tilt (rad, + = forward) and how far the hips drop (0..1) at `t` seconds in; null once over. */
export function hitPose(kind: 'stagger' | 'knockdown' | 'tumble', t: number, forward: boolean): { pitch: number; drop: number } | null {
  const H = HERO_HIT;
  const ease = (x: number) => x * x * (3 - 2 * x);
  const dir = forward ? 1 : -1;
  if (kind === 'stagger') {
    if (t >= H.stagger) return null;
    return { pitch: dir * H.staggerLean * Math.sin((t / H.stagger) * Math.PI), drop: 0 };
  }
  if (kind === 'tumble') {
    if (t >= H.tumble) return null;
    return { pitch: dir * Math.PI * 2 * ease(t / H.tumble), drop: 0 };
  }
  const total = H.fall + H.lie + H.getUp;
  if (t >= total) return null;
  const k = t < H.fall ? ease(t / H.fall) : t < H.fall + H.lie ? 1 : 1 - ease((t - H.fall - H.lie) / H.getUp);
  return { pitch: dir * (Math.PI / 2) * 0.96 * k, drop: k };
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
