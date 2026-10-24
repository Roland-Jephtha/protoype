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
    /** Aim assist: the beam locks onto an enemy within this angle of the aim ray (rad). */
    assistAngle: 0.07,
    touchAssistAngle: 0.2,
    /** Eyes above the hero's feet when the head bone isn't available (m). */
    eyeHeightFallback: 1.75,
  },
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
