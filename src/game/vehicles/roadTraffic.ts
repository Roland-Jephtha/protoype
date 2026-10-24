import { mulberry32 } from '../world/cityLayout';
import { offsetPath, samplePath, type Lane } from './traffic';
import type { VehicleSetup } from './TrafficLayer';
import type { VehicleType } from './vehicleGeometry';

const PAINTS = ['#c7372f', '#2f5d9e', '#e8e8e8', '#202226', '#9aa3ad', '#2f6b3a', '#d8a13a', '#5a2f6b', '#7a3a24', '#3d7c8c'];

/** Picks a vehicle type by weight. */
function pickType(rand: () => number, mix: [VehicleType, number][]): VehicleType {
  const total = mix.reduce((a, [, w]) => a + w, 0);
  let r = rand() * total;
  for (const [t, w] of mix) {
    if ((r -= w) <= 0) return t;
  }
  return mix[0][0];
}

/** Paint for a vehicle type (taxis are yellow, buses red/white). */
export function paintFor(type: VehicleType, rand: () => number) {
  if (type === 'taxi') return '#f2c230';
  if (type === 'bus') return rand() < 0.5 ? '#c7372f' : '#2f5d9e';
  return PAINTS[Math.floor(rand() * PAINTS.length)];
}

/** Spreads `perLane` vehicles along each lane with the given type mix. */
export function spawnVehicles(lanes: Lane[], perLane: number, mix: [VehicleType, number][], seed: number): VehicleSetup[] {
  const rand = mulberry32(seed);
  const out: VehicleSetup[] = [];
  lanes.forEach((lane, li) => {
    for (let i = 0; i < perLane; i++) {
      const type = pickType(rand, mix);
      out.push({ lane: li, type, s: ((i + rand() * 0.5) / perLane) * lane.path.length, temper: 0.85 + rand() * 0.2, paint: paintFor(type, rand) });
    }
  });
  return out;
}

/** Two lanes (right-hand traffic) along an open road path, each way 3.2 m off the centre line. */
export function twoWayRoad(points: [number, number][], speedLimit: number, id: string): Lane[] {
  return [
    { id: `${id}-a`, path: samplePath(offsetPath(points, 3.2)), stops: [], speedLimit },
    { id: `${id}-b`, path: samplePath(offsetPath([...points].reverse(), 3.2)), stops: [], speedLimit },
  ];
}
