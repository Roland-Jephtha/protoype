import RAPIER from '@dimforge/rapier3d-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { crossedSide, oppositeSide, REGION_ORDER, REGIONS, TERRAIN_CELLS, type TerrainRegion } from '../src/config/regions';
import { createHeightFunction, distanceToPath, gridHeightAt, sampleGrid, toRapierHeights } from '../src/game/world/terrainNoise';

beforeAll(async () => {
  await RAPIER.init();
});

describe('physics heightfield matches the rendered terrain exactly', () => {
  it('Rapier ray casts equal gridHeightAt everywhere (layout + triangulation)', () => {
    const region = REGIONS.desert as TerrainRegion;
    const cells = 48;
    const grid = sampleGrid(createHeightFunction(region.terrain), region.size, cells);
    const world = new RAPIER.World({ x: 0, y: -9.8, z: 0 });
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(cells, cells, toRapierHeights(grid, cells), { x: region.size, y: 1, z: region.size }),
      world.createRigidBody(RAPIER.RigidBodyDesc.fixed()),
    );
    world.step(); // builds the query structures
    let maxErr = 0;
    for (let i = 0; i < 400; i++) {
      const x = ((i * 7919.37) % 2300) - 1150;
      const z = ((i * 6007.11) % 2300) - 1150;
      const hit = world.castRay(new RAPIER.Ray({ x, y: 500, z }, { x: 0, y: -1, z: 0 }), 1000, true);
      expect(hit).not.toBeNull();
      maxErr = Math.max(maxErr, Math.abs(500 - hit!.timeOfImpact - gridHeightAt(grid, region.size, cells, x, z)));
    }
    world.free();
    expect(maxErr).toBeLessThan(1e-3);
  });
});

const outdoor = REGION_ORDER.map((id) => REGIONS[id]).filter((r): r is TerrainRegion => r.kind === 'terrain');

describe('terrain height functions', () => {
  for (const region of outdoor) {
    const h = createHeightFunction(region.terrain);
    it(`${region.name}: deterministic and within sensible bounds`, () => {
      const h2 = createHeightFunction(region.terrain);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < 2000; i++) {
        const x = ((i * 7919) % 2400) - 1200;
        const z = ((i * 104729) % 2400) - 1200;
        const y = h(x, z);
        expect(Number.isFinite(y)).toBe(true);
        expect(y).toBe(h2(x, z));
        min = Math.min(min, y);
        max = Math.max(max, y);
      }
      expect(min).toBeGreaterThan(-80);
      expect(max).toBeLessThan(220);
      expect(max - min).toBeGreaterThan(20); // not flat
    });

    it(`${region.name}: flattened sites are flat`, () => {
      for (const f of region.terrain.flats) {
        const c = h(f.x, f.z);
        for (const [dx, dz] of [
          [f.radius * 0.7, 0],
          [0, -f.radius * 0.7],
          [-f.radius * 0.5, f.radius * 0.5],
        ]) {
          expect(Math.abs(h(f.x + dx, f.z + dz) - c)).toBeLessThan(0.6);
        }
      }
    });
  }

  it('the desert canyon is carved well below its rims', () => {
    const d = REGIONS.desert as TerrainRegion;
    if (d.terrain.kind !== 'desert') throw new Error('expected desert');
    const h = createHeightFunction(d.terrain);
    const [x, z] = d.terrain.canyon.points[3];
    // 120 m to the side of the canyon centre line (perpendicular-ish) is rim terrain.
    const rim = Math.max(h(x, z + 120), h(x, z - 120));
    expect(rim - h(x, z)).toBeGreaterThan(20);
  });

  it('the forest river is carved into a channel', () => {
    const f = REGIONS.forest as TerrainRegion;
    if (f.terrain.kind !== 'forest') throw new Error('expected forest');
    const h = createHeightFunction(f.terrain);
    for (const [x, z] of f.terrain.river.points.slice(1, -1)) {
      const banks = (h(x + 60, z) + h(x - 60, z) + h(x, z + 60) + h(x, z - 60)) / 4;
      expect(banks - h(x, z)).toBeGreaterThan(2);
    }
  });

  it('samples a full grid quickly enough for a loading screen', () => {
    const region = REGIONS.desert as TerrainRegion;
    const h = createHeightFunction(region.terrain);
    const t0 = performance.now();
    const grid = sampleGrid(h, region.size, TERRAIN_CELLS.medium);
    const ms = performance.now() - t0;
    expect(grid.length).toBe((TERRAIN_CELLS.medium + 1) ** 2);
    expect(ms).toBeLessThan(4000);
  });

  it('grid interpolation matches the samples at grid points', () => {
    const region = REGIONS.forest as TerrainRegion;
    const h = createHeightFunction(region.terrain);
    const cells = 64;
    const grid = sampleGrid(h, region.size, cells);
    const step = region.size / cells;
    expect(gridHeightAt(grid, region.size, cells, -region.size / 2 + 3 * step, -region.size / 2 + 5 * step)).toBeCloseTo(grid[5 * (cells + 1) + 3], 4);
  });
});

describe('regions', () => {
  it('every exit leads to a region that has a matching arrival point', () => {
    for (const id of REGION_ORDER) {
      for (const [side, dest] of Object.entries(REGIONS[id].exits)) {
        const target = REGIONS[dest!];
        expect(target).toBeDefined();
        expect(target.entries[oppositeSide(side as never)]).toBeDefined();
      }
    }
  });

  it('spawn and arrival points lie inside the map', () => {
    for (const r of outdoor) {
      for (const e of [r.spawn, ...Object.values(r.entries)]) {
        expect(Math.abs(e!.x)).toBeLessThan(r.size / 2 - 50);
        expect(Math.abs(e!.z)).toBeLessThan(r.size / 2 - 50);
      }
    }
  });

  it('detects edge crossings (north is -Z)', () => {
    expect(crossedSide(0, -1300, 1200)).toBe('north');
    expect(crossedSide(1300, 0, 1200)).toBe('east');
    expect(crossedSide(0, 0, 1200)).toBeNull();
  });

  it('distanceToPath measures distance to a polyline', () => {
    expect(distanceToPath({ points: [[0, 0], [100, 0]] }, 50, 30).distance).toBeCloseTo(30);
  });
});
