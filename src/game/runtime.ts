import type { RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';
import type { PlayerMoveState } from './player/groundMovement';

/**
 * Mutable per-frame game telemetry shared between systems (camera, HUD,
 * diagnostics) without React re-renders. Written by the simulation, read by
 * anyone; UI readers should poll at a low rate.
 */
export const runtime = {
  /** Player rigid body, for queries that must ignore the player (camera collision). */
  playerBody: null as RapierRigidBody | null,
  /** Interpolated (render-time) player feet position, used by the camera. */
  playerRenderPosition: new Vector3(),
  playerPosition: new Vector3(),
  playerVelocity: new Vector3(),
  playerState: 'idle' as PlayerMoveState,
  grounded: true,
  /** Camera yaw (rad). Movement input is interpreted relative to this. */
  cameraYaw: 0,
  cameraPitch: 0,
  cameraDistance: 0,
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
};
