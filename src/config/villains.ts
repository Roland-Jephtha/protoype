import type { RegionId } from './regions';

export type VillainId = 'doomsday' | 'zod' | 'darkseid' | 'clone';
export type VillainPower = 'punch' | 'charge' | 'slam' | 'heatBeam' | 'omegaBeams' | 'freezeBreath' | 'flurry';

export interface VillainDef {
  id: VillainId;
  name: string;
  /** Short line shown when the fight starts. */
  title: string;
  /** Model: a villain .glb (DavidA3D rig, animated by retargeting the hero's clips), or the hero model itself. */
  model: { kind: 'villain'; url: string } | { kind: 'hero' };
  heightMeters: number;
  /** Extra yaw if the model's forward isn't +Z (checked visually). */
  yawOffset: number;
  /** Recolour: material name → colour (villain models ship flat named colours), or a multiply tint for textured models. */
  colors?: Record<string, string>;
  tint?: string;
  health: number;
  /** Regenerates this much health per second (Doomsday adapts). */
  regen: number;
  canFly: boolean;
  walkSpeed: number;
  runSpeed: number;
  flySpeed: number;
  /** Hit sphere radius (m). */
  radius: number;
  /** Knockback (m/s) needed to send it flying; heavier villains need more. */
  launchThreshold: number;
  /** Damage taken is multiplied by this. */
  toughness: number;
  powers: VillainPower[];
  /** Notices the hero within this range (m). */
  aggroRange: number;
  /** Phase 2 (below half health): extra moves and the line it roars. */
  phase2: { powers: VillainPower[]; line: string };
}

const base = import.meta.env.BASE_URL ?? '/';

export const VILLAINS: Record<VillainId, VillainDef> = {
  doomsday: {
    id: 'doomsday',
    name: 'Doomsday',
    title: 'The creature that killed a god',
    model: { kind: 'villain', url: `${base}models/villains/doomsday.glb` },
    heightMeters: 2.7,
    yawOffset: 0,
    health: 900,
    regen: 6,
    canFly: false,
    walkSpeed: 3,
    runSpeed: 14,
    flySpeed: 0,
    radius: 1.3,
    launchThreshold: 26,
    toughness: 0.7,
    powers: ['punch', 'charge', 'slam'],
    aggroRange: 90,
    phase2: { powers: ['flurry'], line: 'It adapts. It gets stronger.' },
  },
  zod: {
    id: 'zod',
    name: 'General Zod',
    title: 'Kryptonian warlord',
    model: { kind: 'villain', url: `${base}models/villains/zod.glb` },
    heightMeters: 1.88,
    yawOffset: 0,
    health: 600,
    regen: 0,
    canFly: true,
    walkSpeed: 2,
    runSpeed: 9,
    flySpeed: 26,
    radius: 0.8,
    launchThreshold: 16,
    toughness: 1,
    powers: ['punch', 'charge', 'heatBeam'],
    aggroRange: 110,
    phase2: { powers: ['flurry', 'slam'], line: 'Kneel before Zod!' },
  },
  darkseid: {
    id: 'darkseid',
    name: 'Darkseid',
    title: 'Lord of Apokolips',
    model: { kind: 'villain', url: `${base}models/villains/darkseid.glb` },
    heightMeters: 2.5,
    yawOffset: 0,
    health: 1100,
    regen: 2,
    canFly: false,
    walkSpeed: 1.6,
    runSpeed: 4,
    flySpeed: 0,
    radius: 1.2,
    launchThreshold: 34,
    toughness: 0.6,
    powers: ['punch', 'omegaBeams', 'slam'],
    aggroRange: 120,
    phase2: { powers: ['charge', 'flurry'], line: 'I am the Omega.' },
  },
  clone: {
    id: 'clone',
    name: 'Subject Zero',
    title: 'Project Krypton’s failed clone',
    model: { kind: 'hero' },
    heightMeters: 1.92,
    yawOffset: 0,
    tint: '#7a7684',
    health: 650,
    regen: 3,
    canFly: true,
    walkSpeed: 2,
    runSpeed: 10,
    flySpeed: 30,
    radius: 0.8,
    launchThreshold: 16,
    toughness: 1,
    powers: ['punch', 'charge', 'heatBeam', 'freezeBreath'],
    aggroRange: 110,
    phase2: { powers: ['flurry'], line: 'I was made to replace you.' },
  },
};

/** Where each villain waits in free roam (they engage when the hero comes close). */
export const VILLAIN_LAIRS: Record<RegionId, { id: VillainId; x: number; z: number }[]> = {
  metropolis: [],
  desert: [
    { id: 'doomsday', x: -520, z: 820 }, // salt pan
    { id: 'darkseid', x: 0, z: -420 },
  ],
  forest: [
    { id: 'zod', x: 550, z: -470 }, // ranger station
    { id: 'clone', x: -760, z: -560 }, // cabins
  ],
  apokolips: [{ id: 'darkseid', x: 0, z: -360 }], // before his palace
  warworld: [
    { id: 'doomsday', x: -40, z: 0 }, // arena champions
    { id: 'clone', x: 40, z: 0 },
  ],
};

/** Villain behaviour tuning shared by all bosses (m, s, damage). */
export const VILLAIN_AI = {
  punchRange: 2.6,
  punchDamage: 12,
  punchKnock: 16,
  punchCooldown: 1.1,
  chargeRange: 45,
  chargeSpeed: 34,
  chargeDamage: 22,
  chargeKnock: 28,
  chargeCooldown: 7,
  slamCooldown: 9,
  slamRadius: 14,
  slamDamage: 25,
  slamKnock: 22,
  beamRange: 70,
  beamDps: 18,
  beamDuration: 2.2,
  beamCooldown: 6,
  /** Telegraph before beams and charges so the hero can react (s). */
  windup: 0.7,
  omegaCount: 4,
  omegaSpeed: 18,
  omegaTurnRate: 2.4,
  omegaDamage: 10,
  omegaCooldown: 8,
  freezeRange: 16,
  freezeCooldown: 10,
  freezeDuration: 2.5,
  /** Hero is slowed to this fraction while frozen. */
  freezeSlow: 0.25,
  /** Gets back up after being sent flying (s), and is out for this long once beaten (s). */
  getUpTime: 1.2,
  /** A beaten villain lies there this long (s), then is gone until `respawn` (s) later. */
  defeatedLie: 15,
  respawn: 90,
  gravity: 22,
  /** A flurry: this many punches in quick succession, chasing the hero. */
  flurryPunches: 4,
  flurryRange: 14,
  flurryCooldown: 6,
  /** Light hits make a villain flinch: its punch is cancelled and it can't act (s). */
  flinchTime: 0.3,
};

/** Boss fights: a second phase at half health and a slow-motion finishing blow. */
export const BOSS_FIGHT = {
  /** Phase 2 starts at this fraction of health; a hit can't skip past it. */
  phaseAt: 0.5,
  /** Roar (invulnerable) before phase 2; the shockwave goes off halfway through (s, m, m/s, damage). */
  enrageTime: 1.6,
  enrageRadius: 16,
  enrageKnock: 30,
  enrageDamage: 8,
  /** Phase 2: faster, shorter cooldowns and telegraphs, Omega beams doubled, half the flinch. */
  speed: 1.3,
  cooldown: 0.6,
  windup: 0.7,
  omegaMultiplier: 2,
  flinch: 0.5,
  /** The defeating blow plays in slow motion for this long (real s) at this world time scale. */
  finisherTime: 2.4,
  finisherScale: 0.12,
  /** Finisher camera: distance from the boss, height and orbit speed (m, m, rad/s). */
  finisherDistance: 9,
  finisherHeight: 2.5,
  finisherOrbit: 0.6,
};
