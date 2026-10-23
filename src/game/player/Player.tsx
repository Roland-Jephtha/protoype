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
import { PLAYER } from '../../config/gameConfig';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { GroundMotor } from './groundMovement';
import { PlaceholderHero } from './PlaceholderHero';

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
  const { world } = useRapier();
  const motor = useMemo(() => new GroundMotor(), []);
  const respawnToken = useApp((s) => s.respawnToken);

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

    const move = input.getMove();
    const desired = motor.step(
      {
        moveX: move.x,
        moveY: move.y,
        cameraYaw: runtime.cameraYaw,
        sprintHeld: input.isHeld('sprint'),
        jumpPressed: input.consumePressed('jump'),
        jumpHeld: input.isHeld('jump'),
      },
      dt,
    );

    controller.computeColliderMovement(c, desired);
    const actual = controller.computedMovement();
    motor.resolve(desired, actual, controller.computedGrounded(), dt);

    const p = b.translation();
    const nx = p.x + actual.x;
    const ny = p.y + actual.y;
    const nz = p.z + actual.z;
    if (ny < PLAYER.killPlaneY) {
      respawn();
      return;
    }
    b.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    runtime.playerPosition.set(nx, ny, nz);
    runtime.playerVelocity.set(motor.velocity.x, motor.velocity.y, motor.velocity.z);
    runtime.playerState = motor.state;
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
        <PlaceholderHero motor={motor} />
      </group>
    </RigidBody>
  );
}
