import { AnimationClip } from 'three';
import { describe, expect, it } from 'vitest';
import { HERO_MODELS } from '../src/config/assets';
import { resolveClips, roleForState } from '../src/game/player/heroAnimation';
import { suitRegion } from '../src/game/player/superSuit';
import { screenDeltaToGame } from '../src/ui/orientation';

const clip = (name: string) => new AnimationClip(name, 1, []);

describe('resolveClips', () => {
  it('maps Quaternius clip names to every role', () => {
    const names = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Crouch_Idle_Loop'];
    const out = resolveClips(names.map(clip), HERO_MODELS.ual.clips);
    expect(out.idle?.name).toBe('Idle_Loop');
    expect(out.run?.name).toBe('Jog_Fwd_Loop');
    expect(out.sprint?.name).toBe('Sprint_Loop');
    expect(out.jumpStart?.name).toBe('Jump_Start');
    expect(out.airborne?.name).toBe('Jump_Loop');
    expect(out.land?.name).toBe('Jump_Land');
  });

  it('falls back to looser patterns for other naming schemes', () => {
    const out = resolveClips(['Armature|idle', 'Armature|walking', 'Armature|running', 'Armature|jump'].map(clip), HERO_MODELS.ual.clips);
    expect(out.idle?.name).toBe('Armature|idle');
    expect(out.walk?.name).toBe('Armature|walking');
    expect(out.run?.name).toBe('Armature|running');
    expect(out.airborne?.name).toBe('Armature|jump');
  });
});

describe('Hatch Superman clip mapping', () => {
  it('takes clean locomotion from the CC0 library and flight from its own Flying clip', () => {
    const ual = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land', 'Crouch_Idle_Loop'];
    const hatch = ['mixamo.com', 'Falling Idle', 'Flying', 'Male Dynamic Pose', 'Running', 'Walking'];
    const fromUal = resolveClips(ual.map(clip), HERO_MODELS.hatch.clips);
    const fromHatch = resolveClips(hatch.map(clip), HERO_MODELS.hatch.clips);
    expect(fromUal.idle?.name).toBe('Idle_Loop');
    expect(fromUal.walk?.name).toBe('Walk_Loop');
    expect(fromUal.run?.name).toBe('Jog_Fwd_Loop');
    expect(fromUal.sprint?.name).toBe('Sprint_Loop');
    expect(fromUal.airborne?.name).toBe('Jump_Loop');
    expect(fromUal.hover?.name).toBe('Idle_Loop');
    // No flight clip in the library: the Hatch model's own.
    expect(fromUal.fly).toBeUndefined();
    expect(fromHatch.fly?.name).toBe('Flying');
    expect(HERO_MODELS.hatch.retarget?.rig).toBe('mixamo');
  });
});

describe('roleForState', () => {
  it('plays jump start briefly then the airborne loop', () => {
    expect(roleForState('jump', 0.05, 0.3)).toBe('jumpStart');
    expect(roleForState('jump', 0.5, 0.3)).toBe('airborne');
    expect(roleForState('fall', 0, 0.3)).toBe('airborne');
    expect(roleForState('idle', 0, 0.3)).toBe('idle');
    expect(roleForState('hardLand', 0, 0.3)).toBe('hardLand');
  });
});

describe('suitRegion', () => {
  it('colours boots, trunks, belt, skin and suit by bone and height', () => {
    expect(suitRegion('DEF-foot.L', 0.03)).toBe('red');
    expect(suitRegion('DEF-shin.R', 0.15)).toBe('red');
    expect(suitRegion('DEF-shin.R', 0.3)).toBe('suit');
    expect(suitRegion('DEF-thigh.L', 0.5)).toBe('red');
    expect(suitRegion('DEF-thigh.L', 0.35)).toBe('suit');
    expect(suitRegion('DEF-hips', 0.545)).toBe('gold');
    expect(suitRegion('DEF-spine.003', 0.75)).toBe('suit');
    expect(suitRegion('DEF-hand.L', 0.5)).toBe('skin');
    expect(suitRegion('DEF-head', 0.9)).toBe('skin');
    expect(suitRegion('DEF-head', 0.98)).toBe('hair');
  });
});

describe('screenDeltaToGame', () => {
  it('is identity when not rotated', () => {
    expect(screenDeltaToGame(3, 4, false)).toEqual({ x: 3, y: 4 });
  });

  it('maps screen deltas into a frame rotated 90° clockwise', () => {
    // In the rotated frame, game-right points down the screen and game-up points right.
    expect(screenDeltaToGame(0, 10, true)).toEqual({ x: 10, y: -0 });
    expect(screenDeltaToGame(10, 0, true)).toEqual({ x: 0, y: -10 });
  });
});
