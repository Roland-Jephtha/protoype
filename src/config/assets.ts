/**
 * Asset references live here so models can be swapped without touching
 * gameplay code. Every entry must also be listed in docs/ASSET_MANIFEST.md.
 */

/** Animation roles the hero controller asks for. */
export type HeroAnim = 'idle' | 'walk' | 'run' | 'sprint' | 'jumpStart' | 'airborne' | 'land' | 'hardLand' | 'hover' | 'fly';

export interface HeroModelDef {
  id: string;
  label: string;
  url: string;
  /** Model is scaled uniformly so its bind-pose height matches this (m). */
  heightMeters: number;
  /** Extra yaw (rad) if the model's forward isn't +Z. */
  yawOffset: number;
  /**
   * 'superSuit': untextured mannequin, recoloured per body part from its
   * skeleton (blue suit, red boots/trunks, gold belt) — an original look.
   * 'textured': keep the model's own materials.
   */
  styling: 'superSuit' | 'textured';
  /** Attach the procedural cape to the upper-spine bone. */
  addCape: boolean;
  /** Ordered name patterns per role; the first clip whose name matches wins. */
  clips: Record<HeroAnim, RegExp[]>;
  /** Ground speed (m/s) at which each locomotion clip plays at 1× (feet match the ground). */
  clipSpeeds: { walk: number; run: number; sprint: number };
  credit: string;
}

/** Respect Vite's base path so the game also works from a sub-folder (e.g. GitHub Pages). */
const base = import.meta.env.BASE_URL ?? '/';

const COMMON_CLIPS: HeroModelDef['clips'] = {
  idle: [/^idle_loop$/i, /idle/i],
  walk: [/^walk_loop$/i, /walk/i],
  run: [/^jog_fwd_loop$/i, /jog|run/i],
  sprint: [/^sprint_loop$/i, /sprint|run/i],
  jumpStart: [/^jump_start$/i, /jump.?(start|up)/i, /jump/i],
  airborne: [/^jump_loop$/i, /fall|jump.?loop|air/i, /jump/i],
  land: [/^jump_land$/i, /land/i],
  hardLand: [/^crouch_idle_loop$/i, /land/i],
  // Quaternius has no flight clips: the swim loops read as flying/hovering.
  hover: [/^swim_idle_loop$/i, /^idle_loop$/i],
  fly: [/^swim_fwd_loop$/i, /fly/i],
};

export const HERO_MODELS = {
  /** CC0 Quaternius mannequin, styled in code. Always available (committed). */
  ual: {
    id: 'ual',
    label: 'Quaternius mannequin (CC0), super-suit styling',
    url: `${base}models/hero-ual.glb`,
    heightMeters: 1.9,
    yawOffset: 0,
    styling: 'superSuit',
    addCape: true,
    clips: COMMON_CLIPS,
    clipSpeeds: { walk: 1.6, run: 4.2, sprint: 7.5 },
    credit: 'Universal Animation Library by Quaternius — CC0',
  },
  /**
   * "Hatch Superman" by nitwit.friends (Sketchfab, CC BY 4.0), processed by
   * scripts/prepare-hatch.mjs. Mixamo-rigged; clips: mixamo.com (idle),
   * Walking, Running, Falling Idle, Flying, Male Dynamic Pose, strafes.
   * No jump/land clips, so airborne uses Falling Idle.
   */
  hatch: {
    id: 'hatch',
    label: 'Hatch Superman by nitwit.friends (CC BY 4.0)',
    url: `${base}models/hatch-superman/hatch-superman.glb`,
    heightMeters: 1.9,
    yawOffset: 0,
    styling: 'textured',
    addCape: true,
    clips: {
      idle: [/^mixamo\.com$/i, /idle/i, /dynamic pose/i],
      walk: [/^walking$/i, /walk/i],
      run: [/^running$/i, /run/i],
      sprint: [/^running$/i, /run/i],
      jumpStart: [/falling/i],
      airborne: [/falling/i],
      land: [/^mixamo\.com$/i],
      hardLand: [/dynamic pose/i, /^mixamo\.com$/i],
      // `Flying` is already a near-horizontal Superman pose (body ~78° from vertical);
      // hovering uses the upright idle so he floats standing.
      hover: [/^mixamo\.com$/i],
      fly: [/^flying$/i],
    },
    // Run and sprint both use the `Running` clip, measured at ~4.8 m/s from foot travel.
    clipSpeeds: { walk: 1.5, run: 4.8, sprint: 4.8 },
    credit: '"Hatch Superman" by nitwit.friends — https://sketchfab.com/3d-models/hatch-superman-e023b533044a4c37a8f899c9517c9804 — CC BY 4.0',
  },
} satisfies Record<string, HeroModelDef>;

/** Preference order: first model whose file is actually present is used. */
export const HERO_MODEL_PRIORITY: HeroModelDef[] = [HERO_MODELS.hatch, HERO_MODELS.ual];
