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
export function retargetClip(source: Object3D, target: Object3D, clip: AnimationClip, pairs: BonePair[], fps = 30): AnimationClip {
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

  const hipsSrc = sBones.get('Hips');
  const hipsTgt = tBones.get('Hip');
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
