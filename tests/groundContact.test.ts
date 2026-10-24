import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS, PLAYER } from '../src/config/gameConfig';
import { GroundMotor, type MotorInput } from '../src/game/player/groundMovement';
import { CAPSULE_REST_HEIGHT, settleOnGround } from '../src/game/player/groundSnap';

/**
 * Integration test: the real GroundMotor + Rapier character controller +
 * ground depenetration, over the same geometry as the district (huge road
 * slab + 15 cm sidewalk block). The capsule must rest on whatever surface it's
 * on — never sink into it — at walking, running and 80 km/h sprinting speeds.
 */
const DT = PHYSICS.timeStep;
const SIDEWALK = 0.15;

beforeAll(async () => {
  await RAPIER.init();
});

/** Mirrors Player.tsx's per-step logic exactly. */
function simulate(inputs: (step: number) => Partial<MotorInput>, steps: number, onStep?: (y: number, z: number, step: number, grounded: boolean) => void) {
  const world = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
  world.timestep = DT;
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.cuboid(456, 1, 456).setTranslation(0, -1, 0), ground);
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, SIDEWALK - 0.5, 0), ground);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 1.2, 8));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER.capsuleHalfHeight, PLAYER.capsuleRadius), body);

  const c = world.createCharacterController(PLAYER.controllerOffset);
  c.setUp({ x: 0, y: 1, z: 0 });
  c.setMaxSlopeClimbAngle((PLAYER.maxSlopeClimbDeg * Math.PI) / 180);
  c.setMinSlopeSlideAngle((PLAYER.minSlopeSlideDeg * Math.PI) / 180);
  c.enableAutostep(PLAYER.autostepMaxHeight, PLAYER.autostepMinWidth, false);
  c.enableSnapToGround(PLAYER.snapToGroundDistance);
  c.setSlideEnabled(true);

  const motor = new GroundMotor();
  motor.reset(Math.PI);
  for (let i = 0; i < steps; i++) {
    const inp: MotorInput = { moveX: 0, moveY: 0, cameraYaw: 0, sprintHeld: false, jumpPressed: false, jumpHeld: false, ...inputs(i) };
    const desired = motor.step(inp, DT);
    c.computeColliderMovement(collider, desired);
    const a = c.computedMovement();
    const p = body.translation();
    const nx = p.x + a.x;
    const nz = p.z + a.z;
    const settled = settleOnGround(world, RAPIER, nx, p.y + a.y, nz, collider, motor.grounded, motor.velocity.y);
    const ny = settled.y;
    motor.resolve(desired, { x: a.x, y: ny - p.y, z: a.z }, settled.onGround || (c.computedGrounded() && motor.velocity.y <= 0), DT);
    body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    world.step();
    onStep?.(ny, nz, i, motor.grounded);
  }
  const t = body.translation();
  world.free();
  return { y: t.y, z: t.z, state: motor.state };
}

describe('ground contact (character controller + depenetration)', () => {
  it('still jumps normally (snapping never glues the hero to the floor)', () => {
    let peak = 0;
    simulate((i) => ({ jumpPressed: i === 60, jumpHeld: i >= 60 && i < 120 }), 200, (y) => {
      peak = Math.max(peak, y);
    });
    expect(peak).toBeGreaterThan(SIDEWALK + CAPSULE_REST_HEIGHT + 1.5);
  });

  it('rests exactly on the sidewalk', () => {
    const { y } = simulate(() => ({}), 120);
    expect(y).toBeCloseTo(SIDEWALK + CAPSULE_REST_HEIGHT, 2);
  });

  for (const [label, sprint, move, moveSteps] of [
    ['walking', false, 0.4, 600],
    ['running', false, 1, 300],
    ['sprinting', true, 1, 300],
  ] as const) {
    it(`stays on top of the road after ${label} off the curb (never sinks, never flickers airborne)`, () => {
      let minRoadY = Infinity;
      let airborneOnRoad = 0;
      // Move toward +Z (S relative to a yaw-0 camera) off the 15 cm curb onto the road, then stop.
      const { y, z, state } = simulate(
        (i) => (i < moveSteps ? { moveY: -move, sprintHeld: sprint } : {}),
        moveSteps + 120,
        (yy, zz, _i, grounded) => {
          if (zz > 21.5) {
            minRoadY = Math.min(minRoadY, yy);
            if (!grounded) airborneOnRoad++;
          }
        },
      );
      expect(z).toBeGreaterThan(21.5); // really ended up on the road
      expect(minRoadY).toBeGreaterThan(CAPSULE_REST_HEIGHT - 0.002);
      expect(airborneOnRoad).toBe(0);
      expect(y).toBeCloseTo(CAPSULE_REST_HEIGHT, 2);
      expect(state).toBe('idle');
    });
  }
});
