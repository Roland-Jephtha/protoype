import { Quaternion, Vector3, type Bone, type Object3D } from 'three';
import { canonicalBoneName } from './boneNames';

/** Cape tuning: how far the cape swings back (rad) standing / at full run / in flight (the body is horizontal then, so the cape already trails), and its flutter. */
const CAPE = {
  rest: 0.05,
  run: 0.75,
  flight: 0.3,
  /** Speed (m/s) at which the run swing is reached. */
  fullSpeed: 14,
  /** Each lower segment curls a bit more (fraction of the swing). */
  curl: 0.12,
  flutter: 0.12,
  sharpness: 6,
};

/**
 * Drives a model's own skinned cape (chains of bones like "cape_left_1a … 1f")
 * procedurally: it hangs at rest, swings back with speed and streams behind in
 * flight, with a flutter down each chain. Call after the mixer has posed the
 * skeleton (the mixer doesn't touch cape bones, so their rest pose is restored
 * here every frame).
 */
export class CapeBones {
  private readonly chains: { bones: Bone[]; rest: Quaternion[]; phase: number }[] = [];
  private swing = CAPE.rest;
  private time = 0;
  private readonly q = { delta: new Quaternion(), parent: new Quaternion(), inv: new Quaternion() };

  constructor(model: Object3D) {
    const byChain = new Map<string, Bone[]>();
    model.traverse((o) => {
      const b = o as Bone;
      if (!b.isBone) return;
      const m = /^cape_(left|middle|right)_(\d)([a-f])$/i.exec(canonicalBoneName(b.name));
      if (!m) return;
      const key = `${m[1]} ${m[2]}`;
      const list = byChain.get(key) ?? [];
      list.push(b);
      byChain.set(key, list);
    });
    let i = 0;
    for (const bones of byChain.values()) {
      bones.sort((a, b) => canonicalBoneName(a.name).localeCompare(canonicalBoneName(b.name)));
      this.chains.push({ bones, rest: bones.map((b) => b.quaternion.clone()), phase: i++ * 1.7 });
    }
  }

  get available() {
    return this.chains.length > 0;
  }

  /** `left` = the body's left axis (world); swings rotate the cape back about it. */
  update(dt: number, speed: number, flying: boolean, left: Vector3) {
    if (!this.chains.length) return;
    this.time += dt;
    const target = flying ? CAPE.flight : CAPE.rest + (CAPE.run - CAPE.rest) * Math.min(1, speed / CAPE.fullSpeed);
    this.swing += (target - this.swing) * Math.min(1, dt * CAPE.sharpness);
    const flutterAmp = CAPE.flutter * Math.min(1, 0.2 + speed / CAPE.fullSpeed);
    for (const c of this.chains) {
      c.bones.forEach((b, i) => {
        b.quaternion.copy(c.rest[i]);
        const flutter = Math.sin(this.time * (6 + speed * 0.3) + c.phase + i * 0.9) * flutterAmp;
        const angle = i === 0 ? this.swing + flutter * 0.5 : this.swing * CAPE.curl + flutter;
        this.rotateWorld(b, left, angle);
      });
    }
  }

  private rotateWorld(bone: Bone, axis: Vector3, angle: number) {
    const { delta, parent, inv } = this.q;
    delta.setFromAxisAngle(axis, angle);
    if (bone.parent) bone.parent.getWorldQuaternion(parent);
    else parent.identity();
    inv.copy(parent).invert().multiply(delta).multiply(parent);
    bone.quaternion.premultiply(inv);
    bone.updateWorldMatrix(false, true);
  }
}
