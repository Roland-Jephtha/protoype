/**
 * Procedural, deterministic layout for the Phase 1 test district.
 * Pure data — rendering and colliders are built from this in TestDistrict.tsx.
 * Phase 4/5 will replace this with authored district chunks loaded by the
 * streaming manager; the output shape here is intentionally chunk-like.
 */

export interface BuildingDef {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  /** Base colour (hex). */
  color: number;
  /** Optional rooftop unit (AC box / water tank) footprint, relative to roof centre. */
  roofUnit?: { dx: number; dz: number; w: number; d: number; h: number };
}

export interface BlockDef {
  x: number;
  z: number;
  size: number;
  kind: 'buildings' | 'plaza' | 'landmark';
}

export interface CityLayout {
  blocks: BlockDef[];
  buildings: BuildingDef[];
  /** The orientation landmark tower (also present in `buildings`). */
  landmark: BuildingDef | null;
  /** Street centre lines: axis-aligned, spanning the district. */
  streetLines: { axis: 'x' | 'z'; offset: number }[];
  /** Half-size of the playable square (world boundary). */
  halfExtent: number;
  sidewalkHeight: number;
}

export const CITY = {
  blockSize: 40,
  streetWidth: 16,
  blocksPerSide: 5,
  sidewalkHeight: 0.15,
  seed: 1938,
} as const;

/** Small fast seeded PRNG (mulberry32). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [0x8a8f98, 0x6f7782, 0x9c9488, 0x5d6670, 0xa8a59e, 0x4f5a66, 0x7d7469, 0xb3b7bd];

export function generateCityLayout(seed: number = CITY.seed): CityLayout {
  const rand = mulberry32(seed);
  const { blockSize, streetWidth, blocksPerSide, sidewalkHeight } = CITY;
  const pitch = blockSize + streetWidth;
  const half = Math.floor(blocksPerSide / 2);

  const blocks: BlockDef[] = [];
  const buildings: BuildingDef[] = [];
  let landmark: BuildingDef | null = null;

  for (let ix = -half; ix <= half; ix++) {
    for (let iz = -half; iz <= half; iz++) {
      const x = ix * pitch;
      const z = iz * pitch;
      const kind: BlockDef['kind'] = ix === 0 && iz === 0 ? 'plaza' : ix === 0 && iz === -1 ? 'landmark' : 'buildings';
      blocks.push({ x, z, size: blockSize, kind });

      if (kind === 'landmark') {
        // Central tower: the orientation landmark, visible from anywhere.
        landmark = { x, z, width: 22, depth: 22, height: 210, color: 0xc9ccd1 };
        buildings.push(landmark);
        continue;
      }
      if (kind !== 'buildings') continue;

      // Taller buildings toward the centre, lower at the edges.
      const centrality = 1 - Math.max(Math.abs(ix), Math.abs(iz)) / (half + 1);
      const lotsPerSide = rand() < 0.35 ? 1 : 2;
      const lot = blockSize / lotsPerSide;
      for (let lx = 0; lx < lotsPerSide; lx++) {
        for (let lz = 0; lz < lotsPerSide; lz++) {
          const inset = 1.5 + rand() * 2;
          const width = lot - inset * 2;
          const depth = lot - inset * 2 - rand() * 3;
          const height = 14 + rand() * (30 + 110 * centrality) + (lotsPerSide === 1 ? 20 : 0);
          const bx = x - blockSize / 2 + lot * (lx + 0.5);
          const bz = z - blockSize / 2 + lot * (lz + 0.5);
          const roofUnit =
            rand() < 0.8
              ? {
                  dx: (rand() - 0.5) * width * 0.4,
                  dz: (rand() - 0.5) * depth * 0.4,
                  w: 2 + rand() * 3,
                  d: 2 + rand() * 3,
                  h: 1.5 + rand() * 2,
                }
              : undefined;
          buildings.push({
            x: bx,
            z: bz,
            width,
            depth,
            height: Math.round(height),
            color: PALETTE[Math.floor(rand() * PALETTE.length)],
            roofUnit,
          });
        }
      }
    }
  }

  const streetLines: CityLayout['streetLines'] = [];
  for (let i = -half; i < half; i++) {
    const offset = i * pitch + pitch / 2;
    streetLines.push({ axis: 'x', offset }, { axis: 'z', offset });
  }

  return {
    blocks,
    buildings,
    landmark,
    streetLines,
    halfExtent: half * pitch + blockSize / 2 + streetWidth,
    sidewalkHeight,
  };
}
