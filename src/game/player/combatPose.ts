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

/** A punch in progress for the fighting pose. */
export interface PunchPose {
  side: 'left' | 'right';
  /** 0..1 through the punch. */
  progress: number;
  /** Torso turn into the punch and forward lean at full extension (rad). */
  twist: number;
  lean: number;
  /** Straight (jab/cross), hook (wide arc from the side) or uppercut (rising from below). */
  kind?: 'jab' | 'cross' | 'hook' | 'uppercut';
}

/** Fist extension over a punch (0..1 progress): snap out, short hold, back to guard. */
export function punchWeight(progress: number) {
  if (progress < 0 || progress >= 1) return 0;
  if (progress < 0.28) {
    const k = progress / 0.28;
    return 1 - (1 - k) * (1 - k);
  }
  if (progress < 0.42) return 1;
  const k = (progress - 0.42) / 0.58;
  return 1 - k * k * (3 - 2 * k);
}

/** How much a punching arm is in the fighting pose at all (eases in from, and back to, the animation). */
function armEnvelope(progress: number) {
  if (progress < 0 || progress >= 1) return 0;
  if (progress < 0.12) return progress / 0.12;
  if (progress > 0.8) return (1 - progress) / 0.2;
  return 1;
}

/**
 * Arm targets in body space, as fractions of the hero's height: (forward, out to
 * the arm's side, up) from the shoulder. Guard = fists by the chin, elbows tucked;
 * strike = fist straight out at chin height, elbow behind it.
 */
const ARM = {
  guardFist: [0.16, -0.075, -0.015],
  guardElbow: [0.04, 0.035, -0.15],
  strikeFist: [0.43, -0.065, -0.02],
  strikeElbow: [0.21, 0.012, -0.035],
  // Hook: elbow up and out to the side, fist swinging across in front of the face.
  hookFist: [0.3, -0.13, 0.0],
  hookElbow: [0.12, 0.17, -0.01],
  // Uppercut: elbow low and tucked, fist driving up past the chin.
  upperFist: [0.24, -0.05, 0.13],
  upperElbow: [0.1, 0.05, -0.12],
} as const;

const STRIKE_TARGETS = {
  jab: { fist: ARM.strikeFist, elbow: ARM.strikeElbow },
  cross: { fist: ARM.strikeFist, elbow: ARM.strikeElbow },
  hook: { fist: ARM.hookFist, elbow: ARM.hookElbow },
  uppercut: { fist: ARM.upperFist, elbow: ARM.upperElbow },
} as const;

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
  private v = { a: new Vector3(), b: new Vector3(), c: new Vector3(), target: new Vector3(), dir: new Vector3(), up: new Vector3(0, 1, 0), left: new Vector3(), elbow: new Vector3(), fist: new Vector3(), tmp: new Vector3() };
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

  /** A point in body space from the shoulder: forward, out to the arm's side, up (fractions of height). */
  private bodyPoint(out: Vector3, shoulder: Vector3, forward: Vector3, out_: Vector3, f: readonly [number, number, number], height: number) {
    return out.copy(shoulder).addScaledVector(forward, f[0] * height).addScaledVector(out_, f[1] * height).addScaledVector(this.v.up, f[2] * height);
  }

  /**
   * Fighting pose, like a boxer: `guard` (0..1) raises both fists to the chin;
   * each punch fires its fist straight out from the guard (elbow behind it) and
   * snaps back, with the torso turning and leaning into it. `forward` is the
   * body's facing (unit, world); `height` the hero's height in metres. Call
   * after the mixer has posed the skeleton.
   */
  applyFighting(forward: Vector3, height: number, guard: number, punches: PunchPose[]) {
    if (guard <= 0.001 && !punches.some((p) => armEnvelope(p.progress) > 0)) return;
    const up = this.v.up.set(0, 1, 0);
    // The body's left (model faces +Z, so up × forward points to its left hand).
    const left = this.v.left.crossVectors(up, forward).normalize();

    // Torso: turn the punching shoulder forward and lean into the blow.
    if (this.spine) {
      let twist = 0;
      let lean = 0;
      for (const p of punches) {
        const k = punchWeight(p.progress);
        twist += (p.side === 'right' ? -1 : 1) * p.twist * k;
        lean += p.lean * k;
      }
      lean += 0.08 * guard; // a slight forward crouch in guard
      if (twist) {
        this.q.full.setFromAxisAngle(up, twist);
        this.rotateWorld(this.spine, this.q.full);
      }
      if (lean) {
        this.v.dir.crossVectors(up, forward).normalize();
        this.q.full.setFromAxisAngle(this.v.dir, lean);
        this.rotateWorld(this.spine, this.q.full);
      }
    }

    for (const side of ['left', 'right'] as const) {
      const arm = this.arms[side];
      if (!arm.upper || !arm.fore || !arm.hand) continue;
      const punch = punches.find((p) => p.side === side && armEnvelope(p.progress) > 0);
      const k = punch ? punchWeight(punch.progress) : 0;
      const weight = Math.max(guard, punch ? armEnvelope(punch.progress) : 0);
      if (weight <= 0.001) continue;
      const out = this.v.tmp.copy(left).multiplyScalar(side === 'left' ? 1 : -1);
      const shoulder = arm.upper.getWorldPosition(this.v.c);
      const elbow = this.bodyPoint(this.v.elbow, shoulder, forward, out, ARM.guardElbow, height);
      const fist = this.bodyPoint(this.v.fist, shoulder, forward, out, ARM.guardFist, height);
      if (k > 0 && punch) {
        const t = STRIKE_TARGETS[punch.kind ?? 'jab'];
        elbow.lerp(this.bodyPoint(this.v.a, shoulder, forward, out, t.elbow, height), k);
        fist.lerp(this.bodyPoint(this.v.b, shoulder, forward, out, t.fist, height), k);
      }
      // Two-bone pose: upper arm to the elbow point, forearm to the fist.
      this.aim(arm.upper, arm.fore, elbow, weight);
      this.aim(arm.fore, arm.hand, fist, weight);
    }
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
