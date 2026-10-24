import { Object3D, Quaternion, Vector3, type Bone } from 'three';
import { canonicalBoneName, MIXAMO_FROM_UAL } from './boneNames';

/** Mixamo bone name → the same bone in another rig (canonical names). */
export type BoneAliases = Record<string, string>;

function findBone(root: Object3D, mixamo: string, aliases?: BoneAliases): Object3D | undefined {
  const names = [mixamo, MIXAMO_FROM_UAL[mixamo], aliases?.[mixamo]].filter(Boolean);
  let hit: Object3D | undefined;
  root.traverse((o) => {
    if (!hit && (o as Bone).isBone && names.includes(canonicalBoneName(o.name))) hit = o;
  });
  return hit;
}

/** Torso twist at full punch extension (rad). */
const PUNCH_TWIST = 0.3;
/** Forward lean of the torso at full punch extension (rad). */
const PUNCH_LEAN = 0.38;

/** Punch arm extension over the punch (0..1 progress): snap out, hold, pull back. */
export function punchWeight(progress: number) {
  if (progress < 0 || progress >= 1) return 0;
  if (progress < 0.3) {
    const k = progress / 0.3;
    return 1 - (1 - k) * (1 - k);
  }
  if (progress < 0.5) return 1;
  const k = (progress - 0.5) / 0.5;
  return 1 - k * k * (3 - 2 * k);
}

/**
 * Procedural combat overlay on top of the animation clips (the hero rigs have
 * no punch clips): bends the punching arm straight out toward a point in front
 * of the chest, and reports where the eyes are for heat vision. Rig-agnostic:
 * works from bone positions, not from rig-specific local axes.
 */
export class CombatPose {
  private head?: Object3D;
  private spine?: Object3D;
  private arms: Record<'left' | 'right', { upper?: Object3D; fore?: Object3D; hand?: Object3D }>;
  private v = { a: new Vector3(), b: new Vector3(), c: new Vector3(), target: new Vector3(), dir: new Vector3(), up: new Vector3(0, 1, 0) };
  private q = { full: new Quaternion(), delta: new Quaternion(), parent: new Quaternion(), inv: new Quaternion(), id: new Quaternion() };

  constructor(model: Object3D, aliases?: BoneAliases) {
    const find = (name: string) => findBone(model, name, aliases);
    this.head = find('Head');
    this.spine = find('Spine1');
    this.arms = {
      left: { upper: find('LeftArm'), fore: find('LeftForeArm'), hand: find('LeftHand') },
      right: { upper: find('RightArm'), fore: find('RightForeArm'), hand: find('RightHand') },
    };
  }

  /** Applies a world-space rotation to a bone (converted into its local space). */
  private rotateWorld(bone: Object3D, delta: Quaternion) {
    const { parent, inv } = this.q;
    if (bone.parent) bone.parent.getWorldQuaternion(parent);
    else parent.identity();
    inv.copy(parent).invert().multiply(delta).multiply(parent);
    bone.quaternion.premultiply(inv);
    bone.updateWorldMatrix(false, true);
  }

  /** Rotates `bone` (in world space, by `weight`) so the direction to `child` points at `target`. */
  private aim(bone: Object3D, child: Object3D, target: Vector3, weight: number) {
    const { a, b, dir } = this.v;
    bone.getWorldPosition(a);
    child.getWorldPosition(b);
    const cur = b.sub(a).normalize();
    dir.copy(target).sub(a).normalize();
    const { full, delta, id } = this.q;
    full.setFromUnitVectors(cur, dir);
    delta.slerpQuaternions(id, full, weight);
    this.rotateWorld(bone, delta);
  }

  /**
   * Applies the punch pose. `forward` is the body's facing (unit, world),
   * `height` the hero's height in metres. Call after the mixer has posed the
   * skeleton and world matrices are current.
   */
  applyPunch(side: 'left' | 'right', progress: number, forward: Vector3, height: number) {
    const w = punchWeight(progress);
    const arm = this.arms[side];
    if (w <= 0 || !arm.upper || !arm.fore || !arm.hand) return;
    // Drive the punching shoulder forward (torso twist) and lean the whole body into the blow.
    if (this.spine) {
      this.q.full.setFromAxisAngle(this.v.up.set(0, 1, 0), (side === 'right' ? -PUNCH_TWIST : PUNCH_TWIST) * w);
      this.rotateWorld(this.spine, this.q.full);
      // Lateral axis = up × forward; a positive turn about it tips the chest forward.
      this.v.dir.crossVectors(this.v.up, forward).normalize();
      this.q.full.setFromAxisAngle(this.v.dir, PUNCH_LEAN * w);
      this.rotateWorld(this.spine, this.q.full);
    }
    // Fist target: in front of the chest, at shoulder height, slightly toward the centre line.
    const shoulder = arm.upper.getWorldPosition(this.v.c);
    const target = this.v.target.copy(shoulder).addScaledVector(forward, 0.42 * height);
    target.y -= 0.03 * height;
    this.aim(arm.upper, arm.fore, target, w);
    this.aim(arm.fore, arm.hand, target, w);
  }

  /** Both arms raised overhead (holding something up), blended by `weight`. */
  applyLift(forward: Vector3, height: number, weight: number) {
    for (const side of ['left', 'right'] as const) {
      const arm = this.arms[side];
      if (!arm.upper || !arm.fore || !arm.hand) continue;
      const shoulder = arm.upper.getWorldPosition(this.v.c);
      const target = this.v.target.copy(shoulder).addScaledVector(forward, 0.04 * height);
      target.y += 0.5 * height;
      this.aim(arm.upper, arm.fore, target, weight);
      this.aim(arm.fore, arm.hand, target, weight);
    }
  }

  /** Midpoint between the eyes (world), or false if the rig has no head bone. */
  eyes(out: Vector3, forward: Vector3, up: Vector3, height: number): boolean {
    if (!this.head) return false;
    this.head.getWorldPosition(out);
    out.addScaledVector(up, 0.05 * height).addScaledVector(forward, 0.05 * height);
    return true;
  }
}
