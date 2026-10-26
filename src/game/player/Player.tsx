import type { KinematicCharacterController } from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import {
  CapsuleCollider,
  RigidBody,
  useBeforePhysicsStep,
  useRapier,
  type RapierCollider,
  type RapierRigidBody,
} from '@react-three/rapier';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';
import { CAMERA, FLIGHT, PLAYER } from '../../config/gameConfig';
import { crossedSide, oppositeSide, type Entry, type RegionDef } from '../../config/regions';
import { HERO_COMBAT, SPEED_FORCE } from '../../config/combat';
import { VILLAIN_AI } from '../../config/villains';
import { addImpact } from '../combat/impacts';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { waterFeet } from '../world/waterLevel';
import { WATER } from '../../config/world';
import { GroundMotor } from './groundMovement';
import { CAPSULE_REST_HEIGHT, settleOnGround } from './groundSnap';
import { HeroVisual } from './HeroVisual';

/** Height above the ground when arriving in a region mid-flight (m). */
const ARRIVE_FLYING_ALTITUDE = 35;

interface Spawn extends Entry {
  y: number;
  flying: boolean;
}

/**
 * Player entity: a kinematic capsule moved by Rapier's character controller
 * (swept shape casts → no tunnelling, auto-step, slope limits, ground snap).
 * Locomotion decisions come from GroundMotor; this component only bridges
 * input → motor → physics → runtime telemetry, once per fixed physics step.
 *
 * Region-aware: spawns at the region's spawn or the entry for the edge it
 * arrived through, and crossing an edge with an exit travels to that region.
 */
export function Player({ region, half, ground }: { region: RegionDef; half: number; ground?: (x: number, z: number) => number }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<Group>(null);
  const { world, rapier } = useRapier();
  const motor = useMemo(() => new GroundMotor(), []);
  const respawnToken = useApp((s) => s.respawnToken);
  const flyingRef = useRef(false);
  const travelling = useRef(false);

  // Where we start: the edge we arrived through, else the region spawn. Computed
  // once per mount, and the camera is aimed to match before it first renders.
  const [spawn] = useState<Spawn>(() => {
    const arrival = useApp.getState().arrival;
    const entry = arrival?.at ?? ((arrival?.side && region.entries[arrival.side]) || region.spawn);
    const groundY = ground ? ground(entry.x, entry.z) + CAPSULE_REST_HEIGHT + 0.2 : PLAYER.spawn[1];
    const flying = !!arrival?.flying;
    const y = groundY + (flying ? ARRIVE_FLYING_ALTITUDE : 0);
    runtime.cameraYaw = entry.facing + Math.PI;
    runtime.playerRenderPosition.set(entry.x, y - CAPSULE_REST_HEIGHT, entry.z);
    return { ...entry, y, flying };
  });

  // Created in an effect (not useMemo) so StrictMode's mount/unmount/mount
  // never leaves us holding a freed WASM controller.
  const controllerRef = useRef<KinematicCharacterController | null>(null);
  useEffect(() => {
    const c = world.createCharacterController(PLAYER.controllerOffset);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((PLAYER.maxSlopeClimbDeg * Math.PI) / 180);
    c.setMinSlopeSlideAngle((PLAYER.minSlopeSlideDeg * Math.PI) / 180);
    c.enableAutostep(PLAYER.autostepMaxHeight, PLAYER.autostepMinWidth, false);
    c.enableSnapToGround(PLAYER.snapToGroundDistance);
    c.setSlideEnabled(true);
    c.setApplyImpulsesToDynamicBodies(true);
    controllerRef.current = c;
    flyingRef.current = false;
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  const placeAtSpawn = useCallback(
    (s: Spawn) => {
      motor.reset(s.facing);
      if (s.flying) motor.startFlying(Math.sin(s.facing) * FLIGHT.baseSpeed, 0, Math.cos(s.facing) * FLIGHT.baseSpeed);
      runtime.playerPosition.set(s.x, s.y, s.z);
      runtime.playerVelocity.set(motor.velocity.x, motor.velocity.y, motor.velocity.z);
    },
    [motor],
  );

  const respawn = useCallback(() => {
    const b = body.current;
    if (!b) return;
    // Restart returns to solid ground: the mission checkpoint if it's in this region, else the region's spawn.
    const rp = runtime.respawnPoint;
    const s = rp && rp.region === region.id ? rp : region.spawn;
    const y = ground ? ground(s.x, s.z) + CAPSULE_REST_HEIGHT + 0.2 : PLAYER.spawn[1];
    b.setTranslation({ x: s.x, y, z: s.z }, true);
    b.setNextKinematicTranslation({ x: s.x, y, z: s.z });
    placeAtSpawn({ ...s, y, flying: false });
  }, [region, ground, placeAtSpawn]);

  useEffect(() => {
    runtime.playerBody = body.current;
    runtime.regionHalf = half;
    placeAtSpawn(spawn);
    return () => {
      runtime.playerBody = null;
    };
  }, [placeAtSpawn, spawn, half]);

  // Restart Checkpoint (the region spawn is the only checkpoint for now).
  useEffect(() => {
    if (respawnToken > 0) respawn();
  }, [respawnToken, respawn]);

  useBeforePhysicsStep((w) => {
    const b = body.current;
    const c = collider.current;
    const controller = controllerRef.current;
    if (!b || !c || !controller || travelling.current) return;
    const dt = w.timestep;
    runtime.physicsSteps++;

    // Knockback from enemies, and freeze-breath slowing.
    const imp = runtime.heroImpulse;
    if (imp.lengthSq() > 0) {
      motor.applyImpulse(imp.x, imp.y, imp.z, runtime.heroControlLoss);
      imp.set(0, 0, 0);
      runtime.heroControlLoss = 0;
    }
    runtime.heroFrozen = Math.max(0, runtime.heroFrozen - dt);
    if (runtime.heroHit.t >= 0) runtime.heroHit.t += dt;
    if (runtime.heroDash) {
      const d = runtime.heroDash;
      motor.dash(d.x, d.y, d.z, HERO_COMBAT.powerPunch.lungeTime);
      runtime.heroDash = null;
    }

    const move = input.getMove();
    const desired = motor.step(
      {
        moveX: move.x,
        moveY: move.y,
        cameraYaw: runtime.cameraYaw,
        // Level flight at the camera's default framing; look up/down to climb/dive.
        cameraPitch: runtime.cameraPitch - CAMERA.defaultPitch,
        sprintHeld: input.isHeld('sprint'),
        jumpPressed: input.consumePressed('jump'),
        jumpHeld: input.isHeld('jump'),
        flyPressed: input.consumePressed('fly'),
        flyHeld: input.isHeld('fly'),
        descendHeld: input.isHeld('descend'),
        faceYaw: runtime.combatFaceYaw ?? undefined,
        speedScale: (runtime.heroFrozen > 0 ? VILLAIN_AI.freezeSlow : 1) * (runtime.speedForce ? SPEED_FORCE.heroSpeed : 1) * (runtime.heroOnWater === 'wade' ? WATER.swimSpeed : 1),
      },
      dt,
    );

    // Rapier's own ground snapping would drag a low-flying hero onto the floor.
    const flying = motor.mode === 'flight';
    if (flying !== flyingRef.current) {
      flyingRef.current = flying;
      if (flying) controller.disableSnapToGround();
      else controller.enableSnapToGround(PLAYER.snapToGroundDistance);
      useApp.getState().setFlying(flying);
    }

    controller.computeColliderMovement(c, desired);
    const actual = controller.computedMovement();

    const p = b.translation();
    let nx = p.x + actual.x;
    let nz = p.z + actual.z;

    // Region edges: an exit travels on; otherwise the edge holds the hero back.
    const side = crossedSide(nx, nz, half);
    if (side) {
      const dest = region.exits[side];
      if (dest) {
        travelling.current = true;
        useApp.getState().travelTo(dest, { side: oppositeSide(side), flying });
        return;
      }
      if (Math.abs(nx) > half) {
        nx = Math.sign(nx) * half;
        motor.stopAxis('x');
      }
      if (Math.abs(nz) > half) {
        nz = Math.sign(nz) * half;
        motor.stopAxis('z');
      }
    }

    // Keep the capsule exactly on top of the surface: no creeping into it at speed,
    // no brief falls off curbs while sprinting.
    const settled = settleOnGround(w, rapier, nx, p.y + actual.y, nz, c, motor.grounded, motor.velocity.y);
    let ny = settled.y;
    // Water: fast enough and he runs on the surface; slower, he wades / swims.
    let onWater = false;
    runtime.heroOnWater = null;
    if (!flying && runtime.waterLevel) {
      const v = motor.velocity;
      const wf = waterFeet(runtime.waterLevel(nx, nz), ny - CAPSULE_REST_HEIGHT, Math.hypot(v.x, v.z), v.y, runtime.speedForce, dt);
      if (wf) {
        ny = wf.feetY + CAPSULE_REST_HEIGHT;
        onWater = wf.on !== null;
        runtime.heroOnWater = wf.on;
      }
    }
    if (ny > FLIGHT.maxAltitude) {
      ny = FLIGHT.maxAltitude;
      motor.clampAltitude();
    }
    motor.resolve(desired, { x: nx - p.x, y: ny - p.y, z: nz - p.z }, onWater || settled.onGround || (controller.computedGrounded() && motor.velocity.y <= 0), dt);
    if (ny < PLAYER.killPlaneY) {
      respawn();
      return;
    }
    b.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    runtime.playerPosition.set(nx, ny, nz);
    runtime.playerVelocity.set(motor.velocity.x, motor.velocity.y, motor.velocity.z);
    runtime.heroFacingYaw = motor.facingYaw;
    runtime.heroDashing = motor.dashing;
    const launch = motor.consumeLaunch();
    if (launch > 0) {
      runtime.launchPower = launch;
      runtime.launches++;
      runtime.cameraShake = Math.max(runtime.cameraShake, 0.3 + launch * 0.6);
      addImpact({ x: nx, y: ny - CAPSULE_REST_HEIGHT, z: nz }, 'launch');
    }
    runtime.playerState = motor.state;
    runtime.moveMode = motor.mode;
    runtime.grounded = motor.grounded;
  });

  // After physics has interpolated the body (priority -50), publish the
  // render-time position for the camera (priority -30).
  useFrame(() => {
    visual.current?.getWorldPosition(runtime.playerRenderPosition);
  }, -40);

  // Must stay referentially stable: a new array on re-render (e.g. pausing) makes
  // the physics wrapper rebuild the body, removing the old one twice → Rapier panic.
  const spawnPosition = useMemo<[number, number, number]>(() => [spawn.x, spawn.y, spawn.z], [spawn]);

  const feetOffset = -(PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius);
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={spawnPosition}>
      <CapsuleCollider ref={collider} args={[PLAYER.capsuleHalfHeight, PLAYER.capsuleRadius]} />
      <group ref={visual} position={[0, feetOffset, 0]}>
        <HeroVisual motor={motor} />
      </group>
    </RigidBody>
  );
}
