import { AnimationClip, AnimationMixer, LoopOnce, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack, type Bone } from 'three';
import { canonicalBoneName } from '../player/boneNames';

/**
 * One retargeted bone: `target` takes the motion of `source`. `targetChild` /
 * `sourceChild` (optional) give each bone's direction, used to line up rest
 * poses that differ (T-pose vs A-pose arms) before copying motion.
 */
export interface BonePair {
  source: string;
  target: string;
  sourceChild?: string;
  targetChild?: string;
}

/** Mixamo (the hero's rig) → DavidA3D's Blender rig used by the villain models. Canonical names. */
export const MIXAMO_TO_DAVIDA3D: BonePair[] = [
  { source: 'Hips', target: 'Hip' },
  { source: 'Spine', target: 'Spine', sourceChild: 'Spine2', targetChild: 'Chest' },
  { source: 'Spine2', target: 'Chest', sourceChild: 'Neck', targetChild: 'Neck' },
  { source: 'Neck', target: 'Neck', sourceChild: 'Head', targetChild: 'Head' },
  { source: 'Head', target: 'Head' },
  ...(['Left', 'Right'] as const).flatMap((S) => {
    const s = S[0];
    return [
      { source: `${S}Shoulder`, target: `${s}Collar`, sourceChild: `${S}Arm`, targetChild: `${s}Bicep` },
      { source: `${S}Arm`, target: `${s}Bicep`, sourceChild: `${S}ForeArm`, targetChild: `${s}Forearm` },
      { source: `${S}ForeArm`, target: `${s}Forearm`, sourceChild: `${S}Hand`, targetChild: `${s}Hand` },
      { source: `${S}Hand`, target: `${s}Hand` },
      { source: `${S}UpLeg`, target: `${s}Thigh`, sourceChild: `${S}Leg`, targetChild: `${s}Shank` },
      { source: `${S}Leg`, target: `${s}Shank`, sourceChild: `${S}Foot`, targetChild: `${s}Foot` },
      { source: `${S}Foot`, target: `${s}Foot` },
    ];
  }),
];

/**
 * Quaternius UAL (the CC0 mannequin, whose library has the punch / hit / roll
 * clips) → Mixamo (the textured hero). Canonical names.
 */
export const UAL_TO_MIXAMO: BonePair[] = [
  { source: 'hips', target: 'Hips' },
  { source: 'spine001', target: 'Spine', sourceChild: 'spine002', targetChild: 'Spine1' },
  { source: 'spine002', target: 'Spine1', sourceChild: 'spine003', targetChild: 'Spine2' },
  { source: 'spine003', target: 'Spine2', sourceChild: 'neck', targetChild: 'Neck' },
  { source: 'neck', target: 'Neck', sourceChild: 'head', targetChild: 'Head' },
  { source: 'head', target: 'Head' },
  ...(['L', 'R'] as const).flatMap((s) => {
    const S = s === 'L' ? 'Left' : 'Right';
    return [
      { source: `shoulder${s}`, target: `${S}Shoulder`, sourceChild: `upper_arm${s}`, targetChild: `${S}Arm` },
      { source: `upper_arm${s}`, target: `${S}Arm`, sourceChild: `forearm${s}`, targetChild: `${S}ForeArm` },
      { source: `forearm${s}`, target: `${S}ForeArm`, sourceChild: `hand${s}`, targetChild: `${S}Hand` },
      { source: `hand${s}`, target: `${S}Hand` },
      { source: `thigh${s}`, target: `${S}UpLeg`, sourceChild: `shin${s}`, targetChild: `${S}Leg` },
      { source: `shin${s}`, target: `${S}Leg`, sourceChild: `foot${s}`, targetChild: `${S}Foot` },
      { source: `foot${s}`, target: `${S}Foot` },
    ];
  }),
];

/** Rigify-style limb pairs (Blender metarig names: upper_arm.L, thigh.R …), from a source naming scheme. */
function rigifyLimbs(src: (side: 'L' | 'R', part: 'shoulder' | 'arm' | 'forearm' | 'hand' | 'thigh' | 'shin' | 'foot') => string): BonePair[] {
  return (['L', 'R'] as const).flatMap((s) => [
    { source: src(s, 'shoulder'), target: `shoulder${s}`, sourceChild: src(s, 'arm'), targetChild: `upper_arm${s}` },
    { source: src(s, 'arm'), target: `upper_arm${s}`, sourceChild: src(s, 'forearm'), targetChild: `forearm${s}` },
    { source: src(s, 'forearm'), target: `forearm${s}`, sourceChild: src(s, 'hand'), targetChild: `hand${s}` },
    { source: src(s, 'hand'), target: `hand${s}` },
    { source: src(s, 'thigh'), target: `thigh${s}`, sourceChild: src(s, 'shin'), targetChild: `shin${s}` },
    { source: src(s, 'shin'), target: `shin${s}`, sourceChild: src(s, 'foot'), targetChild: `foot${s}` },
    { source: src(s, 'foot'), target: `foot${s}` },
  ]);
}

const MIXAMO_PART = { shoulder: 'Shoulder', arm: 'Arm', forearm: 'ForeArm', hand: 'Hand', thigh: 'UpLeg', shin: 'Leg', foot: 'Foot' } as const;

/** Mixamo (the hero) → a Rigify metarig (e.g. the classic Doomsday): hips, spine, chest, neck, head. */
export const MIXAMO_TO_RIGIFY: BonePair[] = [
  { source: 'Hips', target: 'hips' },
  { source: 'Spine', target: 'spine', sourceChild: 'Spine2', targetChild: 'chest' },
  { source: 'Spine2', target: 'chest', sourceChild: 'Neck', targetChild: 'neck' },
  { source: 'Neck', target: 'neck', sourceChild: 'Head', targetChild: 'head' },
  { source: 'Head', target: 'head' },
  ...rigifyLimbs((s, p) => `${s === 'L' ? 'Left' : 'Right'}${MIXAMO_PART[p]}`),
];

const UAL_PART = { shoulder: 'shoulder', arm: 'upper_arm', forearm: 'forearm', hand: 'hand', thigh: 'thigh', shin: 'shin', foot: 'foot' } as const;

/** The CC0 mannequin (strike clips) → a Rigify metarig. */
export const UAL_TO_RIGIFY: BonePair[] = [
  { source: 'hips', target: 'hips' },
  { source: 'spine001', target: 'spine', sourceChild: 'spine003', targetChild: 'chest' },
  { source: 'spine003', target: 'chest', sourceChild: 'neck', targetChild: 'neck' },
  { source: 'neck', target: 'neck', sourceChild: 'head', targetChild: 'head' },
  { source: 'head', target: 'head' },
  ...rigifyLimbs((s, p) => `${UAL_PART[p]}${s}`),
];

/** Body parts shared by humanoid rigs, with the child that gives each its direction. */
const PARTS = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'shoulderL', 'armL', 'foreL', 'handL', 'thighL', 'shinL', 'footL', 'shoulderR', 'armR', 'foreR', 'handR', 'thighR', 'shinR', 'footR'] as const;
type Part = (typeof PARTS)[number];
const CHILD: Partial<Record<Part, Part>> = { spine: 'spine1', spine1: 'spine2', spine2: 'neck', neck: 'head', shoulderL: 'armL', armL: 'foreL', foreL: 'handL', thighL: 'shinL', shinL: 'footL', shoulderR: 'armR', armR: 'foreR', foreR: 'handR', thighR: 'shinR', shinR: 'footR' };

/** Canonical bone names per rig. */
export const RIG_NAMES: Record<'mixamo' | 'ual' | 'injustice', Record<Part, string>> = {
  mixamo: { hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head', shoulderL: 'LeftShoulder', armL: 'LeftArm', foreL: 'LeftForeArm', handL: 'LeftHand', thighL: 'LeftUpLeg', shinL: 'LeftLeg', footL: 'LeftFoot', shoulderR: 'RightShoulder', armR: 'RightArm', foreR: 'RightForeArm', handR: 'RightHand', thighR: 'RightUpLeg', shinR: 'RightLeg', footR: 'RightFoot' },
  ual: { hips: 'hips', spine: 'spine001', spine1: 'spine002', spine2: 'spine003', neck: 'neck', head: 'head', shoulderL: 'shoulderL', armL: 'upper_armL', foreL: 'forearmL', handL: 'handL', thighL: 'thighL', shinL: 'shinL', footL: 'footL', shoulderR: 'shoulderR', armR: 'upper_armR', foreR: 'forearmR', handR: 'handR', thighR: 'thighR', shinR: 'shinR', footR: 'footR' },
  // Injustice 2 rigs (the DCEU collection): "arm left shoulder 2" is the upper arm. glTF loading turns the spaces in their names into underscores.
  injustice: { hips: 'root_hips', spine: 'spine_lower', spine1: 'spine_middle', spine2: 'spine_upper', neck: 'head_neck_lower', head: 'head_neck_upper', shoulderL: 'arm_left_shoulder_1', armL: 'arm_left_shoulder_2', foreL: 'arm_left_elbow', handL: 'arm_left_wrist', thighL: 'leg_left_thigh', shinL: 'leg_left_knee', footL: 'leg_left_ankle', shoulderR: 'arm_right_shoulder_1', armR: 'arm_right_shoulder_2', foreR: 'arm_right_elbow', handR: 'arm_right_wrist', thighR: 'leg_right_thigh', shinR: 'leg_right_knee', footR: 'leg_right_ankle' },
};

/** Bone pairs to retarget clips from one rig naming to another. */
export function rigPairs(from: keyof typeof RIG_NAMES, to: keyof typeof RIG_NAMES): BonePair[] {
  const s = RIG_NAMES[from];
  const t = RIG_NAMES[to];
  return PARTS.map((p) => {
    const c = CHILD[p];
    return c ? { source: s[p], target: t[p], sourceChild: s[c], targetChild: t[c] } : { source: s[p], target: t[p] };
  });
}

/** Mixamo bone names → another rig's, for the pose helpers (CombatPose). */
export function mixamoAliases(to: keyof typeof RIG_NAMES): Record<string, string> {
  return Object.fromEntries(PARTS.map((p) => [RIG_NAMES.mixamo[p], RIG_NAMES[to][p]]));
}

/**
 * Stands a model upright facing +Z when it was exported lying down or turned:
 * rotates its root so hips→head points up and the left shoulder is at +X.
 */
export function standUpright(model: Object3D, bones = { hips: 'hips', head: 'head', left: 'upper_armL', right: 'upper_armR' }) {
  model.updateMatrixWorld(true);
  const b = bonesByCanon(model);
  const pos = (n: string) => b.get(n)?.getWorldPosition(new Vector3());
  const hips = pos(bones.hips);
  const head = pos(bones.head);
  const left = pos(bones.left);
  const right = pos(bones.right);
  if (!hips || !head || !left || !right) return;
  const up = new Quaternion().setFromUnitVectors(head.sub(hips).normalize(), new Vector3(0, 1, 0));
  const side = left.sub(right).applyQuaternion(up);
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.atan2(-side.z, side.x));
  model.quaternion.premultiply(yaw.multiply(up));
  model.updateMatrixWorld(true);
}

function bonesByCanon(root: Object3D) {
  const map = new Map<string, Bone>();
  root.traverse((o) => {
    if ((o as Bone).isBone) {
      const c = canonicalBoneName(o.name);
      if (!map.has(c)) map.set(c, o as Bone);
    }
  });
  return map;
}

interface Resolved {
  pair: BonePair;
  src: Bone;
  tgt: Bone;
  srcRestWorld: Quaternion;
  /** Target rest world rotation, already swung so its direction matches the source rest direction. */
  tgtAlignedRestWorld: Quaternion;
}

const tmpA = new Vector3();
const tmpB = new Vector3();

function direction(from: Object3D, to: Object3D, out: Vector3) {
  from.getWorldPosition(tmpA);
  to.getWorldPosition(tmpB);
  return out.copy(tmpB).sub(tmpA).normalize();
}

function depth(o: Object3D) {
  let d = 0;
  for (let p = o.parent; p; p = p.parent) d++;
  return d;
}

/**
 * Bakes `clip` (authored for `source`) into a clip for `target`. Both roots must
 * stand at the origin facing +Z in their rest poses. Rotation is copied as the
 * change from each rig's rest pose (after lining the rests up); the hips'
 * vertical bob is scaled by the ratio of hip heights.
 */
export function retargetClip(
  source: Object3D,
  target: Object3D,
  clip: AnimationClip,
  pairs: BonePair[],
  fps = 30,
  hips: { source: string; target: string } = { source: 'Hips', target: 'Hip' },
): AnimationClip {
  const sBones = bonesByCanon(source);
  const tBones = bonesByCanon(target);
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);

  // Rest poses (the loaded node transforms are the bind pose).
  const restLocal = new Map<Bone, Quaternion>();
  for (const b of tBones.values()) restLocal.set(b, b.quaternion.clone());
  const resolved: Resolved[] = [];
  for (const pair of pairs) {
    const src = sBones.get(pair.source);
    const tgt = tBones.get(pair.target);
    if (!src || !tgt) continue;
    const srcRestWorld = src.getWorldQuaternion(new Quaternion());
    const tgtRestWorld = tgt.getWorldQuaternion(new Quaternion());
    const align = new Quaternion();
    const sc = pair.sourceChild ? sBones.get(pair.sourceChild) : undefined;
    const tc = pair.targetChild ? tBones.get(pair.targetChild) : undefined;
    if (sc && tc) align.setFromUnitVectors(direction(tgt, tc, new Vector3()), direction(src, sc, new Vector3()));
    resolved.push({ pair, src, tgt, srcRestWorld, tgtAlignedRestWorld: align.multiply(tgtRestWorld) });
  }
  // Parents first, so each bone's parent already has its frame pose.
  resolved.sort((a, b) => depth(a.tgt) - depth(b.tgt));

  const hipsSrc = sBones.get(hips.source);
  const hipsTgt = tBones.get(hips.target);
  const srcHipRest = hipsSrc ? hipsSrc.getWorldPosition(new Vector3()) : new Vector3();
  const tgtHipRestLocal = hipsTgt ? hipsTgt.position.clone() : new Vector3();
  const tgtHipRestWorld = hipsTgt ? hipsTgt.getWorldPosition(new Vector3()) : new Vector3();
  const hipScale = srcHipRest.y !== 0 ? tgtHipRestWorld.y / srcHipRest.y : 1;

  const mixer = new AnimationMixer(source);
  const action = mixer.clipAction(clip);
  // Hold the last frame at t = duration instead of wrapping to the start.
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const quatValues = resolved.map(() => new Float32Array(frames * 4));
  const hipValues = new Float32Array(frames * 3);
  const delta = new Quaternion();
  const parentWorld = new Quaternion();
  const desired = new Quaternion();
  const srcWorld = new Quaternion();
  const hipNow = new Vector3();

  for (let f = 0; f < frames; f++) {
    const t = Math.min(clip.duration, f / fps);
    times[f] = t;
    mixer.setTime(t);
    source.updateMatrixWorld(true);
    for (const [b, q] of restLocal) b.quaternion.copy(q);
    if (hipsTgt) hipsTgt.position.copy(tgtHipRestLocal);
    target.updateMatrixWorld(true);

    resolved.forEach((r, i) => {
      // World change from the source rest pose, applied to the aligned target rest.
      r.src.getWorldQuaternion(srcWorld);
      delta.copy(srcWorld).multiply(r.srcRestWorld.clone().invert());
      desired.copy(delta).multiply(r.tgtAlignedRestWorld);
      if (r.tgt.parent) r.tgt.parent.getWorldQuaternion(parentWorld);
      else parentWorld.identity();
      r.tgt.quaternion.copy(parentWorld.invert().multiply(desired));
      r.tgt.updateMatrixWorld(true);
      r.tgt.quaternion.toArray(quatValues[i], f * 4);
    });

    if (hipsSrc && hipsTgt) {
      hipsSrc.getWorldPosition(hipNow);
      // Vertical bob only (clips are in place); keep the target's own rest offset.
      hipValues[f * 3] = tgtHipRestLocal.x;
      hipValues[f * 3 + 1] = tgtHipRestLocal.y + (hipNow.y - srcHipRest.y) * hipScale * (tgtHipRestLocal.y / (tgtHipRestWorld.y || 1));
      hipValues[f * 3 + 2] = tgtHipRestLocal.z;
    }
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  // Leave the target in its rest pose.
  for (const [b, q] of restLocal) b.quaternion.copy(q);
  if (hipsTgt) hipsTgt.position.copy(tgtHipRestLocal);

  const tracks = resolved.map((r, i) => new QuaternionKeyframeTrack(`${r.tgt.name}.quaternion`, times, quatValues[i]));
  if (hipsTgt) tracks.push(new VectorKeyframeTrack(`${hipsTgt.name}.position`, times, hipValues));
  return new AnimationClip(clip.name, clip.duration, tracks);
}
