import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type Group } from 'three';

export interface PropInstance {
  x: number;
  y: number;
  z: number;
  rotationY?: number;
  /** Uniform scale or [x, y, z]. */
  scale?: number | [number, number, number];
  /** Tint multiplied with the geometry's vertex colours. */
  tint?: number;
  /** Extra tilt (rad) around X/Z for rocks. */
  tiltX?: number;
  tiltZ?: number;
}

/**
 * Renders many copies of one prop geometry as instanced meshes, split into a
 * coarse spatial grid (`cellSize` m) so whole groups are frustum-culled, and
 * groups beyond `maxDistance` from the camera are hidden entirely.
 */
export function InstancedProps({
  geometry,
  instances,
  cellSize = 800,
  maxDistance = Infinity,
  castShadow = true,
  receiveShadow = true,
  roughness = 0.9,
}: {
  geometry: BufferGeometry;
  instances: PropInstance[];
  cellSize?: number;
  maxDistance?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  roughness?: number;
}) {
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, flatShading: true }), [roughness]);
  useEffect(() => () => material.dispose(), [material]);

  const groups = useMemo(() => {
    const map = new Map<string, PropInstance[]>();
    for (const it of instances) {
      const key = `${Math.floor(it.x / cellSize)},${Math.floor(it.z / cellSize)}`;
      const list = map.get(key);
      if (list) list.push(it);
      else map.set(key, [it]);
    }
    return [...map.values()];
  }, [instances, cellSize]);

  return (
    <>
      {groups.map((items, i) => (
        <PropGroup key={i} geometry={geometry} material={material} items={items} maxDistance={maxDistance} castShadow={castShadow} receiveShadow={receiveShadow} />
      ))}
    </>
  );
}

function PropGroup({
  geometry,
  material,
  items,
  maxDistance,
  castShadow,
  receiveShadow,
}: {
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  items: PropInstance[];
  maxDistance: number;
  castShadow: boolean;
  receiveShadow: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  const wrapper = useRef<Group>(null);
  const centre = useMemo(() => {
    const c = new Vector3();
    items.forEach((it) => c.add(new Vector3(it.x, it.y, it.z)));
    return c.divideScalar(items.length || 1);
  }, [items]);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const p = new Vector3();
    const s = new Vector3();
    const col = new Color();
    items.forEach((it, i) => {
      p.set(it.x, it.y, it.z);
      e.set(it.tiltX ?? 0, it.rotationY ?? 0, it.tiltZ ?? 0);
      q.setFromEuler(e);
      if (Array.isArray(it.scale)) s.set(...it.scale);
      else s.setScalar(it.scale ?? 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, col.set(it.tint ?? 0xffffff));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items]);

  // Hide whole groups far beyond the fog (cheap distance culling, checked ~6×/s).
  const tick = useRef(0);
  useFrame(({ camera }, dt) => {
    tick.current += dt;
    if (tick.current < 0.16 || !wrapper.current || !Number.isFinite(maxDistance)) return;
    tick.current = 0;
    const radius = ref.current?.boundingSphere?.radius ?? 0;
    wrapper.current.visible = camera.position.distanceTo(centre) - radius < maxDistance;
  });

  return (
    <group ref={wrapper}>
      <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled />
    </group>
  );
}