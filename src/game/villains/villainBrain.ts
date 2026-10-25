import { BOSS_FIGHT, VILLAIN_AI, type VillainDef, type VillainPower } from '../../config/villains';
import type { Vec3 } from '../combat/targets';

export type VillainMode = 'dormant' | 'engage' | 'enrage' | 'windup' | 'charge' | 'leap' | 'beam' | 'breath' | 'launched' | 'downed' | 'defeated' | 'gone';

export interface Villain {
  def: VillainDef;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  heading: number;
  health: number;
  mode: VillainMode;
  /** Time left in the current mode (windup, beam, downed, defeated...). */
  timer: number;
  /** Airborne by flight (fliers only). */
  flying: boolean;
  cooldowns: Record<VillainPower, number>;
  /** Seconds before another special move may start. */
  specialGap: number;
  /** The power being wound up. */
  pending: VillainPower | null;
  punch: { side: 'left' | 'right'; t: number; hit: boolean } | null;
  /** Heat beam / breath aim point. */
  aim: Vec3;
  /** Charge direction and distance left. */
  charge: { x: number; y: number; z: number; left: number; hit: boolean };
  /** Freeze breath already landed this breath. */
  breathHit: boolean;
  home: { x: number; z: number };
  sinceHit: number;
  /** Tumble angle while launched (rad). */
  tumble: number;
  /** Seconds left frozen in ice (can't act; fliers drop). */
  frozen: number;
  /** Boss phase: 2 below half health (faster, more moves). */
  phase: 1 | 2;
  /** The phase-2 roar's shockwave has gone off. */
  roared: boolean;
  /** Seconds left flinching from a hit. */
  flinch: number;
  /** Punches left in a flurry. */
  flurry: number;
}

export type VillainEvent =
  | { type: 'hitHero'; amount: number; knock: Vec3 | null; controlLoss: number }
  | { type: 'freezeHero'; seconds: number }
  | { type: 'omega'; from: Vec3; count: number }
  | { type: 'shockwave'; x: number; y: number; z: number; radius: number }
  | { type: 'engaged' }
  | { type: 'launched' }
  /** Dropped to half health: roars into phase 2. */
  | { type: 'enraged' }
  | { type: 'defeated' };

export interface VillainContext {
  /** Hero feet position. */
  hero: Vec3;
  heroActive: boolean;
  groundY: (x: number, z: number) => number;
  rand: () => number;
}

const AI = VILLAIN_AI;
const HERO_CHEST = 1.2;
const POWERS: VillainPower[] = ['punch', 'charge', 'slam', 'heatBeam', 'omegaBeams', 'freezeBreath', 'flurry'];

export function createVillain(def: VillainDef, x: number, z: number, groundY: (x: number, z: number) => number): Villain {
  return {
    def,
    x,
    y: groundY(x, z),
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    health: def.health,
    mode: 'dormant',
    timer: 0,
    flying: false,
    cooldowns: Object.fromEntries(POWERS.map((p, i) => [p, 1.5 + i * 0.4])) as Record<VillainPower, number>,
    specialGap: 2,
    pending: null,
    punch: null,
    aim: { x, y: 0, z },
    charge: { x: 0, y: 0, z: 0, left: 0, hit: false },
    breathHit: false,
    home: { x, z },
    sinceHit: 99,
    tumble: 0,
    frozen: 0,
    phase: 1,
    roared: false,
    flinch: 0,
    flurry: 0,
  };
}

/** Phase-2 scaling: 1 in phase 1. */
const phaseScale = (v: Villain, k: number) => (v.phase === 2 ? k : 1);

/** Centre of the villain's body (hit sphere centre). */
export function villainCentre(v: Villain, out: Vec3) {
  out.x = v.x;
  out.y = v.y + v.def.heightMeters * 0.55;
  out.z = v.z;
  return out;
}

const alive = (v: Villain) => v.mode !== 'defeated' && v.mode !== 'gone';

function turnToward(v: Villain, tx: number, tz: number, rate: number, dt: number) {
  const want = Math.atan2(tx - v.x, tz - v.z);
  let d = want - v.heading;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  v.heading += Math.max(-rate * dt, Math.min(rate * dt, d));
}

/** Moves toward a point at up to `speed` with smooth acceleration (horizontal; fliers also vertical). */
function moveToward(v: Villain, tx: number, ty: number, tz: number, speed: number, dt: number, fly: boolean) {
  const dx = tx - v.x;
  const dy = fly ? ty - v.y : 0;
  const dz = tz - v.z;
  const d = Math.hypot(dx, dy, dz) || 1;
  const want = Math.min(speed, d * 2);
  const k = Math.min(1, 4 * dt);
  v.vx += ((dx / d) * want - v.vx) * k;
  v.vz += ((dz / d) * want - v.vz) * k;
  if (fly) v.vy += ((dy / d) * want - v.vy) * k;
}

/** Encases the villain in ice for a while (stacks up to a cap). */
export function freezeVillain(v: Villain, seconds: number, max: number): VillainEvent[] {
  if (!alive(v)) return [];
  v.frozen = Math.min(max, v.frozen + seconds);
  if (v.mode === 'dormant') {
    v.mode = 'engage';
    return [{ type: 'engaged' }];
  }
  return [];
}

/** Applies a hit from the hero. Returns events (launched / defeated). */
export function damageVillain(v: Villain, amount: number, knock: Vec3): VillainEvent[] {
  if (!alive(v) || v.mode === 'enrage') return [];
  const events: VillainEvent[] = [];
  if (v.mode === 'dormant') {
    v.mode = 'engage';
    events.push({ type: 'engaged' });
  }
  v.health -= amount * v.def.toughness;
  v.sinceHit = 0;
  const strength = Math.hypot(knock.x, knock.y, knock.z);
  const threshold = v.def.health * BOSS_FIGHT.phaseAt;
  if (v.phase === 1 && v.health <= threshold) {
    // Half health: roar into phase 2 (no single blow skips it).
    v.health = threshold;
    v.phase = 2;
    v.mode = 'enrage';
    v.timer = BOSS_FIGHT.enrageTime;
    v.roared = false;
    v.vx = 0;
    v.vz = 0;
    v.vy = v.flying ? 0 : v.vy;
    v.punch = null;
    v.pending = null;
    v.flurry = 0;
    v.frozen = 0;
    v.tumble = 0;
    events.push({ type: 'enraged' });
  } else if (v.health <= 0) {
    v.health = 0;
    v.mode = 'defeated';
    v.timer = AI.defeatedLie;
    v.vx = knock.x;
    v.vy = Math.max(knock.y, 8);
    v.vz = knock.z;
    v.flying = false;
    v.punch = null;
    events.push({ type: 'defeated' });
  } else if (strength >= v.def.launchThreshold) {
    // Sent flying.
    v.mode = 'launched';
    v.timer = 0;
    v.vx = knock.x;
    v.vy = Math.max(knock.y, 6);
    v.vz = knock.z;
    v.flying = false;
    v.punch = null;
    v.pending = null;
    events.push({ type: 'launched' });
  } else {
    // Staggered: flinches (cancelling its punch) unless mid special move.
    v.vx += knock.x * 0.5;
    v.vz += knock.z * 0.5;
    if (v.flying) v.vy += knock.y * 0.5;
    if (v.mode === 'engage') {
      v.flinch = VILLAIN_AI.flinchTime * phaseScale(v, BOSS_FIGHT.flinch);
      v.punch = null;
    }
  }
  return events;
}

function startSpecial(v: Villain, power: VillainPower) {
  v.mode = 'windup';
  v.pending = power;
  v.timer = AI.windup * phaseScale(v, BOSS_FIGHT.windup);
  v.vx *= 0.3;
  v.vz *= 0.3;
}

/** Ballistic launch toward a target, arriving after `t` seconds. */
function leapTo(v: Villain, tx: number, ty: number, tz: number, t: number) {
  v.vx = (tx - v.x) / t;
  v.vz = (tz - v.z) / t;
  v.vy = (ty - v.y + 0.5 * AI.gravity * t * t) / t;
  v.mode = 'leap';
}

/** Advances one villain by a fixed step. */
export function stepVillain(v: Villain, dt: number, ctx: VillainContext): VillainEvent[] {
  const events: VillainEvent[] = [];
  const def = v.def;
  const ground = ctx.groundY(v.x, v.z);
  v.sinceHit += dt;
  v.flinch = Math.max(0, v.flinch - dt);
  for (const p of POWERS) v.cooldowns[p] = Math.max(0, v.cooldowns[p] - dt);
  v.specialGap = Math.max(0, v.specialGap - dt);

  if (v.mode === 'gone') {
    v.timer -= dt;
    if (v.timer <= 0) Object.assign(v, createVillain(def, v.home.x, v.home.z, ctx.groundY));
    return events;
  }

  // Regeneration (not once beaten).
  if (alive(v)) v.health = Math.min(def.health, v.health + def.regen * dt);

  // Frozen in ice: no actions; a flier drops to the ground.
  if (v.frozen > 0 && alive(v) && v.mode !== 'launched' && v.mode !== 'leap') {
    v.frozen -= dt;
    v.punch = null;
    v.pending = null;
    if (v.mode === 'windup' || v.mode === 'beam' || v.mode === 'breath' || v.mode === 'charge' || v.mode === 'dormant') v.mode = 'engage';
    v.vx = 0;
    v.vz = 0;
    if (v.flying || v.y > ground + 0.05) {
      v.vy -= AI.gravity * dt;
      v.y = Math.max(ground, v.y + v.vy * dt);
      if (v.y <= ground) {
        v.flying = false;
        v.vy = 0;
      }
    }
    return events;
  }

  const hx = ctx.hero.x - v.x;
  const hz = ctx.hero.z - v.z;
  const hy = ctx.hero.y + HERO_CHEST - (v.y + def.heightMeters * 0.55);
  const heroFlat = Math.hypot(hx, hz);
  const heroDist = Math.hypot(hx, hy, hz);
  const heroAboveGround = ctx.hero.y - ctx.groundY(ctx.hero.x, ctx.hero.z);

  // --- airborne without control: launched, defeated, leaping -------------------------
  const ballistic = v.mode === 'launched' || v.mode === 'defeated' || v.mode === 'leap';
  if (ballistic) {
    v.vy -= AI.gravity * dt;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.z += v.vz * dt;
    if (v.mode !== 'leap') v.tumble += dt * 6;
    // A flier recovers in mid-air after a moment.
    if (v.mode === 'launched' && def.canFly) {
      v.timer += dt;
      if (v.timer > 0.8) {
        v.mode = 'engage';
        v.flying = true;
        v.tumble = 0;
      }
    }
    // A leaping brute grabs a hero it reaches in mid-air.
    if (v.mode === 'leap' && heroDist < def.radius + 1.6 && ctx.heroActive) {
      const len = heroFlat || 1;
      events.push({ type: 'hitHero', amount: AI.chargeDamage, knock: { x: (hx / len) * AI.chargeKnock, y: -6, z: (hz / len) * AI.chargeKnock }, controlLoss: 0.8 });
      v.vx *= 0.3;
      v.vz *= 0.3;
    }
    const floor = ctx.groundY(v.x, v.z);
    if (v.y <= floor && v.vy <= 0) {
      v.y = floor;
      if (v.mode === 'leap') {
        events.push({ type: 'shockwave', x: v.x, y: floor, z: v.z, radius: AI.slamRadius });
        const d = Math.hypot(ctx.hero.x - v.x, ctx.hero.z - v.z);
        if (ctx.heroActive && d < AI.slamRadius && heroAboveGround < 3) {
          const k = 1 - (d / AI.slamRadius) * 0.5;
          const len = d || 1;
          events.push({ type: 'hitHero', amount: AI.slamDamage * k, knock: { x: ((ctx.hero.x - v.x) / len) * AI.slamKnock * k, y: 10 * k, z: ((ctx.hero.z - v.z) / len) * AI.slamKnock * k }, controlLoss: 0.9 });
        }
        v.mode = 'engage';
      } else if (v.mode === 'launched') {
        v.mode = 'downed';
        v.timer = AI.getUpTime;
      }
      v.vx = 0;
      v.vy = 0;
      v.vz = 0;
    }
    if (v.mode === 'defeated') {
      v.timer -= dt;
      if (v.timer <= 0) {
        v.mode = 'gone';
        v.timer = AI.respawn;
      }
    }
    return events;
  }

  // Phase-2 roar: plants its feet; halfway through, a shockwave throws the hero back.
  if (v.mode === 'enrage') {
    v.timer -= dt;
    turnToward(v, ctx.hero.x, ctx.hero.z, 4, dt);
    if (!v.flying) v.y = ground;
    if (!v.roared && v.timer <= BOSS_FIGHT.enrageTime * 0.5) {
      v.roared = true;
      events.push({ type: 'shockwave', x: v.x, y: v.y, z: v.z, radius: BOSS_FIGHT.enrageRadius });
      if (ctx.heroActive && heroDist < BOSS_FIGHT.enrageRadius) {
        const len = heroFlat || 1;
        events.push({ type: 'hitHero', amount: BOSS_FIGHT.enrageDamage, knock: { x: (hx / len) * BOSS_FIGHT.enrageKnock, y: 9, z: (hz / len) * BOSS_FIGHT.enrageKnock }, controlLoss: 0.7 });
      }
    }
    if (v.timer <= 0) {
      v.mode = 'engage';
      v.specialGap = 0.4;
    }
    return events;
  }

  if (v.mode === 'downed') {
    v.timer -= dt;
    v.y = ground;
    if (v.timer <= 0) {
      v.mode = 'engage';
      v.tumble = 0;
    }
    return events;
  }

  // --- dormant: wait at the lair; head home if away -----------------------------------
  if (v.mode === 'dormant') {
    if (ctx.heroActive && heroDist < def.aggroRange) {
      v.mode = 'engage';
      events.push({ type: 'engaged' });
    } else {
      const dHome = Math.hypot(v.home.x - v.x, v.home.z - v.z);
      if (dHome > 2) {
        moveToward(v, v.home.x, ground, v.home.z, def.canFly ? def.flySpeed * 0.6 : def.walkSpeed * 2, dt, false);
        turnToward(v, v.home.x, v.home.z, 3, dt);
      } else {
        v.vx *= 0.8;
        v.vz *= 0.8;
      }
      v.flying = false;
      v.vy = 0;
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.y = ctx.groundY(v.x, v.z);
      return events;
    }
  }

  // Lost the hero: back to the lair.
  if (!ctx.heroActive || heroDist > def.aggroRange * 2.5) {
    v.mode = 'dormant';
    v.pending = null;
    v.punch = null;
    return events;
  }

  // --- punch in progress (any mode) -----------------------------------------------------
  if (v.punch) {
    v.punch.t += dt;
    if (!v.punch.hit && v.punch.t >= 0.14) {
      v.punch.hit = true;
      if (heroDist < AI.punchRange + def.radius + 0.4) {
        const len = heroFlat || 1;
        events.push({ type: 'hitHero', amount: AI.punchDamage, knock: { x: (hx / len) * AI.punchKnock, y: 4, z: (hz / len) * AI.punchKnock }, controlLoss: 0.45 });
      }
    }
    if (v.punch.t >= 0.4) {
      v.punch = null;
      // A flurry throws the next punch straight away, alternating fists.
      if (v.flurry > 0 && v.mode === 'engage' && v.flinch <= 0) {
        v.flurry--;
        v.punch = { side: v.flurry % 2 ? 'left' : 'right', t: 0.12, hit: false };
      }
    }
  }

  if (v.mode === 'windup') {
    turnToward(v, ctx.hero.x, ctx.hero.z, 6, dt);
    v.timer -= dt;
    v.aim = { x: ctx.hero.x, y: ctx.hero.y + HERO_CHEST, z: ctx.hero.z };
    if (v.timer <= 0) {
      const p = v.pending;
      v.pending = null;
      const cd = p === 'charge' ? AI.chargeCooldown : p === 'slam' ? AI.slamCooldown : p === 'heatBeam' ? AI.beamCooldown : p === 'omegaBeams' ? AI.omegaCooldown : p === 'flurry' ? AI.flurryCooldown : AI.freezeCooldown;
      v.cooldowns[p ?? 'punch'] = cd * phaseScale(v, BOSS_FIGHT.cooldown);
      v.specialGap = 1.5 * phaseScale(v, BOSS_FIGHT.cooldown);
      if (p === 'charge') {
        const tx = hx;
        const ty = def.canFly ? hy : 0;
        const tz = hz;
        const len = Math.hypot(tx, ty, tz) || 1;
        v.charge = { x: tx / len, y: ty / len, z: tz / len, left: len + 6, hit: false };
        v.mode = 'charge';
      } else if (p === 'slam') {
        const t = Math.max(0.8, Math.min(1.6, heroFlat / 22));
        leapTo(v, ctx.hero.x, Math.max(ctx.hero.y, ctx.groundY(ctx.hero.x, ctx.hero.z)), ctx.hero.z, t);
      } else if (p === 'heatBeam') {
        v.mode = 'beam';
        v.timer = AI.beamDuration;
      } else if (p === 'freezeBreath') {
        v.mode = 'breath';
        v.timer = 1.4;
        v.breathHit = false;
      } else if (p === 'omegaBeams') {
        events.push({ type: 'omega', from: { x: v.x, y: v.y + def.heightMeters * 0.9, z: v.z }, count: AI.omegaCount * phaseScale(v, BOSS_FIGHT.omegaMultiplier) });
        v.mode = 'engage';
      } else if (p === 'flurry') {
        v.flurry = AI.flurryPunches;
        v.mode = 'engage';
      } else {
        v.mode = 'engage';
      }
    }
  } else if (v.mode === 'charge') {
    const step = AI.chargeSpeed * dt;
    v.vx = v.charge.x * AI.chargeSpeed;
    v.vy = v.charge.y * AI.chargeSpeed;
    v.vz = v.charge.z * AI.chargeSpeed;
    v.charge.left -= step;
    turnToward(v, v.x + v.charge.x, v.z + v.charge.z, 10, dt);
    if (!v.charge.hit && heroDist < def.radius + 1.3) {
      v.charge.hit = true;
      events.push({ type: 'hitHero', amount: AI.chargeDamage, knock: { x: v.charge.x * AI.chargeKnock, y: 8, z: v.charge.z * AI.chargeKnock }, controlLoss: 0.8 });
      v.charge.left = Math.min(v.charge.left, 3);
    }
    if (v.charge.left <= 0) {
      v.mode = 'engage';
      v.vx *= 0.2;
      v.vy *= 0.2;
      v.vz *= 0.2;
    }
  } else if (v.mode === 'beam' || v.mode === 'breath') {
    turnToward(v, ctx.hero.x, ctx.hero.z, v.mode === 'beam' ? 2.5 : 4, dt);
    // The aim trails the hero: keep moving to dodge it.
    const k = Math.min(1, (v.mode === 'beam' ? 2.2 : 4) * dt);
    v.aim.x += (ctx.hero.x - v.aim.x) * k;
    v.aim.y += (ctx.hero.y + HERO_CHEST - v.aim.y) * k;
    v.aim.z += (ctx.hero.z - v.aim.z) * k;
    v.vx *= 0.9;
    v.vz *= 0.9;
    if (v.flying) v.vy *= 0.9;
    const onTarget = Math.hypot(v.aim.x - ctx.hero.x, v.aim.y - (ctx.hero.y + HERO_CHEST), v.aim.z - ctx.hero.z) < 1.4;
    if (v.mode === 'beam') {
      if (onTarget && heroDist < AI.beamRange) events.push({ type: 'hitHero', amount: AI.beamDps * dt, knock: null, controlLoss: 0 });
    } else if (!v.breathHit && heroDist < AI.freezeRange) {
      const fx = Math.sin(v.heading);
      const fz = Math.cos(v.heading);
      if ((hx * fx + hz * fz) / (heroFlat || 1) > Math.cos(0.4)) {
        v.breathHit = true;
        events.push({ type: 'freezeHero', seconds: AI.freezeDuration });
        events.push({ type: 'hitHero', amount: 6, knock: null, controlLoss: 0 });
      }
    }
    v.timer -= dt;
    if (v.timer <= 0) v.mode = 'engage';
  } else {
    // --- engage: pick a move, close in --------------------------------------------------
    turnToward(v, ctx.hero.x, ctx.hero.z, 5, dt);
    const reach = AI.punchRange + def.radius;
    const fast = phaseScale(v, BOSS_FIGHT.speed);
    if (v.flinch > 0) {
      // Reeling from a hit.
    } else if (v.flurry > 0 && !v.punch && heroDist < reach) {
      v.flurry--;
      v.punch = { side: v.flurry % 2 ? 'left' : 'right', t: 0, hit: false };
    } else if (!v.punch && heroDist < reach && v.cooldowns.punch <= 0) {
      v.punch = { side: ctx.rand() < 0.5 ? 'left' : 'right', t: 0, hit: false };
      v.cooldowns.punch = AI.punchCooldown * phaseScale(v, BOSS_FIGHT.cooldown);
    } else if (v.specialGap <= 0 && v.flurry <= 0) {
      const options: VillainPower[] = [];
      const has = (p: VillainPower) => (def.powers.includes(p) || (v.phase === 2 && def.phase2.powers.includes(p))) && v.cooldowns[p] <= 0;
      if (has('charge') && heroDist > 8 && heroDist < AI.chargeRange) options.push('charge');
      if (has('slam') && !def.canFly && (heroFlat < 30 || (heroAboveGround > 4 && heroFlat < 45))) options.push('slam');
      if (has('heatBeam') && heroDist > 6 && heroDist < AI.beamRange) options.push('heatBeam');
      if (has('omegaBeams') && heroDist < 90) options.push('omegaBeams');
      if (has('freezeBreath') && heroDist < AI.freezeRange) options.push('freezeBreath');
      if (has('flurry') && heroDist < AI.flurryRange) options.push('flurry');
      if (options.length) startSpecial(v, options[Math.floor(ctx.rand() * options.length)]);
    }

    if (v.mode === 'engage' && v.flinch > 0) {
      v.vx *= 0.85;
      v.vz *= 0.85;
      if (v.flying) v.vy *= 0.85;
    } else if (v.mode === 'engage') {
      if (def.canFly) {
        // Fly at the hero's height, holding just outside punching distance.
        v.flying = heroAboveGround > 1.5 || v.flying;
        const keep = reach * 0.8;
        const tx = ctx.hero.x - (hx / (heroFlat || 1)) * keep;
        const tz = ctx.hero.z - (hz / (heroFlat || 1)) * keep;
        const ty = v.flying ? Math.max(ctx.hero.y + 0.2, ctx.groundY(tx, tz)) : ctx.groundY(tx, tz);
        moveToward(v, tx, ty, tz, (heroDist > 15 ? def.flySpeed : v.flurry > 0 ? def.runSpeed * 1.5 : def.runSpeed) * fast, dt, v.flying);
      } else {
        const speed = (heroFlat > 12 || (v.flurry > 0 && heroFlat > reach) ? def.runSpeed : heroFlat > reach ? def.walkSpeed * 1.5 : 0) * fast;
        if (speed > 0) moveToward(v, ctx.hero.x, 0, ctx.hero.z, speed, dt, false);
        else {
          v.vx *= 0.7;
          v.vz *= 0.7;
        }
      }
    }
  }

  // --- integrate (controlled modes) -------------------------------------------------------
  v.x += v.vx * dt;
  v.z += v.vz * dt;
  const floor = ctx.groundY(v.x, v.z);
  if (v.flying || (def.canFly && v.mode === 'charge')) {
    v.y = Math.max(floor, v.y + v.vy * dt);
    if (v.y <= floor + 0.05 && v.mode === 'engage' && heroAboveGround < 1.5) v.flying = false;
  } else {
    v.y = floor;
    v.vy = 0;
  }
  return events;
}

/** Darkseid's Omega beams: homing bolts that curve after the hero. */
export interface OmegaBolt {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  age: number;
}

export function spawnOmega(from: Vec3, count: number, rand: () => number): OmegaBolt[] {
  return Array.from({ length: count }, (_, i) => {
    // Fan out upward first, then curve in.
    const a = (i / count) * Math.PI * 2 + rand() * 0.5;
    const dx = Math.cos(a) * 0.7;
    const dz = Math.sin(a) * 0.7;
    const dy = 0.7;
    const len = Math.hypot(dx, dy, dz);
    return { x: from.x, y: from.y, z: from.z, dx: dx / len, dy: dy / len, dz: dz / len, age: 0 };
  });
}

/** Steers and moves Omega bolts; returns how many hit the hero. Spent bolts are removed. */
export function stepOmega(bolts: OmegaBolt[], dt: number, hero: Vec3, heroActive: boolean, groundY: (x: number, z: number) => number): number {
  let hits = 0;
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.age += dt;
    const tx = hero.x - b.x;
    const ty = hero.y + HERO_CHEST - b.y;
    const tz = hero.z - b.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    // Turn the heading toward the hero, limited by the turn rate.
    const k = Math.min(1, AI.omegaTurnRate * dt);
    b.dx += (tx / len - b.dx) * k;
    b.dy += (ty / len - b.dy) * k;
    b.dz += (tz / len - b.dz) * k;
    const dl = Math.hypot(b.dx, b.dy, b.dz) || 1;
    b.dx /= dl;
    b.dy /= dl;
    b.dz /= dl;
    b.x += b.dx * AI.omegaSpeed * dt;
    b.y += b.dy * AI.omegaSpeed * dt;
    b.z += b.dz * AI.omegaSpeed * dt;
    const hit = heroActive && len < 1.2;
    if (hit) hits++;
    if (hit || b.age > 7 || b.y < groundY(b.x, b.z)) bolts.splice(i, 1);
  }
  return hits;
}
