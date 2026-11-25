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
/**
 * Superman's punch (not a boxer's): one arm drives straight out at shoulder
 * height while the body turns its shoulder into it and leans far forward, the
 * opposite foot steps forward and the other fist pulls back to the hip.
 * Fractions of the hero's height; `SUPER.lean`/`twist` in radians at full extension.
 */
const SUPER = {
  /** Fist target: forward, out to the punching side, up — from the shoulder. */
  fist: [0.42, -0.04, -0.02],
  elbow: [0.2, 0.0, -0.01],
  /** Rear fist pulled back by the hip. */
  rearFist: [-0.08, 0.02, -0.26],
  rearElbow: [-0.1, 0.05, -0.14],
  twist: 0.62,
  lean: 0.42,
  /** Front leg steps forward (thigh swing, knee bend), rear leg pushes back (rad). */
  stepThigh: 0.55,
  stepKnee: 0.45,
  pushThigh: 0.3,
} as const;

/** Punch envelope: fast drive out (to 30 %), hold, ease back. */
function superEnvelope(progress: number) {
  if (progress < 0 || progress >= 1) return 0;
  if (progress < 0.3) {
    const t = progress / 0.3;
    return 1 - (1 - t) * (1 - t);
  }
  if (progress < 0.62) return 1;
  const t = (progress - 0.62) / 0.38;
  return 1 - t * t * (3 - 2 * t);
}

export class CombatPose {
  private head?: Object3D;
  private legs: Record<'left' | 'right', { thigh?: Object3D; shin?: Object3D }>;
  /** Finger chains per hand (base → tip) and the curl direction found in the rest pose. */
  private fingers: Record<'left' | 'right', { chains: Object3D[][]; thumb: Object3D[] | null; sign: number }>;
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
    this.legs = {
      left: { thigh: find('LeftUpLeg'), shin: find('LeftLeg') },
      right: { thigh: find('RightUpLeg'), shin: find('RightLeg') },
    };
    this.fingers = { left: this.findFingers(this.arms.left.hand), right: this.findFingers(this.arms.right.hand) };
  }

  /** Finger chains under a hand bone (any rig): each child chain up to 3 joints; the thumb is the one named thumb / "1". */
  private findFingers(hand?: Object3D) {
    const out = { chains: [] as Object3D[][], thumb: null as Object3D[] | null, sign: 1 };
    if (!hand) return out;
    for (const base of hand.children) {
      if (!(base as Bone).isBone) continue;
      // Skip palm/metacarpal bones: descend once if the child is a palm bone.
      let start: Object3D = base;
      if (/palm/i.test(base.name) && base.children[0]) start = base.children[0];
      const chain: Object3D[] = [];
      for (let b: Object3D | undefined = start; b && chain.length < 3 && (b as Bone).isBone && !/_end/i.test(b.name); b = b.children.find((c) => (c as Bone).isBone)) chain.push(b);
      if (chain.length < 2) continue;
      if (/thumb|finger_?1/i.test(chain[0].name)) out.thumb = chain;
      else out.chains.push(chain);
    }
    // Which way curls toward the palm: the sign that brings the fingertips nearer the wrist.
    const chain = out.chains[0];
    if (chain && chain.length >= 2) {
      const axis = this.knuckleAxis(out.chains, new Vector3());
      if (axis) {
        const tip = chain[chain.length - 1];
        const wrist = hand.getWorldPosition(new Vector3());
        const before = tip.getWorldPosition(new Vector3()).distanceTo(wrist);
        const saved = chain[0].quaternion.clone();
        this.rotateWorld(chain[0], new Quaternion().setFromAxisAngle(axis, 0.8));
        const after = tip.getWorldPosition(new Vector3()).distanceTo(wrist);
        chain[0].quaternion.copy(saved);
        chain[0].updateWorldMatrix(false, true);
        out.sign = after < before ? 1 : -1;
      }
    }
    return out;
  }

  /** Axis across the knuckles (first finger base → last), or null. */
  private knuckleAxis(chains: Object3D[][], out: Vector3) {
    if (chains.length < 2) return null;
    const a = chains[0][0].getWorldPosition(this.v.a);
    const b = chains[chains.length - 1][0].getWorldPosition(this.v.b);
    out.copy(b).sub(a);
    return out.lengthSq() > 1e-10 ? out.normalize() : null;
  }

  /** Curls the fingers into fists (0..1). Call after the mixer has posed the skeleton. */
  makeFists(weight: number) {
    if (weight <= 0.001) return;
    for (const side of ['left', 'right'] as const) {
      const f = this.fingers[side];
      const axis = this.knuckleAxis(f.chains, this.v.target);
      if (!axis) continue;
      axis.multiplyScalar(f.sign);
      const q = this.q.full;
      for (const chain of f.chains) {
        chain.forEach((b, i) => {
          q.setFromAxisAngle(axis, weight * (i === 0 ? 1.35 : 1.5));
          this.rotateWorld(b, q);
        });
      }
      if (f.thumb) {
        q.setFromAxisAngle(axis, weight * 0.6);
        this.rotateWorld(f.thumb[0], q);
      }
    }
  }

  /**
   * Superman's punch on the `side` arm at `progress` (0..1): a straight drive with
   * the whole body behind it. `power` (0..1+) deepens the lean for heavy blows.
   */
  applySuperPunch(forward: Vector3, height: number, side: 'left' | 'right', progress: number, power = 0) {
    const k = superEnvelope(progress);
    if (k <= 0.001) return;
    const up = this.v.up.set(0, 1, 0);
    const left = this.v.left.crossVectors(up, forward).normalize();
    const sideSign = side === 'left' ? 1 : -1;
    const lean = SUPER.lean * (1 + power * 0.5);

    // Legs first (they move the body): the opposite foot steps forward, the punching side pushes back.
    const front = this.legs[side === 'left' ? 'right' : 'left'];
    const rear = this.legs[side];
    if (front.thigh) this.rotateWorld(front.thigh, this.q.full.setFromAxisAngle(left, -SUPER.stepThigh * k));
    if (front.shin) this.rotateWorld(front.shin, this.q.full.setFromAxisAngle(left, SUPER.stepKnee * k));
    if (rear.thigh) this.rotateWorld(rear.thigh, this.q.full.setFromAxisAngle(left, SUPER.pushThigh * k));

    // Torso: punching shoulder forward, deep lean into the blow.
    if (this.spine) {
      this.rotateWorld(this.spine, this.q.full.setFromAxisAngle(up, -sideSign * SUPER.twist * k));
      this.rotateWorld(this.spine, this.q.full.setFromAxisAngle(left, lean * k));
    }

    // Punching arm straight out; the other fist pulled back to the hip.
    for (const s of ['left', 'right'] as const) {
      const arm = this.arms[s];
      if (!arm.upper || !arm.fore || !arm.hand) continue;
      const out = this.v.tmp.copy(left).multiplyScalar(s === 'left' ? 1 : -1);
      const shoulder = arm.upper.getWorldPosition(this.v.c);
      const striking = s === side;
      const elbow = this.bodyPoint(this.v.elbow, shoulder, forward, out, striking ? SUPER.elbow : SUPER.rearElbow, height);
      const fist = this.bodyPoint(this.v.fist, shoulder, forward, out, striking ? SUPER.fist : SUPER.rearFist, height);
      this.aim(arm.upper, arm.fore, elbow, k);
      this.aim(arm.fore, arm.hand, fist, k);
    }
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

  /**
   * Holding a club in the right hand: the arm follows the club's angle above
   * forward-horizontal `angle` (rad) — up over the shoulder at rest, chopping
   * forward-down in a swing — with the body turning into the chop.
   */
  applyClub(forward: Vector3, height: number, angle: number) {
    const arm = this.arms.right;
    if (!arm.upper || !arm.fore || !arm.hand) return;
    const up = this.v.up.set(0, 1, 0);
    const left = this.v.left.crossVectors(up, forward).normalize();
    // How far into the chop (0 at rest overhead, 1 at the bottom): the torso leans and turns with it.
    const chop = Math.max(0, Math.min(1, (1.95 - angle) / 2.4));
    if (this.spine && chop > 0) {
      this.rotateWorld(this.spine, this.q.full.setFromAxisAngle(up, 0.5 * chop));
      this.rotateWorld(this.spine, this.q.full.setFromAxisAngle(left, 0.35 * chop));
    }
    const shoulder = arm.upper.getWorldPosition(this.v.c);
    const dir = this.v.dir.copy(forward).multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
    // Fist out along the club's direction, a little forward and to the right of the shoulder.
    const fist = this.v.fist.copy(shoulder).addScaledVector(dir, 0.2 * height).addScaledVector(forward, 0.08 * height).addScaledVector(left, -0.04 * height);
    const elbow = this.v.elbow.copy(shoulder).lerp(fist, 0.5).addScaledVector(up, -0.06 * height).addScaledVector(left, -0.05 * height);
    this.aim(arm.upper, arm.fore, elbow, 1);
    this.aim(arm.fore, arm.hand, fist, 1);
  }

  /** World position of a hand (false if the rig has none). */
  handPosition(side: 'left' | 'right', out: Vector3): boolean {
    const hand = this.arms[side].hand;
    if (!hand) return false;
    hand.getWorldPosition(out);
    return true;
  }

  /** Midpoint between the eyes (world), or false if the rig has no head bone. */
  eyes(out: Vector3, forward: Vector3, up: Vector3, height: number): boolean {
    if (!this.head) return false;
    this.head.getWorldPosition(out);
    out.addScaledVector(up, 0.05 * height).addScaledVector(forward, 0.05 * height);
    return true;
  }
}
