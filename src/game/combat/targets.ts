/**
 * Things the hero can hit, plus the pure geometry used to pick them (ray for
 * heat vision, cone for punches). Enemies register themselves while alive.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Target {
  /** Centre of the hit sphere. */
  position: Vec3;
  radius: number;
  alive: boolean;
  /** `knock` is an impulse (m/s) added to the target's velocity. */
  damage: (amount: number, knock: Vec3) => void;
}

/** Live targets in the mounted region. */
export const targets = new Set<Target>();

/** Distance along a normalised ray to a sphere's surface, or null if missed. */
export function raySphere(origin: Vec3, dir: Vec3, centre: Vec3, radius: number): number | null {
  const ox = origin.x - centre.x;
  const oy = origin.y - centre.y;
  const oz = origin.z - centre.z;
  const b = ox * dir.x + oy * dir.y + oz * dir.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = -b - s >= 0 ? -b - s : -b + s;
  return t >= 0 ? t : null;
}

/**
 * The target a ray hits first within `maxDistance`. If none is hit exactly,
 * the target closest in angle within `assistAngle` (aim assist). Returns the
 * distance along the ray to the hit (or to the assisted target's centre).
 */
export function pickAlongRay(origin: Vec3, dir: Vec3, maxDistance: number, assistAngle: number, candidates: Iterable<Target>) {
  let best: { target: Target; distance: number } | null = null;
  let assist: { target: Target; distance: number; angle: number } | null = null;
  for (const t of candidates) {
    if (!t.alive) continue;
    const d = raySphere(origin, dir, t.position, t.radius);
    if (d !== null && d <= maxDistance) {
      if (!best || d < best.distance) best = { target: t, distance: d };
      continue;
    }
    const tx = t.position.x - origin.x;
    const ty = t.position.y - origin.y;
    const tz = t.position.z - origin.z;
    const len = Math.hypot(tx, ty, tz);
    if (len === 0 || len > maxDistance) continue;
    const angle = Math.acos(Math.min(1, (tx * dir.x + ty * dir.y + tz * dir.z) / len));
    if (angle <= assistAngle && (!assist || angle < assist.angle)) assist = { target: t, distance: len, angle };
  }
  return best ?? (assist ? { target: assist.target, distance: assist.distance } : null);
}

/** Targets within `range` of `origin` and within `halfAngle` of the horizontal-or-3D `forward` direction. */
export function inCone(origin: Vec3, forward: Vec3, range: number, halfAngle: number, candidates: Iterable<Target>): Target[] {
  const out: Target[] = [];
  const cosMax = Math.cos(halfAngle);
  for (const t of candidates) {
    if (!t.alive) continue;
    const dx = t.position.x - origin.x;
    const dy = t.position.y - origin.y;
    const dz = t.position.z - origin.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist - t.radius > range) continue;
    // Point-blank targets count regardless of angle.
    if (dist < t.radius + 0.5 || (dx * forward.x + dy * forward.y + dz * forward.z) / dist >= cosMax) out.push(t);
  }
  return out;
}
