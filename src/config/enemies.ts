import type { RegionId } from './regions';

export type SoldierRole = 'brute' | 'rifle';

/** LexCorp soldiers: street-level enemies in squads (m, s, damage points). */
export const SOLDIER = {
  health: { brute: 70, rifle: 45 } as Record<SoldierRole, number>,
  radius: 0.55,
  height: 1.8,
  walkSpeed: 2.2,
  runSpeed: 6.5,
  /** Notice the hero within this range; give up beyond `loseRange`. */
  alertRange: 40,
  loseRange: 90,
  /** Brutes punch from `meleeRange`; riflemen keep between `rifleMin` and `rifleMax`. */
  meleeRange: 1.9,
  rifleMin: 10,
  rifleMax: 22,
  /** Telegraph before every attack (s): the warning the hero can react to. */
  windup: { brute: 0.6, rifle: 0.8 } as Record<SoldierRole, number>,
  cooldown: { brute: [1.4, 2.4], rifle: [2.2, 3.4] } as Record<SoldierRole, [number, number]>,
  punchDamage: 6,
  punchKnock: 7,
  shotDamage: 4,
  /** A shot misses a hero moving faster than this (m/s). */
  shotDodgeSpeed: 9,
  shotHitChance: 0.65,
  /** Knockback (m/s) that sends a soldier flying; staggered by anything less. */
  launchThreshold: 11,
  /** Hero knockback is scaled by this on soldiers. */
  knockScale: 0.55,
  staggerTime: 0.4,
  gravity: 22,
  getUpTime: 1.4,
  /** Knocked out: lies there, then is cleared away. */
  outTime: 10,
  /** Soldiers keep at least this far apart (m). */
  spacing: 1.4,
  /** A whole squad down: a fresh squad arrives after this long (s). */
  squadRespawn: 45,
  frozenMax: 6,
};

export interface SquadDef {
  x: number;
  z: number;
  brutes: number;
  rifles: number;
}

/** Free-roam squads per region. */
export const SOLDIER_SQUADS: Record<RegionId, SquadDef[]> = {
  metropolis: [
    { x: 28, z: -34, brutes: 3, rifles: 1 }, // the street north of the plaza
    { x: -84, z: 30, brutes: 2, rifles: 2 },
    { x: 84, z: 84, brutes: 3, rifles: 2 },
  ],
  desert: [
    { x: 300, z: 700, brutes: 3, rifles: 3 }, // Prometheus base
    { x: -1000, z: 380, brutes: 2, rifles: 1 }, // near the arrival
  ],
  forest: [
    { x: -60, z: 1000, brutes: 2, rifles: 1 }, // near the arrival
    { x: 260, z: 40, brutes: 3, rifles: 2 }, // the dam
  ],
  apokolips: [{ x: 0, z: -300, brutes: 4, rifles: 2 }],
  warworld: [{ x: 0, z: 90, brutes: 4, rifles: 2 }],
};
