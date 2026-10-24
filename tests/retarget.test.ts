import { describe, expect, it } from 'vitest';
import { AnimationClip, AnimationMixer, Bone, Group, Quaternion, QuaternionKeyframeTrack, Vector3 } from 'three';
import { retargetClip, type BonePair } from '../src/game/characters/retarget';

/** A tiny rig: hips → spine → upper arm → forearm → hand, arm pointing along `armDir`. */
function rig(names: { hips: string; spine: string; arm: string; fore: string; hand: string }, armDir: Vector3, scale = 1) {
  const root = new Group();
  const hips = new Bone();
  hips.name = names.hips;
  hips.position.set(0, 1 * scale, 0);
  const spine = new Bone();
  spine.name = names.spine;
  spine.position.set(0, 0.3 * scale, 0);
  const arm = new Bone();
  arm.name = names.arm;
  arm.position.set(0.2 * scale, 0.2 * scale, 0);
  const fore = new Bone();
  fore.name = names.fore;
  fore.position.copy(armDir).multiplyScalar(0.3 * scale);
  const hand = new Bone();
  hand.name = names.hand;
  hand.position.copy(armDir).multiplyScalar(0.25 * scale);
  root.add(hips);
  hips.add(spine);
  spine.add(arm);
  arm.add(fore);
  fore.add(hand);
  root.updateMatrixWorld(true);
  return { root, hips, arm, fore, hand };
}

const dir = (a: Bone, b: Bone) => b.getWorldPosition(new Vector3()).sub(a.getWorldPosition(new Vector3())).normalize();

describe('retargetClip', () => {
  const pairs: BonePair[] = [
    { source: 'Hips', target: 'Hip' },
    { source: 'LeftArm', target: 'LBicep', sourceChild: 'LeftForeArm', targetChild: 'LForearm' },
    { source: 'LeftForeArm', target: 'LForearm', sourceChild: 'LeftHand', targetChild: 'LHand' },
  ];
  const src = () => rig({ hips: 'mixamorigHips', spine: 'mixamorigSpine', arm: 'mixamorigLeftArm', fore: 'mixamorigLeftForeArm', hand: 'mixamorigLeftHand' }, new Vector3(1, 0, 0));
  // Target: different names, A-pose arm (45° down), and 100× armature scale.
  const tgt = () => rig({ hips: 'Hip_02', spine: 'Spine_03', arm: 'LBicep_017', fore: 'LForearm_018', hand: 'LHand_019' }, new Vector3(1, -1, 0).normalize(), 100);

  it('moves the target limb to where the source limb points, despite a different rest pose', () => {
    const s = src();
    const t = tgt();
    // Source: the upper arm swings from T-pose straight down over one second.
    const down = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2);
    const clip = new AnimationClip('ArmDown', 1, [new QuaternionKeyframeTrack('mixamorigLeftArm.quaternion', [0, 1], [0, 0, 0, 1, ...down.toArray()])]);
    const baked = retargetClip(s.root, t.root, clip, pairs, 10);
    expect(baked.tracks.map((k) => k.name)).toContain('LBicep_017.quaternion');

    const mixer = new AnimationMixer(t.root);
    mixer.clipAction(baked).play();
    // Rest frame: lined up with the source's T-pose arm.
    mixer.setTime(0);
    t.root.updateMatrixWorld(true);
    expect(dir(t.arm, t.fore).x).toBeCloseTo(1, 3);
    // End frame (just before the loop wraps): arm straight down, like the source.
    mixer.setTime(0.9999);
    t.root.updateMatrixWorld(true);
    const d = dir(t.arm, t.fore);
    expect(d.y).toBeCloseTo(-1, 3);
    expect(dir(t.fore, t.hand).y).toBeCloseTo(-1, 3);
  });

  it('leaves the target rig in its rest pose afterwards', () => {
    const s = src();
    const t = tgt();
    const before = t.arm.quaternion.clone();
    retargetClip(s.root, t.root, new AnimationClip('Empty', 1, []), pairs, 10);
    expect(t.arm.quaternion.angleTo(before)).toBeLessThan(1e-6);
  });
});
