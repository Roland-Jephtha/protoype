/**
 * Pure movement rules for ambient life: pedestrians and pets walking sidewalk
 * loops, wild animals wandering around a home area and fleeing the hero,
 * birds circling, fish swimming up and down the river. No rendering here.
 */

import type { PathSampler } from '../vehicles/traffic';

export interface HeroInfo {
  x: number;
  y: number;
  z: number;
}

// ---------------------------------------------------------------------------
// Path walkers (sidewalk loops, river swimmers)

export interface PathWalker {
  s: number;
  /** +1 forward along the path, -1 backward. */
  dir: 1 | -1;
  speed: number;
  /** Walking speed when moving (m/s). */
  cruise: number;
  /** Seconds left in the current pause (0 = walking). */
  pause: number;
  /** Seconds of walking left before the next pause (Infinity = never pauses). */
  walkFor: number;
}

export interface PathWalkerOptions {
  /** Closed loops wrap; open paths turn around at the ends. */
  closed: boolean;
  /** Average walk/pause durations (s); omit to never pause. */
  walkTime?: number;
  pauseTime?: number;
  /** Stop when the hero is this close ahead (m). */
  personalSpace?: number;
  rand: () => number;
}

/** Position and heading (facing the direction of travel) of a walker. */
export function walkerPose(w: PathWalker, path: PathSampler) {
  const p = path.at(w.s);
  return { x: p.x, z: p.z, angle: w.dir > 0 ? p.angle : p.angle + Math.PI };
}

export function stepPathWalker(w: PathWalker, path: PathSampler, dt: number, hero: HeroInfo, opts: PathWalkerOptions, groundY = 0) {
  let target = w.cruise;
  if (opts.walkTime !== undefined && opts.pauseTime !== undefined) {
    if (w.pause > 0) {
      w.pause -= dt;
      target = 0;
      if (w.pause <= 0) w.walkFor = opts.walkTime * (0.5 + opts.rand());
    } else {
      w.walkFor -= dt;
      if (w.walkFor <= 0) {
        w.pause = opts.pauseTime * (0.5 + opts.rand());
        // Sometimes turn back after a pause.
        if (opts.rand() < 0.3) w.dir = w.dir > 0 ? -1 : 1;
      }
    }
  }
  // Wait for the hero to step aside.
  const space = opts.personalSpace ?? 1.6;
  const pose = walkerPose(w, path);
  const dx = hero.x - pose.x;
  const dz = hero.z - pose.z;
  const fx = Math.sin(pose.angle);
  const fz = Math.cos(pose.angle);
  const ahead = dx * fx + dz * fz;
  if (Math.abs(hero.y - groundY) < 2.5 && ahead > 0 && ahead < space + 0.6 && Math.abs(dx * fz - dz * fx) < 0.8) target = 0;

  w.speed += Math.max(-4 * dt, Math.min(2 * dt, target - w.speed));
  w.s += w.speed * w.dir * dt;
  if (opts.closed) {
    w.s = ((w.s % path.length) + path.length) % path.length;
  } else if (w.s > path.length) {
    w.s = path.length;
    w.dir = -1;
  } else if (w.s < 0) {
    w.s = 0;
    w.dir = 1;
  }
}

// ---------------------------------------------------------------------------
// Wanderers (wild animals on open terrain)

export type WanderState = 'idle' | 'walk' | 'flee';

export interface Wanderer {
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: WanderState;
  timer: number;
  tx: number;
  tz: number;
  home: { x: number; z: number; radius: number };
}

export interface WanderOptions {
  walkSpeed: number;
  runSpeed: number;
  /** Starts fleeing when the hero (on or near the ground) comes this close. */
  fleeRadius: number;
  /** Where the animal may stand (slope, water, roads...). */
  walkable: (x: number, z: number) => boolean;
  groundY: (x: number, z: number) => number;
  rand: () => number;
}

const TURN_RATE = 3; // rad/s

function turnToward(current: number, target: number, maxStep: number) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return current + Math.max(-maxStep, Math.min(maxStep, d));
}

export function stepWanderer(c: Wanderer, dt: number, hero: HeroInfo, opts: WanderOptions) {
  const hx = hero.x - c.x;
  const hz = hero.z - c.z;
  const heroDist = Math.hypot(hx, hz);
  const heroLow = hero.y - opts.groundY(c.x, c.z) < 8;

  if (heroLow && heroDist < opts.fleeRadius) {
    c.state = 'flee';
    c.timer = 2.5;
  }

  let wantSpeed = 0;
  if (c.state === 'flee') {
    // Run directly away from the hero, but bend back toward home when far out.
    const away = Math.atan2(-hx, -hz);
    const homeDir = Math.atan2(c.home.x - c.x, c.home.z - c.z);
    const homeDist = Math.hypot(c.home.x - c.x, c.home.z - c.z);
    const pull = Math.min(1, Math.max(0, (homeDist - c.home.radius) / c.home.radius));
    const target = away + Math.atan2(Math.sin(homeDir - away), Math.cos(homeDir - away)) * pull * 0.7;
    c.heading = turnToward(c.heading, target, TURN_RATE * 1.6 * dt);
    wantSpeed = opts.runSpeed;
    if (heroDist > opts.fleeRadius * 1.8 || !heroLow) {
      c.timer -= dt;
      if (c.timer <= 0) {
        c.state = 'idle';
        c.timer = 1 + opts.rand() * 3;
      }
    }
  } else if (c.state === 'idle') {
    c.timer -= dt;
    if (c.timer <= 0) {
      // Pick a walkable spot near home.
      for (let i = 0; i < 8; i++) {
        const a = opts.rand() * Math.PI * 2;
        const r = Math.sqrt(opts.rand()) * c.home.radius;
        const tx = c.home.x + Math.sin(a) * r;
        const tz = c.home.z + Math.cos(a) * r;
        if (opts.walkable(tx, tz)) {
          c.tx = tx;
          c.tz = tz;
          c.state = 'walk';
          c.timer = 30;
          break;
        }
      }
      if (c.state === 'idle') c.timer = 1;
    }
  } else {
    const dx = c.tx - c.x;
    const dz = c.tz - c.z;
    const d = Math.hypot(dx, dz);
    c.heading = turnToward(c.heading, Math.atan2(dx, dz), TURN_RATE * dt);
    wantSpeed = opts.walkSpeed * Math.min(1, d / 2);
    c.timer -= dt;
    if (d < 1 || c.timer <= 0) {
      c.state = 'idle';
      c.timer = 2 + opts.rand() * 6;
    }
  }

  c.speed += Math.max(-8 * dt, Math.min(4 * dt, wantSpeed - c.speed));
  const nx = c.x + Math.sin(c.heading) * c.speed * dt;
  const nz = c.z + Math.cos(c.heading) * c.speed * dt;
  if (opts.walkable(nx, nz)) {
    c.x = nx;
    c.z = nz;
  } else {
    // Blocked (cliff, water, road): stop and choose again (fleeing animals veer).
    if (c.state === 'flee') c.heading += Math.PI / 2;
    else {
      c.state = 'idle';
      c.timer = 0.5;
    }
    c.speed *= 0.5;
  }
}

// ---------------------------------------------------------------------------
// Circling birds

export interface Circler {
  cx: number;
  cz: number;
  radius: number;
  /** Height above the ground at the circle centre (m). */
  altitude: number;
  /** Angular speed (rad/s); sign sets the direction. */
  rate: number;
  phase: number;
}

/** Position, heading and bank of a circling bird at time `t`. */
export function circlerPose(c: Circler, t: number) {
  const a = c.phase + c.rate * t;
  const x = c.cx + Math.sin(a) * c.radius;
  const z = c.cz + Math.cos(a) * c.radius;
  // Tangent direction of travel.
  const angle = a + (c.rate > 0 ? Math.PI / 2 : -Math.PI / 2);
  const bob = Math.sin(a * 2.3 + c.phase) * 3;
  return { x, z, angle, altitude: c.altitude + bob, bank: c.rate > 0 ? -0.35 : 0.35 };
}
