/**
 * Pure traffic simulation: vehicles following lanes (polylines), keeping a
 * gap to the vehicle ahead, stopping at red lights and braking for the hero.
 * No rendering/physics — TrafficLayer turns this into meshes and colliders.
 */

import { TRAFFIC } from '../../config/world';

export type LightGroup = 'x' | 'z';
export type LightState = 'green' | 'yellow' | 'red';

/** Arc-length sampler for a polyline. */
export interface PathSampler {
  length: number;
  /** Position and heading (atan2(dx, dz)) at distance `s` along the path. */
  at: (s: number) => { x: number; z: number; angle: number };
}

export function samplePath(points: [number, number][]): PathSampler {
  const cum = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = cum[cum.length - 1];
  return {
    length,
    at: (s) => {
      const d = Math.min(length, Math.max(0, s));
      let i = 1;
      while (i < cum.length - 1 && cum[i] < d) i++;
      const [ax, az] = points[i - 1];
      const [bx, bz] = points[i];
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (d - cum[i - 1]) / seg;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, angle: Math.atan2(bx - ax, bz - az) };
    },
  };
}

export interface Lane {
  id: string;
  path: PathSampler;
  /** Stop lines (distance along the lane) and which light group controls them. */
  stops: { s: number; group: LightGroup }[];
  speedLimit: number;
}

export interface Vehicle {
  lane: number;
  s: number;
  speed: number;
  /** Personal cruising speed as a fraction of the lane limit. */
  temper: number;
  length: number;
  /** Seconds until a vehicle taken by the hero (lifted, thrown) reappears; 0 = on the road. */
  out?: number;
}

export interface TrafficContext {
  /** Hero position (x, y, z); vehicles brake if the hero stands in their lane ahead. */
  player: { x: number; y: number; z: number };
  /** Ground height under a vehicle, to tell a hero standing in the road from one flying above it. */
  groundY: (x: number, z: number) => number;
  light: (group: LightGroup) => LightState;
}


/** Light cycle shared by every intersection: X-axis streets, then Z-axis streets. */
export function lightState(group: LightGroup, time: number, cycle = TRAFFIC.lightCycle): LightState {
  const t = ((time % cycle) + cycle) % cycle;
  const half = cycle / 2;
  const local = group === 'x' ? t : (t + half) % cycle;
  if (local < half - 2.5) return 'green';
  if (local < half - 0.5) return 'yellow';
  return 'red';
}

/** Speed that stops a vehicle within `distance` metres at the braking rate. */
function speedToStopWithin(distance: number) {
  return distance <= 0 ? 0 : Math.sqrt(2 * TRAFFIC.brake * 0.6 * distance);
}

/** Advances every vehicle by `dt` seconds. Vehicles wrap to the start of their lane at the end. */
export function stepTraffic(vehicles: Vehicle[], lanes: Lane[], dt: number, ctx: TrafficContext) {
  // Sort each lane's vehicles by distance so everyone knows who's ahead.
  const byLane = new Map<number, Vehicle[]>();
  for (const v of vehicles) {
    // Taken off the road: no driving, nobody follows it, back after a while.
    if (v.out && v.out > 0) {
      v.out = Math.max(0, v.out - dt);
      v.speed = 0;
      continue;
    }
    const list = byLane.get(v.lane);
    if (list) list.push(v);
    else byLane.set(v.lane, [v]);
  }
  for (const [laneIndex, list] of byLane) {
    const lane = lanes[laneIndex];
    list.sort((a, b) => a.s - b.s);
    list.forEach((v, i) => {
      let target = lane.speedLimit * v.temper;

      // Follow the vehicle ahead (the first vehicle follows the last one, wrapped).
      const ahead = list[(i + 1) % list.length];
      if (ahead !== v) {
        let gap = ahead.s - v.s;
        if (gap <= 0) gap += lane.path.length;
        gap -= (ahead.length + v.length) / 2;
        const wanted = TRAFFIC.minGap + v.speed * TRAFFIC.headway;
        if (gap < wanted) target = Math.min(target, speedToStopWithin(gap - TRAFFIC.minGap), ahead.speed);
      }

      // Red or yellow light ahead: stop at the line (unless already too close to stop).
      for (const stop of lane.stops) {
        const d = stop.s - v.s - v.length / 2 - TRAFFIC.stopBuffer;
        if (d < -0.5 || d > 60) continue;
        const state = ctx.light(stop.group);
        if (state === 'green') continue;
        const canStop = d > (v.speed * v.speed) / (2 * TRAFFIC.brake) - 1;
        if (state === 'red' || canStop) target = Math.min(target, speedToStopWithin(d));
      }

      // The hero standing in the lane ahead.
      const p = lane.path.at(v.s);
      const dx = ctx.player.x - p.x;
      const dz = ctx.player.z - p.z;
      const fx = Math.sin(p.angle);
      const fz = Math.cos(p.angle);
      const along = dx * fx + dz * fz - v.length / 2;
      const lateral = Math.abs(dx * fz - dz * fx);
      const onRoad = ctx.player.y - ctx.groundY(p.x, p.z) < 3.5;
      if (onRoad && along > 0 && along < TRAFFIC.playerAhead && lateral < TRAFFIC.playerLateral) {
        target = Math.min(target, speedToStopWithin(along - 2));
      }

      const dv = target - v.speed;
      v.speed = Math.max(0, v.speed + Math.max(-TRAFFIC.brake * dt, Math.min(TRAFFIC.accel * dt, dv)));
    });
  }
  for (const v of vehicles) {
    if (v.out) continue;
    const lane = lanes[v.lane];
    v.s += v.speed * dt;
    if (v.s > lane.path.length) v.s -= lane.path.length;
  }
}

/** Places `count` vehicles evenly along a lane with a little jitter. */
export function populateLane(lane: number, laneLength: number, count: number, lengths: number[], rand: () => number): Vehicle[] {
  return Array.from({ length: count }, (_, i) => ({
    lane,
    s: ((i + rand() * 0.4) / count) * laneLength,
    speed: 0,
    temper: 0.8 + rand() * 0.25,
    length: lengths[i % lengths.length],
  }));
}

/**
 * A polyline shifted sideways by `offset` m to the right of travel (negative =
 * left). For heading (dx, dz) the right-hand vector is (−dz, dx) in three.js
 * coordinates, so right-hand traffic uses a positive offset for each direction.
 */
export function offsetPath(points: [number, number][], offset: number): [number, number][] {
  return points.map(([x, z], i) => {
    const [px, pz] = points[Math.max(0, i - 1)];
    const [nx, nz] = points[Math.min(points.length - 1, i + 1)];
    const len = Math.hypot(nx - px, nz - pz) || 1;
    const rx = -(nz - pz) / len;
    const rz = (nx - px) / len;
    return [x + rx * offset, z + rz * offset];
  });
}
