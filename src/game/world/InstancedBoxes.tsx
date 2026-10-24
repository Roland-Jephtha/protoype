import { useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { BoxGeometry, Color, InstancedMesh, Matrix4, Quaternion, Vector3, type Material } from 'three';

export interface BoxInstance {
  /** Centre of the box. */
  position: [number, number, number];
  size: [number, number, number];
  color?: number;
  rotationY?: number;
}

/** Shared unit cube; instances are scaled to size. */
const unitBox = new BoxGeometry(1, 1, 1);

/**
 * Renders many boxes as one InstancedMesh (one draw call). Used for buildings,
 * sidewalks, rooftop units and other repeated static geometry.
 */
export function InstancedBoxes({
  items,
  material,
  castShadow = true,
  receiveShadow = true,
  meshRef,
}: {
  items: BoxInstance[];
  material: Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
  /** Optional handle to the instanced mesh (e.g. to recolour instances later). */
  meshRef?: MutableRefObject<InstancedMesh | null>;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (meshRef) meshRef.current = ref.current;
  });
  const hasColors = useMemo(() => items.some((i) => i.color !== undefined), [items]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    const up = new Vector3(0, 1, 0);
    const c = new Color();
    items.forEach((it, i) => {
      p.set(...it.position);
      s.set(...it.size);
      q.setFromAxisAngle(up, it.rotationY ?? 0);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      if (hasColors) mesh.setColorAt(i, c.set(it.color ?? 0xffffff));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }, [items, hasColors]);

  return (
    <instancedMesh
      ref={ref}
      args={[unitBox, material, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      // Instanced bounds are computed above, so frustum culling is safe.
      frustumCulled
    />
  );
}
