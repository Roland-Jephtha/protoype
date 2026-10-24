import type { VehicleType } from '../vehicles/vehicleGeometry';

/** A vehicle the hero could pick up right now. */
export interface LiftCandidate {
  source: LiftSource;
  key: number;
  type: VehicleType;
  paint: string;
  x: number;
  y: number;
  z: number;
  /** Heading (rad) of the vehicle. */
  yaw: number;
  distance: number;
}

/** Something that owns liftable things (a traffic layer). */
export interface LiftSource {
  nearest: (x: number, y: number, z: number, maxDistance: number) => LiftCandidate | null;
  /** Removes it from the world (the hero now holds it). */
  take: (key: number) => void;
}

/** A vehicle knocked flying or blown up: Lifting turns it into a physics wreck. */
export interface WreckRequest {
  type: VehicleType;
  paint: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vy: number;
  vz: number;
}

export const wreckRequests: WreckRequest[] = [];

/** Lift sources in the mounted region. */
export const liftSources = new Set<LiftSource>();

export function nearestLiftable(x: number, y: number, z: number, maxDistance: number): LiftCandidate | null {
  let best: LiftCandidate | null = null;
  for (const s of liftSources) {
    const c = s.nearest(x, y, z, maxDistance);
    if (c && (!best || c.distance < best.distance)) best = c;
  }
  return best;
}
