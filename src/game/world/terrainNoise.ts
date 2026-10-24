import { mulberry32 } from './cityLayout';

/**
 * Deterministic, seeded terrain height functions for the outdoor regions.
 * Pure (no three.js / DOM), so heights are identical in the renderer, the
 * physics heightfield and unit tests.
 */

/** Seeded 2D gradient (Perlin-style) noise, output roughly in [-1, 1]. */
export function createNoise2D(seed: number) {
  const rand = mulberry32(seed);
  const perm = new Uint16Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number, x: number, y: number) => {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return -x + y;
      case 2: return x - y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = grad(aa, xf, yf) + u * (grad(ba, xf - 1, yf) - grad(aa, xf, yf));
    const x2 = grad(ab, xf, yf - 1) + u * (grad(bb, xf - 1, yf - 1) - grad(ab, xf, yf - 1));
    return (x1 + v * (x2 - x1)) * 0.7071;
  };
}

/** Fractal Brownian motion: octaves of noise, output roughly in [-1, 1]. */
export function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves: number) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A smooth winding path across the map (canyon, river, road, rail). */
export interface PathDef {
  /** Points [x, z] the path passes through, in order. */
  points: [number, number][];
}

const pathLengths = new WeakMap<PathDef, number>();

/** Distance from (x, z) to a polyline, plus the parameter along it (0..1). */
export function distanceToPath(path: PathDef, x: number, z: number) {
  let best = Infinity;
  let bestT = 0;
  const pts = path.points;
  let travelled = 0;
  let total = pathLengths.get(path) ?? -1;
  if (total < 0) {
    total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pathLengths.set(path, total);
  }
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    const segLen = Math.sqrt(len2);
    if (d < best) {
      best = d;
      bestT = (travelled + segLen * t) / (total || 1);
    }
    travelled += segLen;
  }
  return { distance: best, t: bestT };
}

/** A flat area: the terrain is blended to `height` within `radius` (+ `falloff`). */
export interface FlatArea {
  x: number;
  z: number;
  radius: number;
  falloff: number;
  /** Absolute height; if omitted, the natural height at the centre is used. */
  height?: number;
}

export interface DesertParams {
  kind: 'desert';
  seed: number;
  /** Large rolling base (m). */
  baseAmplitude: number;
  duneAmplitude: number;
  duneWavelength: number;
  /** Wind direction for dune crests (rad). */
  duneAngle: number;
  mesaHeight: number;
  /** Fraction of the map covered by mesas (higher = more). */
  mesaCoverage: number;
  canyon: PathDef & { width: number; depth: number };
  highway: PathDef & { width: number };
  flats: FlatArea[];
}

export interface ForestParams {
  kind: 'forest';
  seed: number;
  hillAmplitude: number;
  hillScale: number;
  river: PathDef & { width: number; depth: number };
  rail: PathDef & { width: number };
  /** Two-lane forest road from the city arrival westward. */
  road: PathDef & { width: number };
  flats: FlatArea[];
}

export type TerrainParams = DesertParams | ForestParams;

/** Builds the height function for a region. Returns metres above y = 0. */
export function createHeightFunction(params: TerrainParams): (x: number, z: number) => number {
  const noise = createNoise2D(params.seed);
  const noiseB = createNoise2D(params.seed + 101);

  /** Desert lowland without dunes or mesas: the level roads are built at. */
  const desertBase = params.kind === 'desert' ? (x: number, z: number) => 20 + fbm(noise, x / 700, z / 700, 4) * params.baseAmplitude : () => 0;

  const natural =
    params.kind === 'desert'
      ? (x: number, z: number) => {
          const base = desertBase(x, z);
          // Dunes: sharp crests perpendicular to the wind, wavelength wobbled by noise,
          // fading in and out across the map.
          const ca = Math.cos(params.duneAngle);
          const sa = Math.sin(params.duneAngle);
          const along = (x * ca + z * sa) / params.duneWavelength + noiseB(x / 260, z / 260) * 2.2;
          const crest = Math.pow(1 - Math.abs(Math.sin(along * Math.PI)), 2);
          const duneMask = smoothstep(-0.15, 0.35, noiseB(x / 520 + 7, z / 520 - 3));
          const dunes = crest * params.duneAmplitude * duneMask;
          // Mesas: flat-topped plateaus with steep, slightly stepped cliffs.
          const m = fbm(noise, x / 420 + 31, z / 420 - 17, 3);
          // Threshold from the measured distribution of this fBm (p80 ≈ 0.10, p95 ≈ 0.18),
          // so `mesaCoverage` ≈ the fraction of the map under mesas.
          const th = 0.21 - 0.57 * params.mesaCoverage;
          // Transition widths tuned so cliffs stay steep but span a few grid cells
          // (narrower ones alias into saw-teeth on the 4–9 m terrain grid).
          const mesa = params.mesaHeight * (0.65 * smoothstep(th, th + 0.022, m) + 0.35 * smoothstep(th + 0.035, th + 0.05, m));
          return base + Math.max(dunes * (1 - smoothstep(th - 0.05, th, m)), 0) + mesa;
        }
      : (x: number, z: number) => {
          const hills = 15 + fbm(noise, x / params.hillScale, z / params.hillScale, 5) * params.hillAmplitude;
          const detail = noiseB(x / 45, z / 45) * 1.5;
          return hills + detail;
        };

  // The canyon floor is one level below the lowland where it starts (ignoring any
  // mesa that happens to sit there), computed once.
  const canyonFloor = params.kind === 'desert' ? desertBase(params.canyon.points[0][0], params.canyon.points[0][1]) - params.canyon.depth : 0;

  // Carved channels and flattened bands, applied on top of the natural shape.
  return (x: number, z: number) => {
    let h = natural(x, z);
    if (params.kind === 'desert') {
      const c = distanceToPath(params.canyon, x, z);
      const floor = canyonFloor;
      // Steep walls with a narrow transition; flat floor.
      const k = 1 - smoothstep(params.canyon.width / 2, params.canyon.width / 2 + 18, c.distance);
      h = h + (Math.min(h, floor) - h) * k;
      // The highway cuts through dunes and mesas at lowland level rather than climbing them.
      h = flattenAlong(h, params.highway, x, z, desertBase);
    } else {
      const r = distanceToPath(params.river, x, z);
      const bed = natural(x, z) - params.river.depth;
      const k = 1 - smoothstep(params.river.width / 2, params.river.width / 2 + 14, r.distance);
      h = h + (bed - h) * k;
      h = flattenAlong(h, params.rail, x, z, natural);
      h = flattenAlong(h, params.road, x, z, natural);
    }
    for (const f of params.flats) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.radius + f.falloff) {
        const target = f.height ?? natural(f.x, f.z);
        h = h + (target - h) * (1 - smoothstep(f.radius, f.radius + f.falloff, d));
      }
    }
    return h;
  };
}

/** Blends terrain toward a smoothed level (sampled from `natural`) along a road/rail band. */
function flattenAlong(h: number, path: PathDef & { width: number }, x: number, z: number, natural: (x: number, z: number) => number) {
  const p = distanceToPath(path, x, z);
  const half = path.width / 2;
  if (p.distance > half + 16) return h;
  // Road level follows a heavily smoothed version of the terrain so it has gentle grades.
  let level = 0;
  for (const [ox, oz] of [
    [0, 0],
    [40, 0],
    [-40, 0],
    [0, 40],
    [0, -40],
  ]) {
    level += natural(x + ox, z + oz);
  }
  level /= 5;
  return h + (level - h) * (1 - smoothstep(half, half + 16, p.distance));
}

/** Samples a height function onto a (n+1)×(n+1) grid covering [-size/2, size/2]². Row = z, column = x. */
export function sampleGrid(height: (x: number, z: number) => number, size: number, cells: number): Float32Array {
  const n = cells + 1;
  const out = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    const z = -size / 2 + (iz / cells) * size;
    for (let ix = 0; ix < n; ix++) out[iz * n + ix] = height(-size / 2 + (ix / cells) * size, z);
  }
  return out;
}

/**
 * Height on the triangulated grid at (x, z) — exactly what Rapier's heightfield
 * and the terrain mesh use. Rapier splits each cell along the (x+1, z)–(x, z+1)
 * diagonal (verified against ray casts in tests/terrain.test.ts).
 */
export function gridHeightAt(grid: Float32Array, size: number, cells: number, x: number, z: number): number {
  const n = cells + 1;
  const fx = Math.min(cells - 1e-6, Math.max(0, ((x + size / 2) / size) * cells));
  const fz = Math.min(cells - 1e-6, Math.max(0, ((z + size / 2) / size) * cells));
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const u = fx - ix;
  const v = fz - iz;
  const h00 = grid[iz * n + ix];
  const h10 = grid[iz * n + ix + 1];
  const h01 = grid[(iz + 1) * n + ix];
  const h11 = grid[(iz + 1) * n + ix + 1];
  return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
}

/** Converts our row-major (row = z) grid to the column layout Rapier's heightfield expects. */
export function toRapierHeights(grid: Float32Array, cells: number): Float32Array {
  const n = cells + 1;
  const out = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) out[ix * n + iz] = grid[iz * n + ix];
  return out;
}
