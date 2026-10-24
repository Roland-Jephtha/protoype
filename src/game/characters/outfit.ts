import { BufferAttribute, Color, MeshStandardMaterial, Vector3, type Object3D, type SkinnedMesh } from 'three';
import { mulberry32 } from '../world/cityLayout';

/**
 * Per-person outfits for civilians built from the shared CC0 mannequin.
 *
 * Each vertex gets an "outfit slot" (skin, top, bottoms, shoes, hair) from its
 * dominant bone and height — computed once per shared geometry. Each person
 * then gets their own small material whose palette uniform colours those
 * slots, so dozens of people share one model but all look different.
 */

export const SLOT = { skin: 0, top: 1, bottoms: 2, shoes: 3, hair: 4 } as const;
export type Palette = [Color, Color, Color, Color, Color];

/** Slot for a vertex. `ny` = 0 at the feet, 1 at the top of the head. Exported for tests. */
export function outfitSlot(bone: string, ny: number): number {
  const b = bone.toLowerCase();
  if (b.includes('head')) return ny > 0.95 ? SLOT.hair : SLOT.skin;
  if (b.includes('neck') || b.includes('hand') || b.includes('f_') || b.includes('thumb') || b.includes('finger')) return SLOT.skin;
  if (b.includes('foot') || b.includes('toe')) return SLOT.shoes;
  if (b.includes('shin') || b.includes('calf') || b.includes('thigh')) return ny < 0.07 ? SLOT.shoes : SLOT.bottoms;
  if (b.includes('hips') || b.includes('pelvis')) return ny < 0.5 ? SLOT.bottoms : SLOT.top;
  if (b.includes('forearm')) return SLOT.top;
  return SLOT.top;
}

const prepared = new WeakSet<object>();

/** Writes the `aSlot` attribute onto the model's (shared) skinned geometries, once. */
export function prepareOutfitSlots(root: Object3D) {
  root.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as SkinnedMesh).isSkinnedMesh) meshes.push(o as SkinnedMesh);
  });
  const v = new Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (const m of meshes) {
    for (let i = 0; i < m.geometry.attributes.position.count; i++) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  const height = maxY - minY || 1;
  for (const m of meshes) {
    const geo = m.geometry;
    if (prepared.has(geo)) continue;
    const n = geo.attributes.position.count;
    const slots = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld);
      let best = 0;
      let bestW = -1;
      for (let k = 0; k < 4; k++) {
        const w = geo.attributes.skinWeight.getComponent(i, k);
        if (w > bestW) {
          bestW = w;
          best = geo.attributes.skinIndex.getComponent(i, k);
        }
      }
      slots[i] = outfitSlot(m.skeleton.bones[best]?.name ?? '', (v.y - minY) / height);
    }
    geo.setAttribute('aSlot', new BufferAttribute(slots, 1));
    prepared.add(geo);
  }
}

/** A material that colours outfit slots from its own palette. */
export function createOutfitMaterial(palette: Palette) {
  const material = new MeshStandardMaterial({ roughness: 0.75, metalness: 0 });
  const uniforms = { uPalette: { value: palette } };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aSlot;\nuniform vec3 uPalette[5];\nvarying vec3 vOutfit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOutfit = uPalette[int(aSlot + 0.5)];');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOutfit;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vOutfit;');
  };
  material.customProgramCacheKey = () => 'krypton-outfit';
  return material;
}

const SKIN = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a26'];
const HAIR = ['#1b1612', '#3b2a1e', '#6b4a2b', '#a77a45', '#c9c2b8', '#2a2a2e'];
const TOPS = ['#2f5d9e', '#b03a3a', '#e3e0d6', '#3f6b3a', '#d9a23b', '#6a3f8f', '#2b2b30', '#e07a5f', '#4a7a8c', '#8c8c8c'];
const BOTTOMS = ['#2a2f3a', '#3d4a5c', '#4a3b2c', '#1e1e22', '#6b6b6b', '#2e4a6b'];
const SHOES = ['#1a1a1a', '#5a3a22', '#e8e8e8', '#7a2a2a'];

/** A random but deterministic civilian palette. */
export function randomPalette(seed: number, overrides: Partial<Record<keyof typeof SLOT, string>> = {}): Palette {
  const r = mulberry32(seed);
  const pick = (list: string[]) => list[Math.floor(r() * list.length)];
  return [
    new Color(overrides.skin ?? pick(SKIN)),
    new Color(overrides.top ?? pick(TOPS)),
    new Color(overrides.bottoms ?? pick(BOTTOMS)),
    new Color(overrides.shoes ?? pick(SHOES)),
    new Color(overrides.hair ?? pick(HAIR)),
  ];
}
