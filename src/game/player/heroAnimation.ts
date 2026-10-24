import type { AnimationClip } from 'three';
import type { HeroAnim, HeroModelDef } from '../../config/assets';
import type { PlayerMoveState } from './groundMovement';

export const LOOPING: Record<HeroAnim, boolean> = {
  idle: true,
  walk: true,
  run: true,
  sprint: true,
  jumpStart: false,
  airborne: true,
  land: false,
  hardLand: true,
  hover: true,
  fly: true,
};
export const LOCOMOTION: HeroAnim[] = ['walk', 'run', 'sprint'];

/** Picks the first clip whose name matches the role's patterns (in order). */
export function resolveClips(clips: AnimationClip[], patterns: HeroModelDef['clips']) {
  const out: Partial<Record<HeroAnim, AnimationClip>> = {};
  for (const role of Object.keys(patterns) as HeroAnim[]) {
    for (const re of patterns[role]) {
      const hit = clips.find((c) => re.test(c.name));
      if (hit) {
        out[role] = hit;
        break;
      }
    }
  }
  return out;
}

/** Movement state → animation role. */
export function roleForState(state: PlayerMoveState, stateTime: number, jumpStartDuration: number): HeroAnim {
  switch (state) {
    case 'walk':
      return 'walk';
    case 'run':
      return 'run';
    case 'sprint':
      return 'sprint';
    case 'jump':
      return stateTime < jumpStartDuration ? 'jumpStart' : 'airborne';
    case 'fall':
      return 'airborne';
    case 'land':
      return 'land';
    case 'hardLand':
      return 'hardLand';
    case 'takeoff':
    case 'hover':
      return 'hover';
    case 'fly':
    case 'flyBoost':
      return 'fly';
    default:
      return 'idle';
  }
}
