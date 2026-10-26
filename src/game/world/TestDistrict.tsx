import { CuboidCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { createBuildingMaterial } from './buildingMaterial';
import { generateCityLayout } from './cityLayout';
import { InstancedBoxes, type BoxInstance } from './InstancedBoxes';
import { TrainingPlaza } from './TrainingPlaza';
import { InstancedProps, type PropInstance } from './InstancedProps';
import { streetLampGeometry } from '../combat/liftShapes';
import { METRO_BAY } from '../../config/world';

/**
 * Phase 1 test district: a 5×5 block grid with streets, sidewalks, varied
 * buildings, rooftop units, a central landmark tower and a training plaza.
 * All geometry is instanced; colliders are simple cuboids on fixed bodies.
 */
export function TestDistrict() {
  const layout = useMemo(() => generateCityLayout(), []);
  const sh = layout.sidewalkHeight;

  const materials = useMemo(() => {
    const building = createBuildingMaterial();
    return {
      building: building.material,
      sidewalk: new MeshStandardMaterial({ color: 0x9a9b9c, roughness: 0.95 }),
      asphalt: new MeshStandardMaterial({ color: 0x4b4f56, roughness: 0.95 }),
      marking: new MeshStandardMaterial({ color: 0xd8d2b0, roughness: 0.8 }),
      roofUnit: new MeshStandardMaterial({ color: 0x7a7f86, roughness: 0.7, metalness: 0.3 }),
    };
  }, []);

  useEffect(
    () => () => {
      // Dispose GPU resources when the district unmounts (return to title, later: streaming).
      Object.values(materials).forEach((m) => m.dispose());
    },
    [materials],
  );

  const sidewalks: BoxInstance[] = useMemo(
    () =>
      layout.blocks.map((b) => ({
        position: [b.x, sh / 2, b.z],
        size: [b.size, sh, b.size],
      })),
    [layout, sh],
  );

  const buildings: BoxInstance[] = useMemo(
    () =>
      layout.buildings.map((b) => ({
        position: [b.x, sh + b.height / 2, b.z],
        size: [b.width, b.height, b.depth],
        color: b.color,
      })),
    [layout, sh],
  );

  const roofUnits: BoxInstance[] = useMemo(
    () =>
      layout.buildings
        .filter((b) => b.roofUnit)
        .map((b) => {
          const u = b.roofUnit!;
          return {
            position: [b.x + u.dx, sh + b.height + u.h / 2, b.z + u.dz],
            size: [u.w, u.h, u.d],
          };
        }),
    [layout, sh],
  );

  const dashes: BoxInstance[] = useMemo(() => {
    const out: BoxInstance[] = [];
    const span = layout.halfExtent - 4;
    for (const line of layout.streetLines) {
      for (let s = -span; s < span; s += 7) {
        out.push({
          position: line.axis === 'x' ? [line.offset, 0.02, s] : [s, 0.02, line.offset],
          size: line.axis === 'x' ? [0.25, 0.02, 3] : [3, 0.02, 0.25],
        });
      }
    }
    return out;
  }, [layout]);

  // Street lamps on block corners, arms out over the street. The hero can pull them up.
  const lampGeo = useMemo(() => streetLampGeometry(), []);
  useEffect(() => () => lampGeo.dispose(), [lampGeo]);
  const lamps: PropInstance[] = useMemo(() => {
    const out: PropInstance[] = [];
    for (const b of layout.blocks) {
      const o = b.size / 2 - 1;
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ]) {
        out.push({ x: b.x + sx * o, y: sh, z: b.z + sz * o, rotationY: Math.atan2(sx, sz) });
      }
    }
    return out;
  }, [layout, sh]);

  const landmark = layout.landmark;

  return (
    <group>
      {/* Ground: large asphalt plane; collider is a thick slab so nothing falls through. */}
      {/* The land ends at the quay walls of Metropolis Bay. */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={materials.asphalt}>
        <planeGeometry args={[METRO_BAY.landHalf * 2, METRO_BAY.landHalf * 2]} />
      </mesh>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[METRO_BAY.landHalf, 1, METRO_BAY.landHalf]} position={[0, -1, 0]} />
        {/* Sidewalk blocks: top at `sh`, extended 1 m into the ground. A 15 cm-thin slab made the
            character controller settle ~3 cm into it; a thick one is resolved precisely. */}
        {layout.blocks.map((b, i) => (
          <CuboidCollider key={`blk${i}`} args={[b.size / 2, 0.5, b.size / 2]} position={[b.x, sh - 0.5, b.z]} />
        ))}
        {buildings.map((b, i) => (
          <CuboidCollider
            key={`bld${i}`}
            args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]}
            position={b.position}
          />
        ))}
        {roofUnits.map((b, i) => (
          <CuboidCollider
            key={`roof${i}`}
            args={[b.size[0] / 2, b.size[1] / 2, b.size[2] / 2]}
            position={b.position}
          />
        ))}
        {/* Region edges are handled by the Player (exits travel on; other edges hold the hero back). */}
      </RigidBody>

      <InstancedBoxes items={sidewalks} material={materials.sidewalk} castShadow={false} />
      <InstancedBoxes items={buildings} material={materials.building} />
      <InstancedBoxes items={roofUnits} material={materials.roofUnit} />
      <InstancedBoxes items={dashes} material={materials.marking} castShadow={false} />
      <InstancedProps geometry={lampGeo} instances={lamps} lift={{ kind: 'streetLight' }} roughness={0.6} />

      {landmark && (
        <group position={[landmark.x, sh + landmark.height, landmark.z]}>
          {/* Landmark crown + beacon so the tower reads from anywhere in the district. */}
          <RigidBody type="fixed" colliders="cuboid">
            <mesh position={[0, 6, 0]} castShadow>
              <boxGeometry args={[14, 12, 14]} />
              <meshStandardMaterial color={0xb9bec6} roughness={0.5} metalness={0.4} />
            </mesh>
          </RigidBody>
          <mesh position={[0, 30, 0]}>
            <cylinderGeometry args={[0.4, 1.2, 36, 8]} />
            <meshStandardMaterial color={0x9aa0a8} metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 49, 0]}>
            <sphereGeometry args={[1.4, 16, 12]} />
            <meshStandardMaterial color={0xff5a4a} emissive={0xff2a1a} emissiveIntensity={4} />
          </mesh>
        </group>
      )}

      <TrainingPlaza sidewalkHeight={sh} />
    </group>
  );
}
