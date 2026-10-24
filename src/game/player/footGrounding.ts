import { Vector3, type Bone, type Object3D, type SkinnedMesh } from 'three';
import { canonicalBoneName } from './boneNames';

/** Foot/toe bones in Mixamo and Quaternius naming (canonical form). */
const FOOT_BONES = new Set([
  'LeftFoot',
  'LeftToeBase',
  'LeftToe_End',
  'RightFoot',
  'RightToeBase',
  'RightToe_End',
  'footL',
  'toeL',
  'footR',
  'toeR',
]);

/** Cap on sampled vertices per mesh (keeps per-frame CPU skinning cheap). */
const MAX_SAMPLES = 160;

/**
 * Finds the true lowest point of the character's feet each frame.
 *
 * At load it collects the vertices dominated by foot/toe bones; each frame it
 * CPU-skins just those (a few hundred) to get the sole height in the current
 * animation pose. Exact for any clip, rig or playback speed.
 */
export class FootSoles {
  private readonly sets: { mesh: SkinnedMesh; indices: number[] }[] = [];
  private readonly v = new Vector3();

  constructor(root: Object3D) {
    root.traverse((o) => {
      const mesh = o as SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const geo = mesh.geometry;
      const skinIndex = geo.attributes.skinIndex;
      const skinWeight = geo.attributes.skinWeight;
      const footBoneIdx = new Set(
        mesh.skeleton.bones.map((b: Bone, i: number) => (FOOT_BONES.has(canonicalBoneName(b.name)) ? i : -1)).filter((i) => i >= 0),
      );
      if (!footBoneIdx.size) return;
      const indices: number[] = [];
      for (let i = 0; i < geo.attributes.position.count; i++) {
        let best = 0;
        let bestW = -1;
        for (let k = 0; k < 4; k++) {
          const w = skinWeight.getComponent(i, k);
          if (w > bestW) {
            bestW = w;
            best = skinIndex.getComponent(i, k);
          }
        }
        if (footBoneIdx.has(best)) indices.push(i);
      }
      if (!indices.length) return;
      // Evenly thin out dense feet; soles are well covered by a subset.
      const stride = Math.max(1, Math.ceil(indices.length / MAX_SAMPLES));
      this.sets.push({ mesh, indices: indices.filter((_, j) => j % stride === 0) });
    });
  }

  get available() {
    return this.sets.length > 0;
  }

  /** Lowest foot vertex in world space. World matrices must be current. */
  lowestWorldY(): number {
    let min = Infinity;
    for (const { mesh, indices } of this.sets) {
      // Bone matrices are normally refreshed at render; the pose just changed.
      mesh.skeleton.update();
      for (const i of indices) {
        mesh.getVertexPosition(i, this.v).applyMatrix4(mesh.matrixWorld);
        if (this.v.y < min) min = this.v.y;
      }
    }
    return min;
  }
}

/**
 * Vertical correction (m) so the soles meet the ground, given the sole height
 * *without* correction relative to the ground (negative = sunk in).
 *
 * - Always lifts out of penetration immediately.
 * - With a planted foot (idle/walk) it also lowers to remove floating.
 * - During runs, feet legitimately leave the ground, so it only lifts.
 * - Releases smoothly so the body doesn't snap.
 */
export function nextFootLift(current: number, soleAboveGround: number, grounded: boolean, footPlanted: boolean, dt: number): number {
  if (!grounded) return current + (0 - current) * (1 - Math.exp(-dt / 0.1));
  const needed = -soleAboveGround; // lift that puts the lowest sole exactly on the ground
  const target = footPlanted ? Math.max(-0.12, needed) : Math.max(0, needed);
  if (target > current) return target;
  return current + (target - current) * (1 - Math.exp(-dt / 0.08));
}
