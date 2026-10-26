import type { RapierRigidBody } from '@react-three/rapier';
import type { RegionId } from '../config/regions';
import { Vector3 } from 'three';
import { HeroCombat } from './combat/heroCombat';
import type { VehicleType } from './vehicles/vehicleGeometry';
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
  /** Camera view direction (unit), for aiming. */
  cameraForward: new Vector3(0, 0, -1),
  /** Hero combat state (health, heat, punches). Simulated in CombatDriver. */
  combat: new HeroCombat(),
  /** Hero facing yaw (published each physics step). */
  heroFacingYaw: 0,
  /** Midpoint between the hero's eyes, from the head bone (valid once the model is posed). */
  heroEyes: new Vector3(),
  heroEyesValid: false,
  /** Combat asks the motor to face this way (aiming, punching a target); null = free. */
  combatFaceYaw: null as number | null,
  aiming: false,
  /** Fighting stance wanted (an enemy is close or the hero just punched). */
  combatReady: false,
  /** Heat-vision beam this step: eye → end point; `surface` when it hit the world (scorch). */
  beam: { active: false, from: new Vector3(), to: new Vector3(), surface: false, normal: new Vector3(0, 1, 0), hitTarget: false },
  /** Knockback for the hero, applied (and cleared) at the next physics step, with its loss of control (s). */
  heroImpulse: new Vector3(),
  heroControlLoss: 0,
  /** This region's water surface (null: none), and whether the hero is running on it / wading in it. */
  waterLevel: null as ((x: number, z: number) => number | null) | null,
  heroOnWater: null as 'run' | 'wade' | null,
  /** Hit reaction: seconds into it (counting up; -1 = none), its kind, and whether he falls forward. */
  heroHit: { t: -1, kind: 'stagger' as 'stagger' | 'knockdown' | 'tumble', forward: false },
  /** Speed dash requested by combat (velocity m/s), applied at the next physics step. */
  heroDash: null as { x: number; y: number; z: number } | null,
  /** True while the hero is dashing. */
  heroDashing: false,
  /** The vehicle the hero is holding overhead. */
  carrying: null as { type: VehicleType; paint: string } | null,
  /** Breath blowing this step (from the mouth along the crosshair), for effects. */
  breath: { kind: 'none' as 'none' | 'wind' | 'freeze', from: new Vector3(), dir: new Vector3(0, 0, -1) },
  /** Incremented on each Super Nova (the HUD flashes). */
  novaFlash: 0,
  /** Mission intro camera clock (s), total length (s), and whether it's driving the camera. */
  cinematic: { t: 0, length: 0, active: false },
  /** Story missions: where a knocked-out hero respawns (the last checkpoint), and knockouts so far. */
  respawnPoint: null as { region: string; x: number; z: number; facing: number } | null,
  knockouts: 0,
  /** Mission actors: raised flags, fires out in the current extinguish objective, the runaway bus position. */
  missionFlags: new Set<string>(),
  firesOut: 0,
  busPosition: null as { x: number; z: number } | null,
  /** Villains beaten during the current mission (ids). */
  defeatedVillains: [] as string[],
  /** Vehicles blown up (heat vision, big hits) since load. */
  carsDestroyed: 0,
  /** Man of Steel launches so far and the last one's strength (0..1), for effects and sound. */
  launches: 0,
  launchPower: 0,
  /** World time scale (Speed Force slow-motion, hit-stop); the hero always runs at real time. */
  timeScale: 1,
  /** Seconds of hit-stop left (real time). */
  hitStop: 0,
  speedForce: false,
  /** Camera shake intensity (decays). */
  cameraShake: 0,
  /** Seconds the hero stays frozen (slowed) by freeze breath. */
  heroFrozen: 0,
  /** The engaged villain nearest the hero (boss bar), and villains beaten since load. */
  boss: null as { name: string; health: number; max: number; phase: 1 | 2 } | null,
  /** Slow-motion finishing blow on a boss: real seconds left and the boss's centre (followed by the camera). */
  finisher: null as { time: number; target: { x: number; y: number; z: number } } | null,
  /** Bumped when a boss roars into phase 2 (audio / HUD). */
  bossEnraged: 0,
  villainsDefeated: 0,
  /** Drones alive in the region and destroyed since load (smoke test, HUD). */
  dronesAlive: 0,
  dronesDestroyed: 0,
  /** Shared clock for traffic lights (s). */
  trafficTime: 0,
  /** Vehicles of the last-updated traffic layer that are moving / standing (smoke test). */
  trafficMoving: 0,
  trafficStopped: 0,
  /** Ambient life currently mounted (diagnostics/smoke test). */
  animalsMounted: 0,
  pedestriansWalking: 0,
  /** Forest freight train: front distance along the line (m) and locomotive position. */
  trainFront: 0,
  trainPosition: new Vector3(),
  /** Total fixed physics steps taken (diagnostics: steps per rendered frame). */
  physicsSteps: 0,
  fps: 0,
  frameMs: 0,
  /** CPU time per frame spent in simulation + render submission (ms, smoothed). */
  cpuMs: 0,
  drawCalls: 0,
  triangles: 0,
};
