import { SOLDIER, type SoldierRole } from '../../config/enemies';
import type { Vec3 } from '../combat/targets';

export type SoldierMode = 'idle' | 'approach' | 'windup' | 'recover' | 'stagger' | 'launched' | 'down' | 'out' | 'gone';

export interface Soldier {
  role: SoldierRole;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  health: number;
  mode: SoldierMode;
  /** Time left in the current mode. */
  timer: number;
  /** Seconds until the next attack may start. */
  cooldown: number;
  home: { x: number; z: number };
  /** Tumble angle while flying (rad). */
  tumble: number;
  frozen: number;
  /** Seconds since the last attack landed or missed (for the animation layer). */
  sinceAttack: number;
}

export type SoldierEvent =
  | { type: 'warn' }
  | { type: 'punch'; hit: boolean; amount: number; knock: Vec3 }
  | { type: 'shot'; hit: boolean; from: Vec3; amount: number }
  | { type: 'out' };

export interface SoldierContext {
  /** Hero feet position and horizontal speed. */
  hero: Vec3;
  heroSpeed: number;
  heroActive: boolean;
  groundY: (x: number, z: number) => number;
  /** Pushes a point out of buildings (city), or returns it unchanged. */
  resolve?: (x: number, z: number, radius: number) => { x: number; z: number };
  rand: () => number;
}

export function createSoldier(role: SoldierRole, x: number, z: number, groundY: (x: number, z: number) => number): Soldier {
  return { role, x, y: groundY(x, z), z, vx: 0, vy: 0, vz: 0, heading: 0, health: SOLDIER.health[role], mode: 'idle', timer: 0, cooldown: 1, home: { x, z }, tumble: 0, frozen: 0, sinceAttack: 99 };
}

export const soldierDown = (s: Soldier) => s.mode === 'out' || s.mode === 'gone';

/** Chest height above the feet (the hit sphere centre). */
export const SOLDIER_CHEST = 1.1;

/** A hit from the hero: staggers, sends flying, or knocks out. */
export function damageSoldier(s: Soldier, amount: number, knock: Vec3): SoldierEvent[] {
  if (soldierDown(s)) return [];
  s.health -= amount;
  // Men, not monsters: knocked back less far than the bosses, so fights stay close.
  knock = { x: knock.x * SOLDIER.knockScale, y: knock.y * SOLDIER.knockScale, z: knock.z * SOLDIER.knockScale };
  const strength = Math.hypot(knock.x, knock.y, knock.z);
  const out = s.health <= 0;
  if (out || strength >= SOLDIER.launchThreshold) {
    s.mode = 'launched';
    s.vx = knock.x;
    s.vy = Math.max(knock.y, out ? 7 : 5);
    s.vz = knock.z;
    s.timer = 0;
    if (out) s.health = 0;
  } else {
    // Staggered: the attack in progress is interrupted.
    s.mode = 'stagger';
    s.timer = SOLDIER.staggerTime;
    s.vx += knock.x * 0.6;
    s.vz += knock.z * 0.6;
  }
  return [];
}

export function freezeSoldier(s: Soldier, seconds: number) {
  if (soldierDown(s)) return;
  s.frozen = Math.min(SOLDIER.frozenMax, s.frozen + seconds);
}

function turnToward(s: Soldier, x: number, z: number, rate: number, dt: number) {
  const want = Math.atan2(x - s.x, z - s.z);
  const d = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading));
  s.heading += Math.max(-rate * dt, Math.min(rate * dt, d));
}

/** Advances one soldier by a fixed step. */
export function stepSoldier(s: Soldier, dt: number, ctx: SoldierContext): SoldierEvent[] {
  const ev: SoldierEvent[] = [];
  s.sinceAttack += dt;
  s.cooldown = Math.max(0, s.cooldown - dt);
  const ground = ctx.groundY(s.x, s.z);

  if (s.mode === 'gone') return ev;
  if (s.mode === 'out') {
    s.timer -= dt;
    if (s.timer <= 0) s.mode = 'gone';
    return ev;
  }

  // Airborne: thrown by a blow.
  if (s.mode === 'launched') {
    s.vy -= SOLDIER.gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.z += s.vz * dt;
    s.tumble += dt * 7;
    if (s.y <= ground && s.vy <= 0) {
      s.y = ground;
      s.vx = s.vy = s.vz = 0;
      if (s.health <= 0) {
        s.mode = 'out';
        s.timer = SOLDIER.outTime;
        ev.push({ type: 'out' });
      } else {
        s.mode = 'down';
        s.timer = SOLDIER.getUpTime;
      }
    }
    return ev;
  }

  s.y = ground;
  if (s.frozen > 0) {
    s.frozen -= dt;
    s.vx = s.vz = 0;
    if (s.mode === 'windup') s.mode = 'approach';
    return ev;
  }

  const hx = ctx.hero.x - s.x;
  const hz = ctx.hero.z - s.z;
  const dist = Math.hypot(hx, hz);

  switch (s.mode) {
    case 'down':
    case 'stagger':
    case 'recover':
      s.timer -= dt;
      s.vx *= 0.85;
      s.vz *= 0.85;
      if (s.timer <= 0) {
        s.mode = 'approach';
        s.tumble = 0;
      }
      break;
    case 'idle':
      s.vx *= 0.8;
      s.vz *= 0.8;
      if (ctx.heroActive && dist < SOLDIER.alertRange) s.mode = 'approach';
      break;
    case 'approach': {
      if (!ctx.heroActive || dist > SOLDIER.loseRange) {
        s.mode = 'idle';
        break;
      }
      turnToward(s, ctx.hero.x, ctx.hero.z, 6, dt);
      // Brutes close in; riflemen hold a firing distance.
      const want = s.role === 'brute' ? SOLDIER.meleeRange * 0.85 : dist < SOLDIER.rifleMin ? dist + 4 : dist > SOLDIER.rifleMax ? SOLDIER.rifleMax - 2 : dist;
      const gap = dist - want;
      const speed = Math.abs(gap) > 0.3 ? Math.min(Math.abs(gap) * 2, Math.abs(gap) > 8 ? SOLDIER.runSpeed : SOLDIER.walkSpeed * 1.6) * Math.sign(gap) : 0;
      const k = Math.min(1, 6 * dt);
      s.vx += ((hx / (dist || 1)) * speed - s.vx) * k;
      s.vz += ((hz / (dist || 1)) * speed - s.vz) * k;
      const inRange = s.role === 'brute' ? dist < SOLDIER.meleeRange + 0.4 : dist >= SOLDIER.rifleMin - 3 && dist <= SOLDIER.rifleMax + 4;
      if (inRange && s.cooldown <= 0 && ctx.heroActive) {
        s.mode = 'windup';
        s.timer = SOLDIER.windup[s.role];
        ev.push({ type: 'warn' });
      }
      break;
    }
    case 'windup':
      turnToward(s, ctx.hero.x, ctx.hero.z, 8, dt);
      s.vx *= 0.7;
      s.vz *= 0.7;
      s.timer -= dt;
      if (s.timer <= 0) {
        const [lo, hi] = SOLDIER.cooldown[s.role];
        s.cooldown = lo + ctx.rand() * (hi - lo);
        s.sinceAttack = 0;
        s.mode = 'recover';
        s.timer = 0.35;
        if (s.role === 'brute') {
          const hit = dist < SOLDIER.meleeRange + 0.6 && ctx.heroActive;
          const len = dist || 1;
          ev.push({ type: 'punch', hit, amount: SOLDIER.punchDamage, knock: { x: (hx / len) * SOLDIER.punchKnock, y: 3, z: (hz / len) * SOLDIER.punchKnock } });
        } else {
          const hit = ctx.heroActive && ctx.heroSpeed < SOLDIER.shotDodgeSpeed && ctx.rand() < SOLDIER.shotHitChance;
          ev.push({ type: 'shot', hit, from: { x: s.x, y: s.y + 1.4, z: s.z }, amount: SOLDIER.shotDamage });
        }
      }
      break;
  }

  s.x += s.vx * dt;
  s.z += s.vz * dt;
  if (ctx.resolve) {
    const p = ctx.resolve(s.x, s.z, SOLDIER.radius);
    s.x = p.x;
    s.z = p.z;
  }
  return ev;
}

/** Keeps a squad from standing inside each other. */
export function separate(list: Soldier[]) {
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (soldierDown(a) || a.mode === 'launched') continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (soldierDown(b) || b.mode === 'launched') continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= SOLDIER.spacing || d < 1e-4) continue;
      const push = (SOLDIER.spacing - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
}
