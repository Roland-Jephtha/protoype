import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type Group } from 'three';
import { LIFT } from '../../config/combat';
import { liftSources, type LiftCandidate, type LiftSource } from '../combat/liftables';
import type { PropKind } from '../combat/liftShapes';

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

/** Makes a prop field liftable: what kind it is, and each instance's collider (switched off while it's taken). */
export interface PropLift {
  kind: PropKind;
  colliderOf?: (index: number) => RAPIER.Collider | undefined;
}

const LIFT_CELL = 8;
const ZERO = new Matrix4().makeScale(0, 0, 0);

function composeInstance(it: PropInstance, m: Matrix4) {
  const s = Array.isArray(it.scale) ? new Vector3(...it.scale) : new Vector3().setScalar(it.scale ?? 1);
  return m.compose(new Vector3(it.x, it.y, it.z), new Quaternion().setFromEuler(new Euler(it.tiltX ?? 0, it.rotationY ?? 0, it.tiltZ ?? 0)), s);
}

const uniformScale = (it: PropInstance) => (Array.isArray(it.scale) ? (it.scale[0] + it.scale[1] + it.scale[2]) / 3 : (it.scale ?? 1));

/**
 * Renders many copies of one prop geometry as instanced meshes, split into a
 * coarse spatial grid (`cellSize` m) so whole groups are frustum-culled, and
 * groups beyond `maxDistance` from the camera are hidden entirely. With
 * `lift`, the hero can pull any of them up (it disappears from here until it
 * grows back / is replaced, `LIFT.respawnDelay` later).
 */
export function InstancedProps({
  geometry,
  instances,
  cellSize = 800,
  maxDistance = Infinity,
  castShadow = true,
  receiveShadow = true,
  roughness = 0.9,
  lift,
}: {
  geometry: BufferGeometry;
  instances: PropInstance[];
  cellSize?: number;
  maxDistance?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
  roughness?: number;
  lift?: PropLift;
}) {
  const material = useMemo(() => new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, flatShading: true }), [roughness]);
  useEffect(() => () => material.dispose(), [material]);

  // Groups of instances, and where each instance lives (group, slot) so a lifted one can be hidden.
  const { groups, where } = useMemo(() => {
    const map = new Map<string, PropInstance[]>();
    const where: [number, number][] = [];
    const order: string[] = [];
    for (const it of instances) {
      const key = `${Math.floor(it.x / cellSize)},${Math.floor(it.z / cellSize)}`;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
        order.push(key);
      }
      where.push([order.indexOf(key), list.length]);
      list.push(it);
    }
    return { groups: order.map((k) => map.get(k)!), where };
  }, [instances, cellSize]);
  const meshes = useRef<(InstancedMesh | null)[]>([]);

  // Lifting: a spatial hash for nearest-prop queries; taken props come back later.
  const liftState = useRef<{ taken: Map<number, number>; clock: number }>({ taken: new Map(), clock: 0 });
  const restoreRef = useRef<((i: number) => void) | null>(null);
  const kind = lift?.kind;
  const colliderOf = useRef(lift?.colliderOf);
  useEffect(() => {
    colliderOf.current = lift?.colliderOf;
  });
  useEffect(() => {
    if (!kind) return;
    const grid = new Map<string, number[]>();
    instances.forEach((it, i) => {
      const key = `${Math.floor(it.x / LIFT_CELL)},${Math.floor(it.z / LIFT_CELL)}`;
      const list = grid.get(key);
      if (list) list.push(i);
      else grid.set(key, [i]);
    });
    const st = liftState.current;
    const setVisible = (i: number, visible: boolean) => {
      const [g, slot] = where[i];
      const mesh = meshes.current[g];
      if (mesh) {
        mesh.setMatrixAt(slot, visible ? composeInstance(instances[i], new Matrix4()) : ZERO);
        mesh.instanceMatrix.needsUpdate = true;
      }
      colliderOf.current?.(i)?.setEnabled(visible);
    };
    const source: LiftSource = {
      nearest: (x, y, z, maxDistance) => {
        let best: LiftCandidate | null = null;
        const r = Math.ceil(maxDistance / LIFT_CELL);
        const cx = Math.floor(x / LIFT_CELL);
        const cz = Math.floor(z / LIFT_CELL);
        for (let gx = cx - r; gx <= cx + r; gx++) {
          for (let gz = cz - r; gz <= cz + r; gz++) {
            for (const i of grid.get(`${gx},${gz}`) ?? []) {
              if (st.taken.has(i)) continue;
              const it = instances[i];
              const s = uniformScale(it);
              // Distance to the prop's side (trunk / rock surface), and to its height span.
              const dy = Math.max(0, it.y - y, y - (it.y + 4 * s));
              const d = Math.hypot(Math.max(0, Math.hypot(it.x - x, it.z - z) - 0.6 * s), dy);
              if (d <= maxDistance && (!best || d < best.distance)) {
                const tint = it.tint ?? 0xffffff;
                best = { source, key: i, type: kind, paint: `#${tint.toString(16).padStart(6, '0')}`, scale: s, x: it.x, y: it.y, z: it.z, yaw: it.rotationY ?? 0, distance: d };
              }
            }
          }
        }
        return best;
      },
      take: (key) => {
        st.taken.set(key, st.clock + LIFT.respawnDelay);
        setVisible(key, false);
      },
    };
    liftSources.add(source);
    const restore = (i: number) => setVisible(i, true);
    restoreRef.current = restore;
    return () => {
      liftSources.delete(source);
      restoreRef.current = null;
      st.taken.clear();
    };
  }, [kind, instances, where]);
  // Taken props come back after a while (checked about once a second).
  useFrame((_, dt) => {
    const st = liftState.current;
    if (!st.taken.size) return;
    const before = Math.floor(st.clock);
    st.clock += Math.min(dt, 0.05);
    if (Math.floor(st.clock) === before) return;
    for (const [i, at] of st.taken) {
      if (st.clock < at) continue;
      st.taken.delete(i);
      restoreRef.current?.(i);
    }
  });

  return (
    <>
      {groups.map((items, i) => (
        <PropGroup
          key={i}
          meshRef={(m) => void (meshes.current[i] = m)}
          geometry={geometry}
          material={material}
          items={items}
          maxDistance={maxDistance}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
        />
      ))}
    </>
  );
}

function PropGroup({
  meshRef,
  geometry,
  material,
  items,
  maxDistance,
  castShadow,
  receiveShadow,
}: {
  meshRef: (mesh: InstancedMesh | null) => void;
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
    const col = new Color();
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, composeInstance(it, m));
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
      <instancedMesh
        ref={(m) => {
          ref.current = m;
          meshRef(m);
        }}
        args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow={receiveShadow} frustumCulled />
    </group>
  );
}