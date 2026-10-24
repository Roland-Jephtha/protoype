import { DRONE } from '../../config/combat';
import type { Vec3 } from './targets';

export type DroneMode = 'patrol' | 'attack' | 'wreck' | 'down';

export interface Drone {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Facing (yaw, rad) and wreck spin. */
  heading: number;
  spin: number;
  health: number;
  mode: DroneMode;
  /** Seconds until the next shot / until the wreck disappears / until respawn. */
  timer: number;
  /** Patrol circle and phase; also the attack orbit phase. */
  home: { x: number; z: number; radius: number };
  phase: number;
  /** Seconds since last hit (for the hit flash). */
  sinceHit: number;
  /** Seconds left frozen: a frozen drone drops and shatters on the ground. */
  frozen: number;
}

export interface DroneContext {
  hero: Vec3;
  /** False while the hero is down / respawning: drones return to patrol. */
  heroActive: boolean;
  groundY: (x: number, z: number) => number;
  rand: () => number;
}

export interface Shot {
  from: Vec3;
  dir: Vec3;
}

export function createDrone(home: Drone['home'], phase: number, groundY: (x: number, z: number) => number): Drone {
  const x = home.x + Math.sin(phase) * home.radius;
  const z = home.z + Math.cos(phase) * home.radius;
  return { x, y: groundY(x, z) + DRONE.patrolAltitude, z, vx: 0, vy: 0, vz: 0, heading: 0, spin: 0, health: DRONE.health, mode: 'patrol', timer: DRONE.fireInterval, home, phase, sinceHit: 99, frozen: 0 };
}

/** Steers velocity toward a point at up to `speed`, with limited acceleration. */
function steer(d: Drone, tx: number, ty: number, tz: number, speed: number, dt: number) {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const dz = tz - d.z;
  const dist = Math.hypot(dx, dy, dz) || 1;
  // Slow down on arrival.
  const want = Math.min(speed, dist * 1.5);
  const ax = (dx / dist) * want - d.vx;
  const ay = (dy / dist) * want - d.vy;
  const az = (dz / dist) * want - d.vz;
  const k = Math.min(1, 3 * dt);
  d.vx += ax * k;
  d.vy += ay * k;
  d.vz += az * k;
}

/** Advances one drone; returns a shot if it fired this step. */
export function stepDrone(d: Drone, dt: number, ctx: DroneContext): Shot | null {
  d.sinceHit += dt;
  let shot: Shot | null = null;

  if (d.mode === 'down') {
    d.timer -= dt;
    if (d.timer <= 0) Object.assign(d, createDrone(d.home, ctx.rand() * Math.PI * 2, ctx.groundY));
    return null;
  }

  if (d.mode === 'wreck') {
    // Falls, spinning, then burns on the ground.
    const floor = ctx.groundY(d.x, d.z) + 0.4;
    if (d.y > floor) {
      d.vy -= 20 * dt;
      d.spin += 8 * dt;
    } else {
      d.y = floor;
      d.vx *= 0.8;
      d.vz *= 0.8;
      d.vy = 0;
    }
    d.x += d.vx * dt;
    d.y = Math.max(floor, d.y + d.vy * dt);
    d.z += d.vz * dt;
    d.timer -= dt;
    if (d.timer <= 0) {
      d.mode = 'down';
      d.timer = DRONE.respawn;
    }
    return null;
  }

  // Frozen: rotors stop, it drops, and shatters when it hits the ground.
  if (d.frozen > 0) {
    d.frozen -= dt;
    d.vy -= DRONE.frozenGravity * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (d.y <= ctx.groundY(d.x, d.z) + 0.5) {
      d.y = ctx.groundY(d.x, d.z) + 0.5;
      d.health = 0;
      d.mode = 'wreck';
      d.timer = DRONE.wreckTime;
      d.frozen = 0;
    }
    return null;
  }

  const hx = ctx.hero.x - d.x;
  const hz = ctx.hero.z - d.z;
  const heroDist = Math.hypot(hx, ctx.hero.y - d.y, hz);
  if (d.mode === 'patrol' && ctx.heroActive && heroDist < DRONE.alertRange) d.mode = 'attack';
  if (d.mode === 'attack' && (!ctx.heroActive || heroDist > DRONE.loseRange)) d.mode = 'patrol';

  if (d.mode === 'patrol') {
    d.phase += (DRONE.patrolSpeed / d.home.radius) * dt;
    const tx = d.home.x + Math.sin(d.phase) * d.home.radius;
    const tz = d.home.z + Math.cos(d.phase) * d.home.radius;
    steer(d, tx, ctx.groundY(tx, tz) + DRONE.patrolAltitude, tz, DRONE.patrolSpeed * 1.5, dt);
    d.heading = Math.atan2(d.vx, d.vz);
  } else {
    // Hold a ring around the hero, drifting sideways so it's a moving target.
    d.phase += 0.35 * dt;
    const away = Math.atan2(-hx, -hz) + Math.sin(d.phase) * 0.8;
    const tx = ctx.hero.x + Math.sin(away) * DRONE.attackDistance;
    const tz = ctx.hero.z + Math.cos(away) * DRONE.attackDistance;
    const ty = Math.max(ctx.hero.y + DRONE.attackHeight, ctx.groundY(tx, tz) + 4);
    steer(d, tx, ty, tz, DRONE.chaseSpeed, dt);
    d.heading = Math.atan2(hx, hz);
    d.timer -= dt;
    if (d.timer <= 0 && heroDist < DRONE.attackDistance * 2.5) {
      d.timer = DRONE.fireInterval * (0.8 + ctx.rand() * 0.4);
      const ex = (ctx.rand() - 0.5) * 2 * DRONE.aimError;
      const ey = (ctx.rand() - 0.5) * 2 * DRONE.aimError;
      const ez = (ctx.rand() - 0.5) * 2 * DRONE.aimError;
      const dx = ctx.hero.x + ex - d.x;
      const dy = ctx.hero.y + 1 + ey - d.y;
      const dz = ctx.hero.z + ez - d.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      shot = { from: { x: d.x, y: d.y, z: d.z }, dir: { x: dx / len, y: dy / len, z: dz / len } };
    }
  }

  // Knockback decays; never sink into the ground.
  d.x += d.vx * dt;
  d.y += d.vy * dt;
  d.z += d.vz * dt;
  const floor = ctx.groundY(d.x, d.z) + 2.5;
  if (d.y < floor) {
    d.y = floor;
    d.vy = Math.max(0, d.vy);
  }
  return shot;
}

/** Freezes a drone for a while (it falls out of the sky). */
export function freezeDrone(d: Drone, seconds: number) {
  if (d.mode === 'wreck' || d.mode === 'down') return;
  d.frozen = Math.min(DRONE.maxFreeze, d.frozen + seconds);
  d.vx *= 0.3;
  d.vz *= 0.3;
}

/** Applies a hit; returns true if it destroyed the drone. */
export function damageDrone(d: Drone, amount: number, knock: Vec3): boolean {
  if (d.mode === 'wreck' || d.mode === 'down') return false;
  d.health -= amount;
  d.sinceHit = 0;
  d.vx += knock.x;
  d.vy += knock.y;
  d.vz += knock.z;
  // Getting hit makes it fight back.
  d.mode = 'attack';
  if (d.health <= 0) {
    d.health = 0;
    d.mode = 'wreck';
    d.timer = DRONE.wreckTime;
    return true;
  }
  return false;
}

export interface Bolt {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  age: number;
}

/** Adds a bolt for a shot (fired from just under the drone), up to `max` live bolts. */
export function fireBolt(bolts: Bolt[], shot: Shot, max: number) {
  if (bolts.length >= max) return;
  bolts.push({ x: shot.from.x, y: shot.from.y - 0.3, z: shot.from.z, dx: shot.dir.x, dy: shot.dir.y, dz: shot.dir.z, age: 0 });
}

/**
 * Moves bolts; removes ones that expire or hit the ground. Returns how many hit
 * the hero (a capsule from feet to head approximated by its centre segment).
 */
export function stepBolts(bolts: Bolt[], dt: number, hero: Vec3, heroActive: boolean, groundY: (x: number, z: number) => number): number {
  let hits = 0;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    const step = DRONE.boltSpeed * dt;
    // Closest approach of this step's segment to the hero's body axis (feet+0.5 .. feet+1.6).
    let hit = false;
    if (heroActive) {
      const samples = 4;
      for (let k = 0; k <= samples && !hit; k++) {
        const px = b.x + b.dx * step * (k / samples);
        const py = b.y + b.dy * step * (k / samples);
        const pz = b.z + b.dz * step * (k / samples);
        const cy = Math.max(hero.y + 0.5, Math.min(hero.y + 1.6, py));
        if (Math.hypot(px - hero.x, py - cy, pz - hero.z) < DRONE.boltHitRadius) hit = true;
      }
    }
    b.x += b.dx * step;
    b.y += b.dy * step;
    b.z += b.dz * step;
    b.age += dt;
    if (hit) hits++;
    if (hit || b.age > DRONE.boltLifetime || b.y < groundY(b.x, b.z)) bolts.splice(i, 1);
  }
  return hits;
}
