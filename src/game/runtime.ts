import type { RapierRigidBody } from '@react-three/rapier';
import type { RegionId } from '../config/regions';
import { Vector3 } from 'three';
import type { MoveMode, PlayerMoveState } from './player/groundMovement';

/**
 * Mutable per-frame game telemetry shared between systems (camera, HUD,
 * diagnostics) without React re-renders. Written by the simulation, read by
 * anyone; UI readers should poll at a low rate.
 */
export const runtime = {
  /** Region currently mounted. */
  regionId: 'metropolis' as RegionId,
  /** Half the side length of the current region (m). */
  regionHalf: 150,
  /** Player rigid body, for queries that must ignore the player (camera collision). */
  playerBody: null as RapierRigidBody | null,
  /** Interpolated (render-time) player feet position, used by the camera. */
  playerRenderPosition: new Vector3(),
  playerPosition: new Vector3(),
  playerVelocity: new Vector3(),
  playerState: 'idle' as PlayerMoveState,
  moveMode: 'ground' as MoveMode,
  /** Which hero visual is active: a HERO_MODELS id or 'placeholder'. */
  heroModel: 'placeholder' as string,
  /** Lowest sole height above the ground after foot grounding (m; negative = sunk in). */
  heroSoleAboveGround: 0,
  /** Vertical correction currently applied to keep the feet on the ground (m). */
  heroFootLift: 0,
  /** Total weight of the hero's playing animations (diagnostics: < 1 means blending toward the rest pose). */
  heroAnimWeight: 0,
  grounded: true,
  /** Camera yaw (rad). Movement input is interpreted relative to this. */
  cameraYaw: 0,
  cameraPitch: 0,
  cameraDistance: 0,
  cameraPosition: new Vector3(),
  /** Total fixed physics steps taken (diagnostics: steps per rendered frame). */
  physicsSteps: 0,
  fps: 0,
  frameMs: 0,
  drawCalls: 0,
  triangles: 0,
};
