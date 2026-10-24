import { BoxGeometry, CylinderGeometry, type BufferGeometry } from 'three';
import { merged, part } from '../world/propGeometries';

/**
 * Procedural low-poly vehicles (original). Built facing +Z with the wheels on
 * y = 0. Body panels are white so per-instance tints give each vehicle its
 * paint colour; glass, tyres and lights keep their own darker/brighter colours.
 */

export type VehicleType = 'sedan' | 'van' | 'taxi' | 'bus' | 'semi' | 'pickup';

export interface VehicleSpec {
  /** Collision box (m). */
  width: number;
  height: number;
  length: number;
  build: () => BufferGeometry;
}

const GLASS = '#1d2a36';
const TYRE = '#161616';
const LIGHT = '#fff3c4';
const TAIL = '#b3121b';

function wheels(halfTrack: number, axles: number[], radius = 0.36) {
  return axles.flatMap((z) =>
    [-halfTrack, halfTrack].map((x) => part(new CylinderGeometry(radius, radius, 0.28, 10).rotateZ(Math.PI / 2), TYRE, x, radius, z)),
  );
}

function lights(halfWidth: number, frontZ: number, backZ: number, y: number) {
  return [-1, 1].flatMap((s) => [
    part(new BoxGeometry(0.32, 0.16, 0.06), LIGHT, s * (halfWidth - 0.28), y, frontZ),
    part(new BoxGeometry(0.32, 0.14, 0.06), TAIL, s * (halfWidth - 0.28), y, backZ),
  ]);
}

export const VEHICLES: Record<VehicleType, VehicleSpec> = {
  sedan: {
    width: 1.8,
    height: 1.45,
    length: 4.4,
    build: () =>
      merged([
        part(new BoxGeometry(1.8, 0.6, 4.4), '#ffffff', 0, 0.65, 0),
        part(new BoxGeometry(1.55, 0.5, 2.2), '#ffffff', 0, 1.2, -0.2),
        part(new BoxGeometry(1.5, 0.42, 2.1), GLASS, 0, 1.2, -0.2),
        ...wheels(0.82, [-1.35, 1.35]),
        ...lights(0.9, 2.21, -2.21, 0.75),
      ]),
  },
  taxi: {
    width: 1.8,
    height: 1.6,
    length: 4.5,
    build: () =>
      merged([
        part(new BoxGeometry(1.8, 0.6, 4.5), '#ffffff', 0, 0.65, 0),
        part(new BoxGeometry(1.55, 0.5, 2.3), '#ffffff', 0, 1.2, -0.2),
        part(new BoxGeometry(1.5, 0.42, 2.2), GLASS, 0, 1.2, -0.2),
        part(new BoxGeometry(0.6, 0.18, 0.3), '#fff8d0', 0, 1.54, -0.2),
        ...wheels(0.82, [-1.4, 1.4]),
        ...lights(0.9, 2.26, -2.26, 0.75),
      ]),
  },
  van: {
    width: 2,
    height: 2.2,
    length: 5,
    build: () =>
      merged([
        part(new BoxGeometry(2, 1.7, 5), '#ffffff', 0, 1.25, 0),
        part(new BoxGeometry(1.92, 0.6, 0.06), GLASS, 0, 1.6, 2.51),
        part(new BoxGeometry(0.06, 0.5, 1.2), GLASS, -1.01, 1.6, 1.7),
        part(new BoxGeometry(0.06, 0.5, 1.2), GLASS, 1.01, 1.6, 1.7),
        ...wheels(0.92, [-1.6, 1.6], 0.4),
        ...lights(1, 2.51, -2.51, 0.85),
      ]),
  },
  pickup: {
    width: 2,
    height: 1.9,
    length: 5.4,
    build: () =>
      merged([
        part(new BoxGeometry(2, 0.7, 5.4), '#ffffff', 0, 0.8, 0),
        part(new BoxGeometry(1.85, 0.75, 2), '#ffffff', 0, 1.5, 0.9),
        part(new BoxGeometry(1.8, 0.5, 1.9), GLASS, 0, 1.55, 0.9),
        part(new BoxGeometry(1.9, 0.35, 2.5), '#3a3a3a', 0, 1.3, -1.4),
        ...wheels(0.92, [-1.7, 1.7], 0.42),
        ...lights(1, 2.71, -2.71, 0.9),
      ]),
  },
  bus: {
    width: 2.5,
    height: 3.1,
    length: 12,
    build: () =>
      merged([
        part(new BoxGeometry(2.5, 2.6, 12), '#ffffff', 0, 1.7, 0),
        part(new BoxGeometry(2.52, 0.9, 10.5), GLASS, 0, 2.2, -0.4),
        part(new BoxGeometry(2.3, 1.1, 0.06), GLASS, 0, 2.1, 6.01),
        ...wheels(1.1, [-4, 4], 0.5),
        ...lights(1.25, 6.01, -6.01, 0.9),
      ]),
  },
  semi: {
    width: 2.5,
    height: 3.8,
    length: 15,
    build: () =>
      merged([
        // Cab (tinted) at the front, silver trailer behind.
        part(new BoxGeometry(2.5, 2.6, 3.2), '#ffffff', 0, 1.9, 5.9),
        part(new BoxGeometry(2.3, 0.9, 0.06), GLASS, 0, 2.6, 7.51),
        part(new BoxGeometry(2.6, 3.0, 11), '#c9ccd1', 0, 2.5, -1.6),
        ...wheels(1.1, [5.8, -4, -6], 0.52),
        ...lights(1.25, 7.51, -7.11, 1),
      ]),
  },
};
