import type { DesertParams, ForestParams } from '../game/world/terrainNoise';
import type { GraphicsQuality } from './gameConfig';

/**
 * World regions. Each is its own map, loaded on travel (flying off an edge
 * with an exit, or the pause menu's Travel page). Map directions: -Z is north.
 *
 *            Blackwood Forest
 *                  ▲ north
 *   (edge)  Metropolis  ── east ▶  Red Mesa Desert
 */

export type RegionId = 'metropolis' | 'desert' | 'forest';
export type Side = 'north' | 'south' | 'east' | 'west';

export interface Entry {
  x: number;
  z: number;
  /** Visual facing yaw (atan2(x, z) convention). */
  facing: number;
}

export interface RegionLook {
  background: string;
  fog: { color: string; near: number; far: number };
  /** Sun direction offset from the player (also the drei Sky sun position). */
  sunOffset: [number, number, number];
  sun: { color: string; intensity: number };
  hemisphere: { sky: string; ground: string; intensity: number };
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
}

interface RegionBase {
  id: RegionId;
  name: string;
  description: string;
  look: RegionLook;
  /** Regions reachable by flying/running off each edge. */
  exits: Partial<Record<Side, RegionId>>;
  /** Where the hero appears when arriving across an edge (keyed by the edge arrived through). */
  entries: Partial<Record<Side, Entry>>;
  spawn: Entry;
}

export interface CityRegion extends RegionBase {
  kind: 'city';
}

export interface TerrainRegion extends RegionBase {
  kind: 'terrain';
  /** Square map side (m), centred on the origin. */
  size: number;
  terrain: DesertParams | ForestParams;
}

export type RegionDef = CityRegion | TerrainRegion;

const FACE_NORTH = Math.PI; // toward -Z
const FACE_EAST = Math.PI / 2; // toward +X

/** Heightfield resolution (cells per side) by quality. Mesh and physics share it. */
export const TERRAIN_CELLS: Record<GraphicsQuality, number> = { low: 256, medium: 384, high: 512 };

/** Prop/tree density multiplier by quality for outdoor regions. */
export const OUTDOOR_DENSITY: Record<GraphicsQuality, number> = { low: 0.4, medium: 0.7, high: 1 };

/** Fog/draw distance multiplier by quality for outdoor regions. */
export const OUTDOOR_DRAW_SCALE: Record<GraphicsQuality, number> = { low: 0.55, medium: 0.8, high: 1 };

/** Forest trees (playable area / scenery ring) per quality. Trees are most of the forest's cost. */
export const FOREST_TREES: Record<GraphicsQuality, { inner: number; outer: number }> = {
  low: { inner: 3500, outer: 900 },
  medium: { inner: 6500, outer: 1600 },
  high: { inner: 11000, outer: 3500 },
};

export const REGIONS: Record<RegionId, RegionDef> = {
  metropolis: {
    id: 'metropolis',
    kind: 'city',
    name: 'Metropolis',
    description: 'Downtown blocks, the landmark tower and Metropolis Bay — run across the water to the lighthouse.',
    look: {
      background: '#9fb0c4',
      fog: { color: '#9fb0c4', near: 90, far: 900 },
      sunOffset: [-70, 55, -45],
      sun: { color: '#ffc38a', intensity: 2.6 },
      hemisphere: { sky: '#c6d4ec', ground: '#6a5d52', intensity: 1.5 },
      sky: { turbidity: 6, rayleigh: 1.6, mieCoefficient: 0.006, mieDirectionalG: 0.85 },
    },
    exits: { east: 'desert', north: 'forest' },
    entries: {
      east: { x: 140, z: 28, facing: -FACE_EAST },
      north: { x: 0, z: -140, facing: 0 },
    },
    spawn: { x: 0, z: 8, facing: FACE_NORTH },
  },

  desert: {
    id: 'desert',
    kind: 'terrain',
    name: 'Red Mesa Desert',
    description: 'Dunes, mesas, the long canyon and the Prometheus test range. East of the city.',
    size: 2400,
    look: {
      background: '#e3d2b4',
      fog: { color: '#dccaa8', near: 220, far: 1500 },
      sunOffset: [-40, 120, 30],
      sun: { color: '#fff0d4', intensity: 3.1 },
      hemisphere: { sky: '#bcd2ee', ground: '#c49a6c', intensity: 1.25 },
      sky: { turbidity: 9, rayleigh: 1.1, mieCoefficient: 0.008, mieDirectionalG: 0.82 },
    },
    terrain: {
      kind: 'desert',
      seed: 7331,
      baseAmplitude: 18,
      duneAmplitude: 7,
      duneWavelength: 38,
      duneAngle: 0.6,
      mesaHeight: 70,
      mesaCoverage: 0.12,
      canyon: {
        points: [
          [-1150, -650],
          [-700, -420],
          [-300, -520],
          [100, -300],
          [500, -200],
          [900, 150],
          [1150, 250],
        ],
        width: 60,
        depth: 45,
      },
      highway: {
        points: [
          [-1200, 350],
          [-400, 300],
          [400, 420],
          [1200, 380],
        ],
        width: 16,
      },
      flats: [
        { x: -1050, z: 340, radius: 40, falloff: 40 }, // arrival from the city
        { x: 350, z: 760, radius: 150, falloff: 70 }, // Prometheus base
        { x: -520, z: 820, radius: 220, falloff: 140 }, // salt pan
      ],
    },
    exits: { west: 'metropolis' },
    entries: { west: { x: -1050, z: 340, facing: FACE_EAST } },
    spawn: { x: -1050, z: 340, facing: FACE_EAST },
  },

  forest: {
    id: 'forest',
    kind: 'terrain',
    name: 'Blackwood Forest',
    description: 'Wooded hills, the river and dam, the ranger station — and the crash site. North of the city.',
    size: 2400,
    look: {
      background: '#9fb3ad',
      fog: { color: '#8fa39a', near: 50, far: 600 },
      sunOffset: [-90, 45, -60],
      sun: { color: '#ffd6a0', intensity: 2.3 },
      hemisphere: { sky: '#a9c4d6', ground: '#3d4a2c', intensity: 1.35 },
      sky: { turbidity: 5, rayleigh: 2, mieCoefficient: 0.006, mieDirectionalG: 0.85 },
    },
    terrain: {
      kind: 'forest',
      seed: 4242,
      hillAmplitude: 35,
      hillScale: 380,
      river: {
        points: [
          [-1200, -200],
          [-700, -50],
          [-200, -250],
          [300, 0],
          [700, 200],
          [1200, 100],
        ],
        width: 34,
        depth: 5,
      },
      rail: {
        points: [
          [-1200, 600],
          [0, 520],
          [1200, 650],
        ],
        width: 10,
      },
      // Stays south of the railway (no level crossing), from the city arrival to the west edge.
      road: {
        points: [
          [60, 1200],
          [45, 1080],
          [-20, 980],
          [-130, 915],
          [-350, 860],
          [-700, 800],
          [-1000, 760],
          [-1200, 740],
        ],
        width: 14,
      },
      flats: [
        { x: 0, z: 1050, radius: 40, falloff: 40 }, // arrival from the city
        { x: -450, z: 380, radius: 70, falloff: 40 }, // crash site (prologue)
        { x: 550, z: -520, radius: 50, falloff: 30 }, // ranger station
        { x: -800, z: -620, radius: 35, falloff: 25 }, // cabins
      ],
    },
    exits: { south: 'metropolis' },
    entries: { south: { x: 0, z: 1050, facing: FACE_NORTH } },
    spawn: { x: 0, z: 1050, facing: FACE_NORTH },
  },
};

export const REGION_ORDER: RegionId[] = ['metropolis', 'desert', 'forest'];

/** The edge on the destination you arrive through when leaving a region via `side`. */
export function oppositeSide(side: Side): Side {
  return side === 'north' ? 'south' : side === 'south' ? 'north' : side === 'east' ? 'west' : 'east';
}

/**
 * Which edge (if any) a position has crossed, for a square region of half-size `half`.
 * North is -Z.
 */
export function crossedSide(x: number, z: number, half: number): Side | null {
  if (z < -half) return 'north';
  if (z > half) return 'south';
  if (x > half) return 'east';
  if (x < -half) return 'west';
  return null;
}
