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
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { CAMERA, FLIGHT, PLAYER } from '../../config/gameConfig';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { GroundMotor } from './groundMovement';
import { settleOnGround } from './groundSnap';
import { HeroVisual } from './HeroVisual';

const SPAWN_FACING = Math.PI; // facing -Z, toward the landmark tower

/**
 * Player entity: a kinematic capsule moved by Rapier's character controller
 * (swept shape casts → no tunnelling, auto-step, slope limits, ground snap).
 * Locomotion decisions come from GroundMotor; this component only bridges
 * input → motor → physics → runtime telemetry, once per fixed physics step.
 */
export function Player() {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const visual = useRef<Group>(null);
  const { world, rapier } = useRapier();
  const motor = useMemo(() => new GroundMotor(), []);
  const respawnToken = useApp((s) => s.respawnToken);
  const flyingRef = useRef(false);

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
    return () => {
      controllerRef.current = null;
      world.removeCharacterController(c);
    };
  }, [world]);

  const respawn = useCallback(() => {
    const b = body.current;
    if (!b) return;
    const [x, y, z] = PLAYER.spawn;
    b.setTranslation({ x, y, z }, true);
    b.setNextKinematicTranslation({ x, y, z });
    motor.reset(SPAWN_FACING);
    runtime.playerPosition.set(x, y, z);
    runtime.playerVelocity.set(0, 0, 0);
  }, [motor]);

  useEffect(() => {
    runtime.playerBody = body.current;
    motor.reset(SPAWN_FACING);
    return () => {
      runtime.playerBody = null;
    };
  }, [motor]);

  // Restart Checkpoint (Phase 1: the spawn point is the only checkpoint).
  useEffect(() => {
    if (respawnToken > 0) respawn();
  }, [respawnToken, respawn]);

  useBeforePhysicsStep((w) => {
    const b = body.current;
    const c = collider.current;
    const controller = controllerRef.current;
    if (!b || !c || !controller) return;
    const dt = w.timestep;
    runtime.physicsSteps++;

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
        descendHeld: input.isHeld('descend'),
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
    const nx = p.x + actual.x;
    const nz = p.z + actual.z;
    // Keep the capsule exactly on top of the surface: no creeping into it at speed,
    // no brief falls off curbs while sprinting.
    const settled = settleOnGround(w, rapier, nx, p.y + actual.y, nz, c, motor.grounded, motor.velocity.y);
    let ny = settled.y;
    if (ny > FLIGHT.maxAltitude) {
      ny = FLIGHT.maxAltitude;
      motor.clampAltitude();
    }
    motor.resolve(desired, { x: actual.x, y: ny - p.y, z: actual.z }, settled.onGround || (controller.computedGrounded() && motor.velocity.y <= 0), dt);
    if (ny < PLAYER.killPlaneY) {
      respawn();
      return;
    }
    b.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    runtime.playerPosition.set(nx, ny, nz);
    runtime.playerVelocity.set(motor.velocity.x, motor.velocity.y, motor.velocity.z);
    runtime.playerState = motor.state;
    runtime.moveMode = motor.mode;
    runtime.grounded = motor.grounded;
  });

  // After physics has interpolated the body (priority -50), publish the
  // render-time position for the camera (priority -30).
  useFrame(() => {
    visual.current?.getWorldPosition(runtime.playerRenderPosition);
  }, -40);

  const feetOffset = -(PLAYER.capsuleHalfHeight + PLAYER.capsuleRadius);
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={PLAYER.spawn}>
      <CapsuleCollider ref={collider} args={[PLAYER.capsuleHalfHeight, PLAYER.capsuleRadius]} />
      <group ref={visual} position={[0, feetOffset, 0]}>
        <HeroVisual motor={motor} />
      </group>
    </RigidBody>
  );
}
