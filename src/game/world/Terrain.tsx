import { useEffect, useMemo, type ReactNode } from 'react';
import { BufferAttribute, BufferGeometry, Color, DoubleSide, MeshStandardMaterial } from 'three';
import { TERRAIN_CELLS, type TerrainRegion } from '../../config/regions';
import { useSettings } from '../../state/settings';
import { TerrainContext, type TerrainInfo } from './terrainContext';
import { createHeightFunction, createNoise2D, distanceToPath, gridHeightAt, sampleGrid, smoothstep, toRapierHeights } from './terrainNoise';
import { useStaticColliders } from './useStaticColliders';

const CHUNKS = 4; // 4×4 meshes → frustum culling without many draw calls

/**
 * Outdoor terrain: one height grid feeds both the rendered chunk meshes and
 * the Rapier heightfield, triangulated identically (verified in tests), so the
 * hero's feet meet exactly the ground you see.
 */
export function Terrain({ region, children }: { region: TerrainRegion; children?: ReactNode }) {
  const quality = useSettings((s) => s.graphicsQuality);
  const cells = TERRAIN_CELLS[quality];

  const info = useMemo<TerrainInfo>(() => {
    const height = createHeightFunction(region.terrain);
    const grid = sampleGrid(height, region.size, cells);
    const step = region.size / cells;
    const ground = (x: number, z: number) => gridHeightAt(grid, region.size, cells, x, z);
    const slope = (x: number, z: number) => {
      const dx = (ground(x + step, z) - ground(x - step, z)) / (2 * step);
      const dz = (ground(x, z + step) - ground(x, z - step)) / (2 * step);
      return 1 - 1 / Math.sqrt(1 + dx * dx + dz * dz);
    };
    return { region, size: region.size, cells, grid, height, ground, slope };
  }, [region, cells]);

  const { geometries, material } = useMemo(() => buildTerrainMeshes(info), [info]);
  useEffect(
    () => () => {
      geometries.forEach((g) => g.dispose());
      material.dispose();
    },
    [geometries, material],
  );

  useStaticColliders(
    (rapier) => [rapier.ColliderDesc.heightfield(cells, cells, toRapierHeights(info.grid, cells), { x: region.size, y: 1, z: region.size })],
    [info],
  );

  return (
    <TerrainContext.Provider value={info}>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} material={material} receiveShadow />
      ))}
      {children}
    </TerrainContext.Provider>
  );
}

function buildTerrainMeshes(info: TerrainInfo) {
  const { grid, size, cells, region } = info;
  const n = cells + 1;
  const step = size / cells;
  const k = cells / CHUNKS;
  const colorAt = createGroundColorizer(info);
  const geometries: BufferGeometry[] = [];

  const h = (ix: number, iz: number) => grid[Math.min(cells, Math.max(0, iz)) * n + Math.min(cells, Math.max(0, ix))];
  const c = new Color();

  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const vn = (k + 1) * (k + 1);
      const pos = new Float32Array(vn * 3);
      const nor = new Float32Array(vn * 3);
      const col = new Float32Array(vn * 3);
      let vi = 0;
      for (let jz = 0; jz <= k; jz++) {
        for (let jx = 0; jx <= k; jx++) {
          const ix = cx * k + jx;
          const iz = cz * k + jz;
          const x = -size / 2 + ix * step;
          const z = -size / 2 + iz * step;
          const y = h(ix, iz);
          pos[vi * 3] = x;
          pos[vi * 3 + 1] = y;
          pos[vi * 3 + 2] = z;
          // Normal from central differences over the full grid (seamless across chunks).
          const dx = (h(ix + 1, iz) - h(ix - 1, iz)) / (2 * step);
          const dz = (h(ix, iz + 1) - h(ix, iz - 1)) / (2 * step);
          const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
          nor[vi * 3] = -dx * inv;
          nor[vi * 3 + 1] = inv;
          nor[vi * 3 + 2] = -dz * inv;
          colorAt(x, y, z, 1 - inv, c);
          col[vi * 3] = c.r;
          col[vi * 3 + 1] = c.g;
          col[vi * 3 + 2] = c.b;
          vi++;
        }
      }
      // Same diagonal as Rapier's heightfield: (x+1, z)–(x, z+1).
      const index = new Uint32Array(k * k * 6);
      let ii = 0;
      for (let jz = 0; jz < k; jz++) {
        for (let jx = 0; jx < k; jx++) {
          const v00 = jz * (k + 1) + jx;
          const v10 = v00 + 1;
          const v01 = v00 + (k + 1);
          const v11 = v01 + 1;
          index.set([v00, v01, v10, v10, v01, v11], ii);
          ii += 6;
        }
      }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3));
      g.setAttribute('normal', new BufferAttribute(nor, 3));
      g.setAttribute('color', new BufferAttribute(col, 3));
      g.setIndex(new BufferAttribute(index, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      geometries.push(g);
    }
  }

  geometries.push(buildOuterRing(info, colorAt), buildEdgeSkirt(info));
  return { geometries, material: createTerrainMaterial(region.terrain.kind) };
}

/**
 * Low-detail scenery beyond the playable square (out to 1.5× the map size on
 * every side), from the same height function, so flying high never shows the
 * world's edge. Purely visual: the Player's edge logic keeps the hero inside.
 */
function buildOuterRing(info: TerrainInfo, colorAt: (x: number, y: number, z: number, slope: number, out: Color) => void) {
  const outer = info.size * 1.5;
  const cells = 96;
  const step = (outer * 2) / cells;
  const half = info.size / 2;
  const n = cells + 1;
  // One height sample per grid point (slightly lowered so it never z-fights the
  // detailed terrain at the seam), reused for normals and both triangles.
  const hs = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) hs[iz * n + ix] = info.height(-outer + ix * step, -outer + iz * step) - 0.6;
  const hAt = (ix: number, iz: number) => hs[Math.min(cells, Math.max(0, iz)) * n + Math.min(cells, Math.max(0, ix))];

  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const c = new Color();
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      const x = -outer + ix * step;
      const z = -outer + iz * step;
      const y = hs[i];
      const dx = (hAt(ix + 1, iz) - hAt(ix - 1, iz)) / (2 * step);
      const dz = (hAt(ix, iz + 1) - hAt(ix, iz - 1)) / (2 * step);
      const inv = 1 / Math.sqrt(dx * dx + 1 + dz * dz);
      pos.set([x, y, z], i * 3);
      nor.set([-dx * inv, inv, -dz * inv], i * 3);
      colorAt(x, y, z, 1 - inv, c);
      col.set([c.r, c.g, c.b], i * 3);
    }
  }
  const index: number[] = [];
  for (let iz = 0; iz < cells; iz++) {
    for (let ix = 0; ix < cells; ix++) {
      const x0 = -outer + ix * step;
      const z0 = -outer + iz * step;
      // Skip cells entirely inside the playable square (drawn by the detailed chunks).
      if (x0 >= -half && x0 + step <= half && z0 >= -half && z0 + step <= half) continue;
      const v00 = iz * n + ix;
      const v10 = v00 + 1;
      const v01 = v00 + n;
      index.push(v00, v01, v10, v10, v01, v01 + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nor, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** A curtain hanging 40 m below the edge of the detailed terrain, hiding any seam with the outer ring. */
function buildEdgeSkirt(info: TerrainInfo) {
  const { grid, cells, size } = info;
  const n = cells + 1;
  const step = size / cells;
  const pos: number[] = [];
  const col: number[] = [];
  const drop = 40;
  const edge = (ix: number, iz: number) => [-size / 2 + ix * step, grid[iz * n + ix], -size / 2 + iz * step] as const;
  const quad = (a: readonly [number, number, number], b: readonly [number, number, number]) => {
    pos.push(a[0], a[1], a[2], a[0], a[1] - drop, a[2], b[0], b[1], b[2]);
    pos.push(b[0], b[1], b[2], a[0], a[1] - drop, a[2], b[0], b[1] - drop, b[2]);
    for (let i = 0; i < 6; i++) col.push(0.35, 0.3, 0.24);
  };
  for (let i = 0; i < cells; i++) {
    quad(edge(i, 0), edge(i + 1, 0));
    quad(edge(i + 1, cells), edge(i, cells));
    quad(edge(0, i + 1), edge(0, i));
    quad(edge(cells, i), edge(cells, i + 1));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Per-vertex ground colour by biome, height, slope and nearby features. */
function createGroundColorizer(info: TerrainInfo) {
  const t = info.region.terrain;
  const noise = createNoise2D(t.seed + 9);
  const mix = (a: Color, b: Color, f: number) => a.lerp(b, Math.min(1, Math.max(0, f)));
  const tmp = new Color();

  if (t.kind === 'desert') {
    const sandA = new Color('#c99459');
    const sandB = new Color('#e0b47b');
    const rockA = new Color('#93492c');
    const rockB = new Color('#c27a4a');
    const salt = new Color('#e8ddca');
    const canyonFloor = new Color('#a3704b');
    const saltPan = t.flats[2];
    const floorLevel = info.ground(t.canyon.points[0][0], t.canyon.points[0][1]);
    return (x: number, y: number, z: number, slope: number, out: Color) => {
      out.copy(sandA);
      mix(out, sandB, 0.5 + 0.6 * noise(x / 70, z / 70));
      // Exposed rock on steep faces, banded by height like sedimentary strata.
      tmp.copy(rockA);
      mix(tmp, rockB, 0.5 + 0.5 * Math.sin(y * 0.55 + noise(x / 40, z / 40) * 3));
      mix(out, tmp, smoothstep(0.12, 0.3, slope));
      if (saltPan) {
        const d = Math.hypot(x - saltPan.x, z - saltPan.z);
        mix(out, salt, (1 - smoothstep(saltPan.radius * 0.6, saltPan.radius + saltPan.falloff * 0.6, d)) * (1 - smoothstep(0.05, 0.15, slope)));
      }
      if (y < floorLevel + 4) mix(out, canyonFloor, 0.55);
    };
  }

  const grassA = new Color('#3d6a2a');
  const grassB = new Color('#5d8c3b');
  const floor = new Color('#4a3c25');
  const rock = new Color('#6f6b63');
  const mud = new Color('#5b4a33');
  const clearing = new Color('#729c47');
  return (x: number, _y: number, z: number, slope: number, out: Color) => {
    out.copy(grassA);
    mix(out, grassB, 0.5 + 0.7 * noise(x / 55, z / 55));
    mix(out, floor, smoothstep(0.1, 0.45, noise(x / 140 + 5, z / 140)));
    const r = distanceToPath(t.river, x, z).distance;
    mix(out, mud, 1 - smoothstep(t.river.width / 2, t.river.width / 2 + 18, r));
    for (const f of t.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.radius + f.falloff) mix(out, clearing, (1 - smoothstep(f.radius * 0.7, f.radius + f.falloff * 0.5, d)) * 0.8);
    }
    mix(out, rock, smoothstep(0.22, 0.42, slope));
  };
}

/**
 * Standard lit material with vertex colours plus a cheap world-space detail
 * noise, so large flat areas don't look like smooth plastic.
 */
function createTerrainMaterial(kind: 'desert' | 'forest') {
  // Double-sided so the edge skirt hides seams from either side.
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: kind === 'desert' ? 0.93 : 0.97, metalness: 0, side: DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTWorld;
         float tHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
         float tNoise(vec2 p) {
           vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
           return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
         }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float tDetail = tNoise(vTWorld.xz * 0.45) * 0.6 + tNoise(vTWorld.xz * 2.1) * 0.4;
         diffuseColor.rgb *= 0.88 + 0.22 * tDetail;`,
      );
  };
  material.customProgramCacheKey = () => `krypton-terrain-${kind}`;
  return material;
}
