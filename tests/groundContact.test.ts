import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS, PLAYER } from '../src/config/gameConfig';
import { GroundMotor, type MotorInput } from '../src/game/player/groundMovement';
import { CAPSULE_REST_HEIGHT, settleOnGround } from '../src/game/player/groundSnap';
import { REGIONS, TERRAIN_CELLS, type TerrainRegion } from '../src/config/regions';
import { createHeightFunction, gridHeightAt, sampleGrid, toRapierHeights } from '../src/game/world/terrainNoise';

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

interface StepInfo {
  x: number;
  y: number;
  z: number;
  step: number;
  grounded: boolean;
  mode: string;
}

/**
 * Runs the hero over whatever `buildGround` creates, mirroring Player.tsx's
 * per-step logic exactly (motor → controller → settleOnGround → resolve).
 */
function runHero(
  buildGround: (world: RAPIER.World) => void,
  start: [number, number, number],
  inputs: (step: number) => Partial<MotorInput>,
  steps: number,
  onStep?: (info: StepInfo) => void,
) {
  const world = new RAPIER.World({ x: 0, y: -PHYSICS.gravity, z: 0 });
  world.timestep = DT;
  buildGround(world);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(...start));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(PLAYER.capsuleHalfHeight, PLAYER.capsuleRadius), body);
  world.step();

  const c = world.createCharacterController(PLAYER.controllerOffset);
  c.setUp({ x: 0, y: 1, z: 0 });
  c.setMaxSlopeClimbAngle((PLAYER.maxSlopeClimbDeg * Math.PI) / 180);
  c.setMinSlopeSlideAngle((PLAYER.minSlopeSlideDeg * Math.PI) / 180);
  c.enableAutostep(PLAYER.autostepMaxHeight, PLAYER.autostepMinWidth, false);
  c.enableSnapToGround(PLAYER.snapToGroundDistance);
  c.setSlideEnabled(true);

  const motor = new GroundMotor();
  motor.reset(Math.PI);
  let flying = false;
  for (let i = 0; i < steps; i++) {
    const inp: MotorInput = { moveX: 0, moveY: 0, cameraYaw: 0, sprintHeld: false, jumpPressed: false, jumpHeld: false, ...inputs(i) };
    const desired = motor.step(inp, DT);
    if ((motor.mode === 'flight') !== flying) {
      flying = motor.mode === 'flight';
      if (flying) c.disableSnapToGround();
      else c.enableSnapToGround(PLAYER.snapToGroundDistance);
    }
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
    onStep?.({ x: nx, y: ny, z: nz, step: i, grounded: motor.grounded, mode: motor.mode });
  }
  const t = body.translation();
  world.free();
  return { x: t.x, y: t.y, z: t.z, state: motor.state, mode: motor.mode };
}

/** The city setup: huge road slab + 15 cm sidewalk block. */
function simulate(inputs: (step: number) => Partial<MotorInput>, steps: number, onStep?: (y: number, z: number, step: number, grounded: boolean) => void) {
  return runHero(
    (world) => {
      const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      world.createCollider(RAPIER.ColliderDesc.cuboid(456, 1, 456).setTranslation(0, -1, 0), ground);
      world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.5, 20).setTranslation(0, SIDEWALK - 0.5, 0), ground);
    },
    [0, 1.2, 8],
    inputs,
    steps,
    onStep && ((s) => onStep(s.y, s.z, s.step, s.grounded)),
  );
}

/** Outdoor setup: the region's real heightfield (medium resolution, exactly as in-game). */
function terrainWorld(region: TerrainRegion) {
  const cells = TERRAIN_CELLS.medium;
  const grid = sampleGrid(createHeightFunction(region.terrain), region.size, cells);
  const ground = (x: number, z: number) => gridHeightAt(grid, region.size, cells, x, z);
  const build = (world: RAPIER.World) => {
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(cells, cells, toRapierHeights(grid, cells), { x: region.size, y: 1, z: region.size }),
      world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    );
  };
  return { ground, build };
}

describe('ground contact on outdoor terrain (heightfield)', () => {
  for (const id of ['desert', 'forest'] as const) {
    const region = REGIONS[id] as TerrainRegion;
    const { ground, build } = terrainWorld(region);

    it(`${region.name}: running and sprinting over the hills never sinks below the surface`, () => {
      const sx = region.spawn.x;
      const sz = region.spawn.z;
      let worstSink = 0;
      let groundedSteps = 0;
      // Sprint 20 s in a long curve across varied terrain, then run back.
      runHero(
        build,
        [sx, ground(sx, sz) + CAPSULE_REST_HEIGHT + 0.3, sz],
        (i) => ({ moveX: Math.sin(i / 300), moveY: 1, cameraYaw: i / 900, sprintHeld: i < 1200 }),
        1800,
        (s) => {
          if (s.step < 30 || !s.grounded) return;
          groundedSteps++;
          // Capsule bottom vs the exact triangulated surface right under its centre.
          const bottom = s.y - (PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius);
          worstSink = Math.min(worstSink, bottom - ground(s.x, s.z));
        },
      );
      expect(groundedSteps).toBeGreaterThan(900);
      expect(worstSink).toBeGreaterThan(-0.005);
    });

    it(`${region.name}: flying, then descending onto the terrain, lands on top of it`, () => {
      const sx = region.spawn.x;
      const sz = region.spawn.z;
      const end = runHero(
        build,
        [sx, ground(sx, sz) + CAPSULE_REST_HEIGHT + 0.3, sz],
        (i) => (i === 10 ? { flyPressed: true } : i < 100 ? { jumpHeld: true } : i < 400 ? { moveY: 1, sprintHeld: true } : { descendHeld: true }),
        900,
      );
      expect(end.mode).toBe('ground');
      expect(end.y - CAPSULE_REST_HEIGHT - ground(end.x, end.z)).toBeGreaterThan(-0.005);
      expect(end.y - CAPSULE_REST_HEIGHT - ground(end.x, end.z)).toBeLessThan(0.08);
    });
  }
});

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
