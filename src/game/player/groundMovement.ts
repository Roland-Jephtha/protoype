import { FLIGHT, GROUND_MOVEMENT, PHYSICS } from '../../config/gameConfig';

export type PlayerMoveState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'fall'
  | 'land'
  | 'hardLand'
  | 'takeoff'
  | 'hover'
  | 'fly'
  | 'flyBoost';

export type MoveMode = 'ground' | 'flight';

export interface MotorInput {
  /** Analog move input, x = right, y = forward (already dead-zoned, length ≤ 1). */
  moveX: number;
  moveY: number;
  /** Camera yaw; movement is relative to the camera. */
  cameraYaw: number;
  /** Ground: sprint. Flight: boost. */
  sprintHeld: boolean;
  jumpPressed: boolean;
  /** Ground: variable jump height. Flight: fly up. */
  jumpHeld: boolean;
  /** Flight steering pitch (rad, + = up), relative to the camera's level framing. */
  cameraPitch?: number;
  /** Toggle flight (edge). */
  flyPressed?: boolean;
  /** Fly down (held). */
  descendHeld?: boolean;
  /** Face this yaw regardless of movement (aiming heat vision, punching a target). */
  faceYaw?: number;
  /** Multiplies move speeds (frozen by freeze breath: < 1). Default 1. */
  speedScale?: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

type Tuning = typeof GROUND_MOVEMENT;

/**
 * Flight wish vector in world space: stick forward follows the camera's look
 * direction including pitch (look up to climb, down to dive), stick sideways
 * strafes, and up/down add pure vertical motion. Length ≤ 1.
 */
export function flightDirection(moveX: number, moveY: number, yaw: number, pitch: number, up: number) {
  const cp = Math.cos(pitch);
  const x = Math.cos(yaw) * moveX - Math.sin(yaw) * cp * moveY;
  const y = Math.sin(pitch) * moveY + up;
  const z = -Math.sin(yaw) * moveX - Math.cos(yaw) * cp * moveY;
  const len = Math.hypot(x, y, z);
  return len > 1 ? { x: x / len, y: y / len, z: z / len } : { x, y, z };
}

/** Camera-relative input → world-space XZ direction. yaw 0 looks down -Z. */
export function cameraRelativeDirection(moveX: number, moveY: number, yaw: number) {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  return { x: rx * moveX + fx * moveY, z: rz * moveX + fz * moveY };
}

/** Analog magnitude → target speed: walk ramps up to the threshold, then blends to run. */
export function targetGroundSpeed(magnitude: number, sprint: boolean, t: Tuning = GROUND_MOVEMENT) {
  if (magnitude < 0.01) return 0;
  if (sprint) return t.sprintSpeed * Math.max(magnitude, 0.6);
  if (magnitude <= t.walkThreshold) return t.walkSpeed * (magnitude / t.walkThreshold);
  const k = (magnitude - t.walkThreshold) / (1 - t.walkThreshold);
  return t.walkSpeed + (t.runSpeed - t.walkSpeed) * k;
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Locomotion for the hero: walk, run, sprint, jump (with coyote time, jump
 * buffering and variable height), fall, landing recovery — and flight
 * (takeoff, hover, fly, boost, landing on contact).
 *
 * Collision-agnostic: `step()` returns the desired displacement, the physics
 * layer resolves it against the world, then `resolve()` feeds back what really
 * happened. This keeps the motor deterministic and unit-testable.
 */
export class GroundMotor {
  velocity: Vec3Like = { x: 0, y: 0, z: 0 };
  grounded = false;
  mode: MoveMode = 'ground';
  state: PlayerMoveState = 'fall';
  stateTime = 0;
  /** Visual facing yaw (rad), atan2(x, z) convention. */
  facingYaw = Math.PI;
  lastLandingSpeed = 0;
  /** Seconds of lost control after a knockback (velocity carries the hero). */
  knockTimer = 0;

  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private jumpAscending = false;
  private landTimer = 0;
  private sprinting = false;
  private boosting = false;
  private readonly t: Tuning;

  constructor(tuning: Tuning = GROUND_MOVEMENT) {
    this.t = tuning;
  }

  reset(facingYaw = Math.PI) {
    this.velocity = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.mode = 'ground';
    this.boosting = false;
    this.state = 'fall';
    this.stateTime = 0;
    this.facingYaw = facingYaw;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpAscending = false;
    this.landTimer = 0;
  }

  /** Advances one fixed step and returns the desired displacement for this step. */
  step(inp: MotorInput, dt: number): Vec3Like {
    // --- flight transitions ---------------------------------------------
    if (this.mode === 'flight') {
      if (inp.flyPressed) {
        this.mode = 'ground'; // drop out of flight and fall
        this.boosting = false;
        this.setState('fall');
      } else {
        return this.stepFlight(inp, dt);
      }
    } else if (inp.flyPressed || (inp.jumpPressed && !this.grounded && this.coyoteTimer - dt <= 0 && this.state !== 'hardLand')) {
      // F anywhere, or Jump again while airborne: take off.
      this.takeOff();
      return this.stepFlight(inp, dt);
    }

    const t = this.t;
    const v = this.velocity;

    // --- timers ---------------------------------------------------------
    this.coyoteTimer = this.grounded ? t.coyoteTime : this.coyoteTimer - dt;
    this.jumpBufferTimer = inp.jumpPressed ? t.jumpBufferTime : this.jumpBufferTimer - dt;
    this.landTimer = Math.max(0, this.landTimer - dt);

    // --- horizontal -----------------------------------------------------
    const mag = Math.min(1, Math.hypot(inp.moveX, inp.moveY));
    const dir = cameraRelativeDirection(inp.moveX, inp.moveY, inp.cameraYaw);
    const dirLen = Math.hypot(dir.x, dir.z);
    this.sprinting = inp.sprintHeld && mag > 0.1;

    let speed = targetGroundSpeed(mag, this.sprinting, t) * (inp.speedScale ?? 1);
    if (this.state === 'hardLand') speed *= t.hardLandSpeedFactor;
    this.knockTimer = Math.max(0, this.knockTimer - dt);
    const tx = dirLen > 0 ? (dir.x / dirLen) * speed : 0;
    const tz = dirLen > 0 ? (dir.z / dirLen) * speed : 0;

    const accelerating = speed > 0.01;
    let rate = accelerating ? (this.sprinting ? t.sprintAcceleration : t.acceleration) : t.deceleration;
    if (!this.grounded) rate *= t.airControl;
    // Knocked back: no steering; the knock velocity carries the hero and slowly bleeds off.
    const knocked = this.knockTimer > 0;
    const dx = (knocked ? 0 : tx) - v.x;
    const dz = (knocked ? 0 : tz) - v.z;
    const dLen = Math.hypot(dx, dz);
    const maxDelta = (knocked ? t.knockDrag : rate) * dt;
    if (dLen <= maxDelta) {
      v.x = tx;
      v.z = tz;
    } else {
      v.x += (dx / dLen) * maxDelta;
      v.z += (dz / dLen) * maxDelta;
    }

    // --- vertical -------------------------------------------------------
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0 && this.state !== 'hardLand') {
      v.y = t.jumpVelocity;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.jumpAscending = true;
      this.grounded = false;
    } else if (this.grounded && !(knocked && v.y > 0)) {
      // Small downward bias keeps the controller in contact on slopes/steps.
      v.y = -2;
    } else {
      v.y = Math.max(v.y - PHYSICS.gravity * dt, -PHYSICS.maxFallSpeed);
    }

    // Variable jump height: releasing jump early cuts the ascent.
    if (this.jumpAscending && !inp.jumpHeld && v.y > 0) {
      v.y *= t.jumpCutMultiplier;
      this.jumpAscending = false;
    }
    if (v.y <= 0) this.jumpAscending = false;

    // --- facing ---------------------------------------------------------
    const hSpeed = Math.hypot(v.x, v.z);
    if (inp.faceYaw !== undefined) this.turnToward(inp.faceYaw, t.turnSpeed * dt);
    else if (hSpeed > 0.4) this.turnToward(Math.atan2(v.x, v.z), t.turnSpeed * dt);

    return { x: v.x * dt, y: v.y * dt, z: v.z * dt };
  }

  private takeOff() {
    this.mode = 'flight';
    this.velocity.y = Math.max(this.velocity.y, this.grounded ? FLIGHT.takeoffVelocity : 2);
    this.grounded = false;
    this.jumpAscending = false;
    this.jumpBufferTimer = 0;
    this.setState('takeoff');
  }

  private stepFlight(inp: MotorInput, dt: number): Vec3Like {
    const v = this.velocity;
    const up = (inp.jumpHeld ? 1 : 0) - (inp.descendHeld ? 1 : 0);
    const wish = flightDirection(inp.moveX, inp.moveY, inp.cameraYaw, inp.cameraPitch ?? 0, up);
    const mag = Math.hypot(wish.x, wish.y, wish.z);
    this.boosting = inp.sprintHeld && mag > 0.1;
    this.knockTimer = Math.max(0, this.knockTimer - dt);
    const speed = (this.boosting ? FLIGHT.boostSpeed : FLIGHT.baseSpeed) * mag * (inp.speedScale ?? 1) * (this.knockTimer > 0 ? 0 : 1);
    const tx = mag > 0 ? (wish.x / mag) * speed : 0;
    const ty = mag > 0 ? (wish.y / mag) * speed : 0;
    const tz = mag > 0 ? (wish.z / mag) * speed : 0;

    // Accelerate toward the wish velocity in 3D; brake to a hover with no input.
    const rate = mag > 0.01 ? (this.boosting ? FLIGHT.boostAcceleration : FLIGHT.acceleration) : FLIGHT.deceleration;
    const dx = tx - v.x;
    const dy = ty - v.y;
    const dz = tz - v.z;
    const dLen = Math.hypot(dx, dy, dz);
    const maxDelta = rate * dt;
    if (dLen <= maxDelta) {
      v.x = tx;
      v.y = ty;
      v.z = tz;
    } else {
      v.x += (dx / dLen) * maxDelta;
      v.y += (dy / dLen) * maxDelta;
      v.z += (dz / dLen) * maxDelta;
    }

    const hSpeed = Math.hypot(v.x, v.z);
    // Aiming in flight turns at ground speed: the hero pivots, the flight path doesn't.
    if (inp.faceYaw !== undefined) this.turnToward(inp.faceYaw, this.t.turnSpeed * dt);
    else if (hSpeed > 0.5) this.turnToward(Math.atan2(v.x, v.z), FLIGHT.turnSpeed * dt);
    return { x: v.x * dt, y: v.y * dt, z: v.z * dt };
  }

  private turnToward(yaw: number, maxStep: number) {
    const diff = wrapAngle(yaw - this.facingYaw);
    this.facingYaw = wrapAngle(this.facingYaw + Math.max(-maxStep, Math.min(maxStep, diff)));
  }

  /**
   * Adds a velocity impulse (a villain's punch, a shockwave, a dash). For
   * `controlLoss` seconds the hero can't steer and the impulse carries him;
   * an upward impulse lifts a grounded hero off his feet.
   */
  applyImpulse(x: number, y: number, z: number, controlLoss: number) {
    const v = this.velocity;
    v.x += x;
    v.y = (this.grounded && y > 0 ? 0 : v.y) + y;
    v.z += z;
    this.knockTimer = Math.max(this.knockTimer, controlLoss);
    if (y > 0 && this.mode === 'ground') {
      this.grounded = false;
      this.jumpAscending = false;
      this.setState('jump');
    }
  }

  /** Start already in flight (arriving in a region mid-flight). */
  startFlying(vx: number, vy: number, vz: number) {
    this.mode = 'flight';
    this.grounded = false;
    this.velocity = { x: vx, y: vy, z: vz };
    this.setState('fly');
  }

  /** Stop motion along one axis (e.g. held back by a region edge). */
  stopAxis(axis: 'x' | 'z') {
    this.velocity[axis] = 0;
  }

  /** Physics hit the altitude ceiling: stop climbing. */
  clampAltitude() {
    if (this.velocity.y > 0) this.velocity.y = 0;
  }

  private resolveFlight(desired: Vec3Like, actual: Vec3Like, grounded: boolean, dt: number) {
    const v = this.velocity;
    // Blocked by a wall/roof/floor: lose the blocked part of the velocity.
    for (const k of ['x', 'y', 'z'] as const) {
      if (Math.abs(desired[k]) > 1e-6 && Math.abs(actual[k]) < Math.abs(desired[k]) - 1e-4 && dt > 0) v[k] = actual[k] / dt;
    }
    this.stateTime += dt;
    // Touching a surface while not climbing: land.
    if (grounded && v.y <= 0.5 && !(this.state === 'takeoff' && this.stateTime < FLIGHT.takeoffStateDuration)) {
      const impact = Math.hypot(v.x, v.y, v.z);
      this.mode = 'ground';
      this.boosting = false;
      this.grounded = true;
      this.lastLandingSpeed = impact;
      v.y = -2;
      if (impact >= FLIGHT.hardLandingSpeed) {
        this.setState('hardLand');
        this.landTimer = this.t.hardLandStateDuration;
      } else {
        this.setState('land');
        this.landTimer = this.t.landStateDuration;
      }
      return;
    }
    this.grounded = false;
    if (this.state === 'takeoff' && this.stateTime < FLIGHT.takeoffStateDuration) return;
    const speed = Math.hypot(v.x, v.y, v.z);
    this.setState(speed < FLIGHT.hoverSpeed ? 'hover' : this.boosting && speed > FLIGHT.baseSpeed * 1.05 ? 'flyBoost' : 'fly');
  }

  /**
   * Feeds back the collision-resolved movement. `desired` is what step()
   * returned; `actual` is what the character controller allowed.
   */
  resolve(desired: Vec3Like, actual: Vec3Like, grounded: boolean, dt: number) {
    if (this.mode === 'flight') {
      this.resolveFlight(desired, actual, grounded, dt);
      return;
    }
    const v = this.velocity;
    const wasGrounded = this.grounded;

    // Blocked horizontally (wall): bleed off the blocked velocity so speed
    // does not build up against walls.
    const dH = Math.hypot(desired.x, desired.z);
    const aH = Math.hypot(actual.x, actual.z);
    if (dH > 1e-6 && aH < dH - 1e-4 && dt > 0) {
      v.x = actual.x / dt;
      v.z = actual.z / dt;
    }

    // Head bump.
    if (desired.y > 0 && actual.y < desired.y * 0.5) {
      v.y = 0;
      this.jumpAscending = false;
    }

    // While ascending from a jump, ignore stale "grounded" reports on the takeoff step.
    const nowGrounded = grounded && !(this.jumpAscending && v.y > 0);
    if (!wasGrounded && nowGrounded) {
      this.lastLandingSpeed = Math.max(0, -v.y);
      if (this.lastLandingSpeed >= this.t.hardLandingSpeed) {
        this.setState('hardLand');
        this.landTimer = this.t.hardLandStateDuration;
      } else if (this.lastLandingSpeed > 4) {
        this.setState('land');
        this.landTimer = this.t.landStateDuration;
      }
      v.y = -2;
    }
    this.grounded = nowGrounded;
    this.updateState(dt);
  }

  private updateState(dt: number) {
    this.stateTime += dt;
    if ((this.state === 'land' || this.state === 'hardLand') && this.landTimer > 0 && this.grounded) return;

    const hSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    let next: PlayerMoveState;
    if (!this.grounded) {
      next = this.velocity.y > 0 ? 'jump' : 'fall';
    } else if (hSpeed < 0.3) {
      next = 'idle';
    } else if (this.sprinting && hSpeed > this.t.runSpeed * 0.9) {
      next = 'sprint';
    } else if (hSpeed > (this.t.walkSpeed + this.t.runSpeed) / 2) {
      next = 'run';
    } else {
      next = 'walk';
    }
    this.setState(next);
  }

  private setState(s: PlayerMoveState) {
    if (s !== this.state) {
      this.state = s;
      this.stateTime = 0;
    }
  }
}
