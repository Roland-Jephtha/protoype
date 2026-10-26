import type { RegionId } from './regions';

export type StrikeKind = 'jab' | 'cross' | 'hook' | 'uppercut';
export interface Strike {
  side: 'left' | 'right';
  kind: StrikeKind;
  at: number;
  heavy?: boolean;
}
const S = (side: Strike['side'], kind: StrikeKind, at: number, heavy?: boolean): Strike => ({ side, kind, at, heavy });

/** Hero combat tuning (m, s, damage points). */
export const HERO_COMBAT = {
  maxHealth: 100,
  /** Health regenerates after this long without taking damage (s), at `regenRate` per second. */
  regenDelay: 4,
  regenRate: 12,
  /** Brief invulnerability after being knocked out and returned to the checkpoint (s). */
  respawnGrace: 3,

  punch: {
    /** Reach from the hero's centre (m) and the half-angle of the hit cone (rad). */
    range: 2.8,
    flightRange: 4,
    coneHalfAngle: 0.9,
    damage: 34,
    /** Third punch of a quick combo. */
    finisherDamage: 60,
    knockback: 14,
    finisherKnockback: 30,
    /** Arm extend + retract time (s); the hit lands at `hitAt`. */
    duration: 0.3,
    hitAt: 0.1,
    /** Another press within this window after a punch continues the combo (s). */
    comboWindow: 0.45,
    /** An enemy just out of reach pulls the punch toward it: within this extra distance (m), at this speed (m/s). */
    magnetRange: 3.5,
    magnetSpeed: 9,
    /** Every punch pushes off: a short step forward into the blow (m/s). */
    stepSpeed: 5,
    /** Torso turn and lean per punch (rad): a straight jab, then a harder cross. */
    jab: { twist: 0.32, lean: 0.12 },
    cross: { twist: 0.5, lean: 0.22 },
    /**
     * Both hands, and never the same combo twice in a row: each tap picks a random
     * combination; the third tap of a combo is a random finisher; the power punch
     * is a flurry ending in a random knockout blow. `at` = seconds after the press;
     * `heavy` = full damage/knockback. Uppercuts launch enemies up into the air.
     */
    combos: [
      [S('left', 'jab', 0), S('right', 'cross', 0.15)],
      [S('left', 'hook', 0), S('right', 'uppercut', 0.17)],
      [S('right', 'cross', 0), S('left', 'hook', 0.16)],
      [S('left', 'jab', 0), S('left', 'jab', 0.11), S('right', 'cross', 0.24)],
      [S('right', 'hook', 0), S('left', 'hook', 0.15)],
    ],
    finishers: [
      [S('left', 'jab', 0), S('right', 'cross', 0.12), S('left', 'hook', 0.24), S('right', 'uppercut', 0.4, true)],
      [S('right', 'cross', 0), S('left', 'hook', 0.13), S('right', 'hook', 0.26), S('left', 'cross', 0.4, true), S('right', 'cross', 0.4, true)],
      [S('left', 'hook', 0), S('right', 'hook', 0.14), S('left', 'uppercut', 0.3, true)],
    ],
    powers: [
      [S('left', 'jab', 0), S('right', 'cross', 0.09), S('left', 'hook', 0.18), S('right', 'cross', 0.34, true)],
      [S('left', 'jab', 0), S('right', 'jab', 0.08), S('left', 'jab', 0.16), S('right', 'uppercut', 0.34, true)],
    ],
    /** A light strike in a combo does this share of a punch's damage / knockback. */
    lightShare: 0.6,
    /** Fighting stance stays up this long after a punch, or while an enemy is this close (s, m). */
    guardAfterPunch: 2.5,
    guardRange: 14,
  },

  heat: {
    /** Heat meter: drains while firing, recharges after a short delay. */
    capacity: 100,
    drainPerSecond: 22,
    rechargePerSecond: 18,
    rechargeDelay: 0.7,
    /** After overheating, the beam is locked until the meter refills to this fraction. */
    overheatResume: 0.35,
    damagePerSecond: 70,
    /** The beam slowly shoves what it hits (m/s²). */
    pushPerSecond: 4,
    range: 160,
    /** Lock-on: the nearest target within this angle of where the hero looks (rad) and range (m). */
    lockAngle: 0.45,
    touchLockAngle: 0.6,
    /** Eyes above the hero's feet when the head bone isn't available (m). */
    eyeHeightFallback: 1.75,
  },

  /** Solar energy: powers the breaths and the Super Nova. Recharges in the sun. */
  solar: {
    capacity: 100,
    rechargePerSecond: 6,
    /** Dealing damage charges it too (energy per damage point). */
    perDamage: 0.08,
  },

  /** Hold punch past `holdTime` and release for a power punch that sends enemies flying. */
  powerPunch: {
    holdTime: 0.35,
    maxCharge: 1,
    damage: 70,
    knockback: 48,
    range: 3.6,
    /** Homes onto the nearest enemy within this range (m), dashing to it; the blow lands on arrival. */
    homingRange: 12,
    /** The blow lands anyway after this long if the target wasn't reached (s). */
    homingTimeout: 0.5,
    /** Homing lunge: top speed (m/s) and how long it lasts (s). */
    lungeSpeed: 62,
    lungeTime: 0.3,
    /** The knockout (last) fist of the power flurry lands this long after the release (s). */
    secondFistAt: 0.34,
    /** Forward lean at full extension (rad) — much deeper than a normal punch. */
    lean: 0.62,
  },


  superBreath: {
    range: 28,
    coneHalfAngle: 0.38,
    /** Continuous push on what's in the cone (m/s²) and a little damage. */
    push: 55,
    damagePerSecond: 6,
    costPerSecond: 14,
  },

  freezeBreath: {
    range: 20,
    coneHalfAngle: 0.32,
    /** Seconds of freezing added per second in the cone, up to `maxFreeze`. */
    freezePerSecond: 2.4,
    maxFreeze: 4,
    damagePerSecond: 8,
    costPerSecond: 16,
  },

  nova: {
    chargeTime: 1.2,
    cost: 60,
    radius: 36,
    damage: 160,
    knockback: 52,
    lift: 16,
  },
};

/** Vehicles as targets: they can be iced, burned until they blow up, or knocked flying. */
export const VEHICLE_DAMAGE = {
  health: 60,
  /** A single hit with at least this knockback (m/s) sends the vehicle flying as a wreck. */
  launchKnock: 20,
  maxFreeze: 6,
  /** Paint of a burnt-out wreck. */
  burntPaint: '#2a2523',
};

/** Lifting and throwing vehicles. */
export const LIFT = {
  /** Reach to grab a vehicle (m) on foot / in flight. */
  reach: 4.5,
  flightReach: 6,
  /** Held this far above the hero's feet (m). */
  holdHeight: 2.9,
  /** Throw speed along the crosshair (m/s) plus a little lift. */
  throwSpeed: 44,
  throwLift: 5,
  /** A thrown vehicle hurts enemies it hits while faster than `minHitSpeed` (m/s). */
  damage: 120,
  knockback: 42,
  minHitSpeed: 10,
  /** Wrecks stay this long (s); at most `maxThrown` at once. */
  wreckLife: 25,
  maxThrown: 6,
  /** A taken vehicle reappears in traffic after this long (s). */
  respawnDelay: 40,
  /** Rapier collider density (lower = lighter, flies further after bounces). */
  density: 0.25,
};

/** Prometheus drones: flying, armed, original design. */
export const DRONE = {
  health: 100,
  radius: 1.1,
  patrolSpeed: 6,
  chaseSpeed: 16,
  /** Notices a hero within this range (m); gives up beyond `loseRange`. */
  alertRange: 70,
  loseRange: 140,
  /** Holds this distance from the hero while attacking (m), hovering `attackHeight` above them. */
  attackDistance: 20,
  attackHeight: 7,
  patrolAltitude: 22,
  fireInterval: 1.8,
  /** Bolts (m/s, damage, lifetime s, hit radius m). */
  boltSpeed: 45,
  boltDamage: 7,
  boltLifetime: 4,
  boltHitRadius: 0.9,
  /** Spread of aim error at the hero (m) so not every bolt hits. */
  aimError: 1.6,
  /** Wreck falls and burns for this long before disappearing (s); the patrol returns after `respawn`. */
  wreckTime: 4,
  respawn: 45,
  /** Knockback damping (1/s). */
  knockDamping: 3,
  /** A frozen drone drops at this gravity (m/s²); freezing caps at `maxFreeze` s. */
  frozenGravity: 20,
  maxFreeze: 6,
};

export interface DronePatrol {
  x: number;
  z: number;
  radius: number;
  count: number;
}

/**
 * Free-roam drone patrols per region (story missions add their own). None in
 * the city: drones don't avoid buildings yet, and the city is the calm hub.
 */
export const DRONE_PATROLS: Record<RegionId, DronePatrol[]> = {
  metropolis: [],
  desert: [
    { x: 350, z: 760, radius: 120, count: 4 }, // Prometheus base
    { x: -500, z: 300, radius: 80, count: 2 }, // over the highway
  ],
  forest: [{ x: 300, z: 0, radius: 90, count: 3 }], // the dam (Chapter 3 lab)
  apokolips: [
    { x: 0, z: -420, radius: 160, count: 4 }, // palace guard
    { x: -420, z: 260, radius: 120, count: 2 },
  ],
  warworld: [{ x: 0, z: 0, radius: 200, count: 3 }], // over the arena
};

/** Story missions: how many knockouts fail the mission (each earlier one returns you to the checkpoint). */
export const MISSION_RULES = {
  knockoutsToFail: 2,
};

/** Speed Force: the world slows to a crawl while the hero moves at full speed and faster. */
export const SPEED_FORCE = {
  /** World time runs at this fraction while active. */
  worldScale: 0.04,
  /** The hero's own speeds are multiplied by this. */
  heroSpeed: 1.35,
  capacity: 100,
  /** Drains per real second while active (~16 s from full); recharges after a delay. */
  drainPerSecond: 6,
  rechargePerSecond: 4,
  rechargeDelay: 1.5,
  /** Can't switch on below this much energy. */
  minToStart: 15,
};

/**
 * How the hero reacts to being hit: every knock rocks him back; heavy blows
 * (control loss at least `knockdownAt` s) knock him off his feet — he falls,
 * lies there a moment and gets up — or send him tumbling in flight.
 */
export const HERO_HIT = {
  knockdownAt: 0.6,
  /** Fall, lie and get-up phases (s), and the total. */
  fall: 0.35,
  lie: 0.55,
  getUp: 0.5,
  /** In flight: one full somersault over this long (s). */
  tumble: 0.7,
  /** Light hits: lean back this far (rad) for this long (s). */
  staggerLean: 0.35,
  stagger: 0.35,
};

/** A split-second world freeze on heavy hits, so they land with weight (s, world scale). */
export const HIT_STOP = { heavy: 0.09, finisher: 0.13, scale: 0.04 };
