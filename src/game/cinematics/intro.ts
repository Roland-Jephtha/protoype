/**
 * Mission intro camera: three shots built from the mission's focus point and
 * the hero's start — an aerial sweep over the area, a low push-in on what's
 * waiting there, then a reveal that settles behind the hero. Pure, so it is
 * unit-tested without three.js.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Shot {
  from: V3;
  to: V3;
  lookFrom: V3;
  lookTo: V3;
  duration: number;
}

export const INTRO_SHOTS = { aerial: 5, pushIn: 4, reveal: 3.5 };

export function buildIntro(focus: { x: number; z: number }, start: { x: number; z: number; facing: number }, ground: (x: number, z: number) => number): Shot[] {
  const fy = ground(focus.x, focus.z);
  const sy = ground(start.x, start.z);
  // Direction from the hero's start toward the focus (used for the push-in).
  let dx = focus.x - start.x;
  let dz = focus.z - start.z;
  const len = Math.hypot(dx, dz) || 1;
  dx /= len;
  dz /= len;
  const orbit = (a: number, r: number, h: number): V3 => ({ x: focus.x + Math.sin(a) * r, y: fy + h, z: focus.z + Math.cos(a) * r });
  const a0 = Math.atan2(-dx, -dz);
  const fwdX = Math.sin(start.facing);
  const fwdZ = Math.cos(start.facing);
  const at = (x: number, z: number, h: number): V3 => ({ x, y: ground(x, z) + h, z });
  return [
    // 1. Aerial sweep over the area.
    { from: orbit(a0 - 0.6, 150, 75), to: orbit(a0 + 0.4, 120, 55), lookFrom: { x: focus.x, y: fy + 2, z: focus.z }, lookTo: { x: focus.x, y: fy + 2, z: focus.z }, duration: INTRO_SHOTS.aerial },
    // 2. Low push-in on whatever waits there.
    { from: at(focus.x - dx * 45, focus.z - dz * 45, 3), to: at(focus.x - dx * 14, focus.z - dz * 14, 2.4), lookFrom: { x: focus.x, y: fy + 2.2, z: focus.z }, lookTo: { x: focus.x, y: fy + 1.8, z: focus.z }, duration: INTRO_SHOTS.pushIn },
    // 3. The hero: from in front of him, round to the gameplay view behind him.
    {
      from: at(start.x + fwdX * 10, start.z + fwdZ * 10, 2.2),
      to: at(start.x - fwdX * 6, start.z - fwdZ * 6, 2.6),
      lookFrom: { x: start.x, y: sy + 1.5, z: start.z },
      lookTo: { x: start.x + fwdX * 10, y: sy + 1.5, z: start.z + fwdZ * 10 },
      duration: INTRO_SHOTS.reveal,
    },
  ];
}

export const introLength = (shots: Shot[]) => shots.reduce((a, s) => a + s.duration, 0);

const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: V3, b: V3, t: number, out: V3) => {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
};

/** Camera position and look-at point `t` seconds into the intro. */
export function sampleIntro(shots: Shot[], t: number, pos: V3, look: V3) {
  let rest = t;
  for (const s of shots) {
    if (rest <= s.duration) {
      const k = ease(Math.max(0, rest / s.duration));
      lerp(s.from, s.to, k, pos);
      lerp(s.lookFrom, s.lookTo, k, look);
      return;
    }
    rest -= s.duration;
  }
  const last = shots[shots.length - 1];
  pos.x = last.to.x;
  pos.y = last.to.y;
  pos.z = last.to.z;
  look.x = last.lookTo.x;
  look.y = last.lookTo.y;
  look.z = last.lookTo.z;
}
