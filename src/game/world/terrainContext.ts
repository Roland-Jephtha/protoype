import { createContext, useContext } from 'react';
import type { TerrainRegion } from '../../config/regions';

export interface TerrainInfo {
  region: TerrainRegion;
  size: number;
  cells: number;
  /** Row-major (row = z) height grid shared by mesh and physics. */
  grid: Float32Array;
  /** Analytic height function (also defined beyond the playable square, for scenery). */
  height: (x: number, z: number) => number;
  /** Exact surface height (the triangulated grid physics uses). */
  ground: (x: number, z: number) => number;
  /** Surface steepness 0 (flat) .. 1 (vertical) from the grid. */
  slope: (x: number, z: number) => number;
}

export const TerrainContext = createContext<TerrainInfo | null>(null);

export function useTerrain(): TerrainInfo {
  const t = useContext(TerrainContext);
  if (!t) throw new Error('useTerrain() must be used inside <Terrain>');
  return t;
}
