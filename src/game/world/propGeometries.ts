import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  type ColorRepresentation,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise2D, distanceToPath, type PathDef } from './terrainNoise';

/**
 * Procedural low-poly prop geometry (original, no external assets). Each prop
 * carries vertex colours (e.g. brown trunk + green leaves) so it renders as a
 * single instanced mesh; per-instance colour tints add variety.
 */

/** Strips UVs, adds a flat vertex colour, and moves the geometry. */
export function part(g: BufferGeometry, color: ColorRepresentation, x = 0, y = 0, z = 0): BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  geo.deleteAttribute('uv');
  geo.translate(x, y, z);
  const c = new Color(color);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(col, 3));
  return geo;
}

export function merged(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('mergeGeometries failed');
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Faceted boulder, ~1 m radius, base near y = 0. */
export function rockGeometry(seed: number): BufferGeometry {
  const noise = createNoise2D(seed);
  const g = new IcosahedronGeometry(1, 1).toNonIndexed();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = 1 + noise(x * 1.7 + 3, z * 1.7 + y) * 0.35;
    pos.setXYZ(i, x * k * 1.15, y * k * 0.7, z * k);
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  return part(g, '#ffffff');
}

/** Saguaro-style cactus, ~5 m tall. */
export function cactusGeometry(): BufferGeometry {
  const green = '#4f7a3a';
  return merged([
    part(new CylinderGeometry(0.32, 0.38, 5, 7), green, 0, 2.5, 0),
    part(new CylinderGeometry(0.2, 0.22, 1.1, 6).rotateZ(Math.PI / 2), green, 0.75, 2.1, 0),
    part(new CylinderGeometry(0.2, 0.2, 1.6, 6), green, 1.3, 2.85, 0),
    part(new CylinderGeometry(0.18, 0.2, 0.9, 6).rotateZ(Math.PI / 2), green, -0.6, 2.9, 0),
    part(new CylinderGeometry(0.18, 0.18, 1.2, 6), green, -1.05, 3.4, 0),
  ]);
}

/** Low scrubby bush. */
export function bushGeometry(): BufferGeometry {
  return merged([part(new IcosahedronGeometry(0.9, 0).scale(1.3, 0.6, 1.1), '#8a7a4a', 0, 0.35, 0)]);
}

/** Conifer: trunk + three stacked cones, ~11 m tall. */
export function coniferGeometry(): BufferGeometry {
  const leaf = '#2f5a2a';
  return merged([
    part(new CylinderGeometry(0.22, 0.32, 3, 6), '#5a3d24', 0, 1.5, 0),
    part(new ConeGeometry(2.6, 4.2, 8), leaf, 0, 4.2, 0),
    part(new ConeGeometry(2.0, 3.6, 8), '#335f2d', 0, 6.4, 0),
    part(new ConeGeometry(1.3, 3.0, 8), '#3a6831', 0, 8.6, 0),
  ]);
}

/** Broadleaf tree: trunk + three leafy blobs, ~9 m tall. */
export function broadleafGeometry(): BufferGeometry {
  return merged([
    part(new CylinderGeometry(0.25, 0.38, 4, 6), '#5c4128', 0, 2, 0),
    part(new IcosahedronGeometry(2.4, 0), '#4a7a32', 0, 5.6, 0),
    part(new IcosahedronGeometry(1.8, 0), '#58893a', 1.4, 6.6, 0.5),
    part(new IcosahedronGeometry(1.7, 0), '#43712d', -1.2, 6.4, -0.6),
  ]);
}

/**
 * A ground-hugging ribbon along a path (road, river surface, rail bed).
 * `heightAt(x, z)` gives the surface height; `yOffset` lifts it slightly to avoid z-fighting.
 */
export function ribbonGeometry(path: PathDef, width: number, heightAt: (x: number, z: number) => number, yOffset: number, step = 6, flatAcross = false) {
  const pts = path.points;
  const centres: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    const segs = Math.max(1, Math.ceil(len / step));
    for (let s = 0; s < segs || (i === pts.length - 1 && s === segs); s++) {
      const t = s / segs;
      centres.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  }
  // Direction from the neighbouring samples, so the strip bends smoothly at corners
  // instead of folding over on the inside of a turn.
  const samples: [number, number, number, number][] = centres.map(([x, z], i) => {
    const [px, pz] = centres[Math.max(0, i - 1)];
    const [nx, nz] = centres[Math.min(centres.length - 1, i + 1)];
    const len = Math.hypot(nx - px, nz - pz) || 1;
    return [x, z, (nx - px) / len, (nz - pz) / len];
  });
  const pos = new Float32Array(samples.length * 2 * 3);
  const index: number[] = [];
  samples.forEach(([x, z, dx, dz], i) => {
    // Perpendicular (left/right) of the travel direction.
    const px = -dz * (width / 2);
    const pz = dx * (width / 2);
    const centre = heightAt(x, z);
    const yl = flatAcross ? centre : heightAt(x + px, z + pz);
    const yr = flatAcross ? centre : heightAt(x - px, z - pz);
    pos.set([x + px, yl + yOffset, z + pz, x - px, yr + yOffset, z - pz], i * 6);
    if (i > 0) {
      // Wound so the surface faces up (+Y); the other order is culled when seen from above.
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Evenly spaced points along a path with their direction, for posts, dashes and sleepers. */
export function pointsAlong(path: PathDef, spacing: number): { x: number; z: number; angle: number }[] {
  const out: { x: number; z: number; angle: number }[] = [];
  const pts = path.points;
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = carry; d < len; d += spacing) {
      const t = d / len;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, angle: Math.atan2(bx - ax, bz - az) });
    }
    carry = (carry - len) % spacing;
    if (carry < 0) carry += spacing;
  }
  return out;
}

/** Deterministic scatter: tries random spots and keeps those `accept` approves. */
export function scatter(rand: () => number, size: number, count: number, accept: (x: number, z: number) => boolean, maxTries = count * 12) {
  const out: [number, number][] = [];
  for (let tries = 0; tries < maxTries && out.length < count; tries++) {
    const x = (rand() - 0.5) * size;
    const z = (rand() - 0.5) * size;
    if (accept(x, z)) out.push([x, z]);
  }
  return out;
}

/** True if (x, z) is within `margin` of the path. */
export function nearPath(path: PathDef, x: number, z: number, margin: number) {
  return distanceToPath(path, x, z).distance < margin;
}
