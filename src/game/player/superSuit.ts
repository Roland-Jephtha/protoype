import { BufferAttribute, Color, MeshStandardMaterial, Vector3, type Object3D, type SkinnedMesh } from 'three';

/**
 * Restyles an untextured humanoid mannequin into an original "super suit" by
 * writing per-vertex colours from each vertex's dominant bone and its
 * normalized bind-pose height: blue suit, red boots and trunks, gold belt,
 * skin on head/hands, dark hair. No textures or licensed artwork involved.
 */
const COLORS = {
  suit: new Color(0x1d4fc4),
  red: new Color(0xc0182a),
  gold: new Color(0xe7b52c),
  skin: new Color(0xe0b192),
  hair: new Color(0x16181d),
};

export type SuitRegion = keyof typeof COLORS;

export interface ModelMeasurements {
  /** Bind-pose height in the model's own units. */
  height: number;
  minY: number;
  /** Front (max z) / back (min z) of the upper torso near the centreline. */
  chestFrontZ: number;
  backZ: number;
}

/** Region picker. `ny` = 0 at the feet, 1 at the top of the head. */
export function suitRegion(bone: string, ny: number): SuitRegion {
  const b = bone.toLowerCase();
  if (b.includes('head')) return ny > 0.955 ? 'hair' : 'skin';
  if (b.includes('neck')) return 'skin';
  if (b.includes('hand') || b.includes('f_') || b.includes('thumb') || b.includes('finger')) return 'skin';
  if (b.includes('foot') || b.includes('toe')) return 'red';
  if (b.includes('shin') || b.includes('calf')) return ny < 0.235 ? 'red' : 'suit';
  if (ny >= 0.535 && ny < 0.56 && (b.includes('hips') || b.includes('spine') || b.includes('pelvis'))) return 'gold';
  if (b.includes('hips') || b.includes('pelvis')) return ny < 0.535 ? 'red' : 'suit';
  if (b.includes('thigh')) return ny >= 0.47 ? 'red' : 'suit';
  return 'suit';
}

function skinnedMeshes(root: Object3D) {
  const out: SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) out.push(o as SkinnedMesh);
  });
  return out;
}

/** Measures the bind pose (skinned positions at rest) in `root` space. Call with root at identity. */
export function measureModel(root: Object3D): ModelMeasurements {
  root.updateMatrixWorld(true);
  const v = new Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  const meshes = skinnedMeshes(root);
  const visit = (fn: (p: Vector3) => void) => {
    for (const m of meshes) {
      const n = m.geometry.attributes.position.count;
      for (let i = 0; i < n; i++) fn(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld));
    }
  };
  visit((p) => {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const height = Math.max(maxY - minY, 1e-3);
  let chestFrontZ = -Infinity;
  let backZ = Infinity;
  visit((p) => {
    const ny = (p.y - minY) / height;
    if (Math.abs(p.x) < 0.08 * height && ny > 0.7 && ny < 0.8) {
      chestFrontZ = Math.max(chestFrontZ, p.z);
      backZ = Math.min(backZ, p.z);
    }
  });
  return {
    height,
    minY,
    chestFrontZ: Number.isFinite(chestFrontZ) ? chestFrontZ : 0.08 * height,
    backZ: Number.isFinite(backZ) ? backZ : -0.08 * height,
  };
}

/** Writes suit vertex colours and assigns one shared material. Returns it for disposal. */
export function applySuperSuit(root: Object3D, m: ModelMeasurements): MeshStandardMaterial {
  root.updateMatrixWorld(true);
  const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.08 });
  const v = new Vector3();
  for (const mesh of skinnedMeshes(root)) {
    const geo = mesh.geometry;
    const n = geo.attributes.position.count;
    const skinIndex = geo.attributes.skinIndex;
    const skinWeight = geo.attributes.skinWeight;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
      const ny = (v.y - m.minY) / m.height;
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > bestW) {
          bestW = w;
          best = skinIndex.getComponent(i, k);
        }
      }
      const c = COLORS[suitRegion(mesh.skeleton.bones[best]?.name ?? '', ny)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    mesh.material = material;
  }
  return material;
}
