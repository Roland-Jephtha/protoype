/**
 * Central, typed gameplay tuning. All movement, camera and physics numbers live
 * here so they can be tuned in one place. World scale: 1 unit = 1 metre.
 */

export const PHYSICS = {
  /** Fixed simulation step (seconds). Player logic runs once per step. */
  timeStep: 1 / 60,
  /** Gravity used by the player controller (m/s^2). Heavier than Earth for snappy jumps. */
  gravity: 28,
  /** Terminal fall speed (m/s). */
  maxFallSpeed: 60,
} as const;

export const PLAYER = {
  capsuleRadius: 0.4,
  /** Half-height of the cylindrical section (total height = 2*half + 2*radius ≈ 1.9 m). */
  capsuleHalfHeight: 0.55,
  spawn: [0, 2, 8] as [number, number, number],
  /** Below this Y the player is treated as out of the world and respawned. */
  killPlaneY: -40,
  /** Character controller skin offset (m). */
  controllerOffset: 0.02,
  maxSlopeClimbDeg: 50,
  minSlopeSlideDeg: 55,
  autostepMaxHeight: 0.45,
  autostepMinWidth: 0.2,
  snapToGroundDistance: 0.35,
} as const;

export const GROUND_MOVEMENT = {
  walkSpeed: 3.2,
  runSpeed: 8,
  /** Phase 1 "sprint". Super-speed (Phase 3) will be a separate controller. */
  sprintSpeed: 16,
  /** Stick magnitude below which analog input counts as walking. */
  walkThreshold: 0.55,
  acceleration: 40,
  sprintAcceleration: 28,
  deceleration: 50,
  /** Fraction of ground control available while airborne. */
  airControl: 0.35,
  /** Turn rate of the visual model toward travel direction (rad/s). */
  turnSpeed: 14,
  jumpVelocity: 11,
  /** Holding jump extends the jump; releasing early cuts upward velocity by this factor. */
  jumpCutMultiplier: 0.5,
  /** Grace period after walking off a ledge where a jump is still allowed (s). */
  coyoteTime: 0.12,
  /** Jump presses slightly before landing are remembered for this long (s). */
  jumpBufferTime: 0.12,
  /** Landing faster than this (m/s downward) plays the heavy landing state. */
  hardLandingSpeed: 22,
  landStateDuration: 0.12,
  hardLandStateDuration: 0.35,
  /** Movement speed multiplier during a hard landing recovery. */
  hardLandSpeedFactor: 0.25,
} as const;

/** Reference speeds for later phases (from the brief); not yet used by gameplay. */
export const FLIGHT_REFERENCE = {
  hover: 8,
  cruise: 80,
  high: 250,
  extreme: 500,
} as const;

export const CAMERA = {
  fov: 60,
  near: 0.1,
  far: 2500,
  /** Height above player origin the camera looks at. */
  targetHeight: 1.5,
  /** Shoulder offset to the right (m). */
  shoulderOffset: 0.45,
  distance: 5.5,
  minDistance: 1.2,
  sprintDistance: 7,
  /** Pitch limits in radians (negative = looking down from above). */
  minPitch: -1.2,
  maxPitch: 0.75,
  defaultPitch: -0.22,
  /** Base radians per pixel of mouse movement (scaled by user sensitivity). */
  mouseSensitivity: 0.0022,
  /** Base radians per pixel of touch-drag (scaled by user sensitivity). */
  touchSensitivity: 0.006,
  /** Exponential smoothing rates (1/s). Higher = snappier. */
  followSharpness: 18,
  distanceSharpness: 6,
  fovSharpness: 4,
  sprintFovBoost: 8,
  /** Camera collision probe radius (m) and padding from walls. */
  collisionPadding: 0.25,
  /** How fast the camera returns outward after a collision pulled it in (1/s). */
  collisionRecoverSharpness: 5,
} as const;

export type GraphicsQuality = 'low' | 'medium' | 'high';

export const GRAPHICS_PRESETS: Record<
  GraphicsQuality,
  { maxDpr: number; shadows: boolean; shadowMapSize: number; drawDistance: number }
> = {
  low: { maxDpr: 1, shadows: false, shadowMapSize: 512, drawDistance: 350 },
  medium: { maxDpr: 1.5, shadows: true, shadowMapSize: 1024, drawDistance: 600 },
  high: { maxDpr: 2, shadows: true, shadowMapSize: 2048, drawDistance: 900 },
};
