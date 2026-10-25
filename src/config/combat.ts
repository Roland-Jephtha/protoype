import type { RegionId } from './regions';

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
     * Both hands every time. Each tap throws a one-two; the third tap of a combo is a
     * flurry ending in a heavy blow; the power punch is a fast flurry ending in the
     * knockout cross. `at` = seconds after the press; `heavy` = full damage/knockback.
     */
    patterns: {
      oneTwo: [
        { side: 'left', at: 0 },
        { side: 'right', at: 0.15 },
      ],
      finisher: [
        { side: 'left', at: 0 },
        { side: 'right', at: 0.12 },
        { side: 'left', at: 0.24 },
        { side: 'right', at: 0.38, heavy: true },
      ],
      power: [
        { side: 'left', at: 0 },
        { side: 'right', at: 0.1 },
        { side: 'left', at: 0.2 },
        { side: 'right', at: 0.34, heavy: true },
      ],
    } as Record<'oneTwo' | 'finisher' | 'power', { side: 'left' | 'right'; at: number; heavy?: boolean }[]>,
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
};

/** Story missions: how many knockouts fail the mission (each earlier one returns you to the checkpoint). */
export const MISSION_RULES = {
  knockoutsToFail: 2,
};
