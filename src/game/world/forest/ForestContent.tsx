import { useEffect, useMemo } from 'react';
import { DoubleSide, MeshStandardMaterial } from 'three';
import { OUTDOOR_DENSITY } from '../../../config/regions';
import { useSettings } from '../../../state/settings';
import { mulberry32 } from '../cityLayout';
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes';
import { InstancedProps, type PropInstance } from '../InstancedProps';
import { broadleafGeometry, coniferGeometry, nearPath, pointsAlong, ribbonGeometry, rockGeometry, scatter } from '../propGeometries';
import { useTerrain } from '../terrainContext';
import { createNoise2D, type ForestParams } from '../terrainNoise';
import { useStaticColliders } from '../useStaticColliders';

/**
 * Blackwood Forest dressing: dense woods (conifer + broadleaf), rocks, the
 * river surface, rail line, dam, ranger tower, cabins and the prologue crash site.
 */
export function ForestContent() {
  const t = useTerrain();
  const p = t.region.terrain as ForestParams;
  const quality = useSettings((s) => s.graphicsQuality);
  const density = OUTDOOR_DENSITY[quality];

  const geo = useMemo(() => ({ conifer: coniferGeometry(), broadleaf: broadleafGeometry(), rock: rockGeometry(57) }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const { conifers, broadleaves, rocks, outer } = useMemo(() => {
    const rand = mulberry32(p.seed + 3);
    const forestMask = createNoise2D(p.seed + 77);
    const clear = (x: number, z: number) =>
      !nearPath(p.river, x, z, p.river.width / 2 + 10) &&
      !nearPath(p.rail, x, z, p.rail.width / 2 + 6) &&
      p.flats.every((f) => Math.hypot(x - f.x, z - f.z) > f.radius + 6) &&
      t.slope(x, z) < 0.35;
    // Woods are dense in patches (noise mask), with open meadows between.
    const wooded = (x: number, z: number) => forestMask(x / 350, z / 350) > -0.45 + rand() * 0.3;
    const pts = scatter(rand, t.size - 40, Math.round(16000 * density), (x, z) => clear(x, z) && wooded(x, z), Math.round(16000 * density) * 6);
    const conifers: PropInstance[] = [];
    const broadleaves: PropInstance[] = [];
    for (const [x, z] of pts) {
      const s = 1 + rand() * 0.9;
      const inst: PropInstance = { x, y: t.ground(x, z) - 0.2, z, scale: [s, s * (0.85 + rand() * 0.35), s], rotationY: rand() * 6.28, tint: rand() < 0.5 ? 0xffffff : rand() < 0.5 ? 0xd8e6c8 : 0xc8d8b0 };
      // Higher ground favours conifers.
      (t.ground(x, z) > 18 + forestMask(x / 90, z / 90) * 12 ? conifers : broadleaves).push(inst);
    }
    const rocks = scatter(rand, t.size - 40, Math.round(500 * density), (x, z) => !nearPath(p.river, x, z, p.river.width / 2 + 4)).map(([x, z]) => {
      const s = 0.5 + rand() ** 2 * 3;
      return { x, y: t.ground(x, z) - s * 0.3, z, scale: [s, s * 0.7, s * 1.1] as [number, number, number], rotationY: rand() * 6.28, tint: 0x9a968e };
    });
    // Scenery trees beyond the playable edge (no colliders), so the forest doesn't
    // stop at a visible line when flying high.
    const half = t.size / 2;
    const outer = scatter(rand, t.size + 900, Math.round(5000 * density), (x, z) => Math.max(Math.abs(x), Math.abs(z)) > half + 4 && wooded(x, z)).map(([x, z]) => {
      const s = 1 + rand() * 0.9;
      return { x, y: t.height(x, z) - 0.8, z, scale: s, rotationY: rand() * 6.28, tint: rand() < 0.5 ? 0xffffff : 0xd0dfc0 };
    });
    return { conifers, broadleaves, rocks, outer };
  }, [t, p, density]);

  // Trunks block the hero (thousands of static cylinders — fine for Rapier's BVH).
  useStaticColliders(
    (rapier) =>
      [...conifers, ...broadleaves].map((tr) => {
        const s = (tr.scale as [number, number, number])[0];
        return rapier.ColliderDesc.cylinder(2, 0.35 * s).setTranslation(tr.x, tr.y + 2, tr.z);
      }),
    [conifers, broadleaves],
  );

  const draw = t.region.look.fog.far * 1.15;
  return (
    <group>
      <InstancedProps geometry={geo.conifer} instances={conifers} maxDistance={draw} cellSize={600} />
      <InstancedProps geometry={geo.broadleaf} instances={broadleaves} maxDistance={draw} cellSize={600} />
      <InstancedProps geometry={geo.rock} instances={rocks} maxDistance={draw * 0.7} />
      <InstancedProps geometry={geo.conifer} instances={outer} maxDistance={draw} cellSize={900} castShadow={false} />
      <River />
      <Railway />
      <Dam />
      <Landmarks />
    </group>
  );
}

/** Water surface following the carved river bed. */
function River() {
  const t = useTerrain();
  const p = t.region.terrain as ForestParams;
  const geo = useMemo(() => {
    // Water level: bed height at the centre line + 2.2 m, flat across the channel.
    const waterAt = (x: number, z: number) => t.ground(x, z) + 2.2;
    return ribbonGeometry(p.river, p.river.width + 18, waterAt, 0, 6, true);
  }, [t, p]);
  const material = useMemo(() => new MeshStandardMaterial({ color: '#2b5662', roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.85, side: DoubleSide }), []);
  useEffect(
    () => () => {
      geo.dispose();
      material.dispose();
    },
    [geo, material],
  );
  return <mesh geometry={geo} material={material} receiveShadow />;
}

/** Ballast bed, sleepers and rails along the flattened rail band. */
function Railway() {
  const t = useTerrain();
  const p = t.region.terrain as ForestParams;
  const bed = useMemo(() => ribbonGeometry(p.rail, 4.5, t.ground, 0.18, 4), [t, p]);
  const parts = useMemo(() => {
    const sleepers: BoxInstance[] = [];
    const rails: BoxInstance[] = [];
    for (const { x, z, angle } of pointsAlong(p.rail, 1.4)) sleepers.push({ position: [x, t.ground(x, z) + 0.3, z], size: [2.6, 0.18, 0.3], rotationY: angle });
    for (const { x, z, angle } of pointsAlong(p.rail, 6)) {
      for (const side of [-0.75, 0.75]) {
        const rx = x + Math.cos(angle) * side;
        const rz = z - Math.sin(angle) * side;
        rails.push({ position: [rx, t.ground(rx, rz) + 0.48, rz], size: [0.12, 0.16, 6.05], rotationY: angle });
      }
    }
    return { sleepers, rails };
  }, [t, p]);
  const materials = useMemo(
    () => ({ ballast: new MeshStandardMaterial({ color: '#6b665e', roughness: 1 }), wood: new MeshStandardMaterial({ color: '#4a3726', roughness: 0.9 }), steel: new MeshStandardMaterial({ color: '#8c8f93', roughness: 0.35, metalness: 0.8 }) }),
    [],
  );
  useEffect(
    () => () => {
      bed.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    },
    [bed, materials],
  );
  return (
    <group>
      <mesh geometry={bed} material={materials.ballast} receiveShadow />
      <InstancedBoxes items={parts.sleepers} material={materials.wood} castShadow={false} />
      <InstancedBoxes items={parts.rails} material={materials.steel} castShadow={false} />
    </group>
  );
}

/** Concrete dam across the river (Chapter 3: the hidden lab beneath it). */
function Dam() {
  const t = useTerrain();
  const p = t.region.terrain as ForestParams;
  const dam = useMemo(() => {
    const [x, z] = p.river.points[3];
    const [ax, az] = p.river.points[2];
    const [bx, bz] = p.river.points[4];
    const riverAngle = Math.atan2(bx - ax, bz - az);
    const bed = t.ground(x, z);
    const height = 24;
    return { x, z, y: bed - 3 + height / 2, angle: riverAngle + Math.PI / 2, length: 110, height, thickness: 9 };
  }, [t, p]);
  useStaticColliders(
    (rapier) => {
      const q = { x: 0, y: Math.sin(dam.angle / 2), z: 0, w: Math.cos(dam.angle / 2) };
      return [rapier.ColliderDesc.cuboid(dam.length / 2, dam.height / 2, dam.thickness / 2).setTranslation(dam.x, dam.y, dam.z).setRotation(q)];
    },
    [dam],
  );
  return (
    <group position={[dam.x, dam.y, dam.z]} rotation-y={dam.angle}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[dam.length, dam.height, dam.thickness]} />
        <meshStandardMaterial color="#a8a59c" roughness={0.85} />
      </mesh>
      {/* Control house on top. */}
      <mesh position={[dam.length * 0.3, dam.height / 2 + 3, 0]} castShadow>
        <boxGeometry args={[12, 6, 7]} />
        <meshStandardMaterial color="#8f8b82" roughness={0.8} />
      </mesh>
    </group>
  );
}

/** Ranger tower, cabins and the airliner crash site. */
function Landmarks() {
  const t = useTerrain();
  const p = t.region.terrain as ForestParams;
  const [, crash, ranger, cabins] = p.flats;

  const parts = useMemo(() => {
    const wood: BoxInstance[] = [];
    const roofs: BoxInstance[] = [];
    // Ranger tower: four legs, platform and cabin.
    const ry = t.ground(ranger.x, ranger.z);
    for (const [sx, sz] of [
      [-2.5, -2.5],
      [2.5, -2.5],
      [-2.5, 2.5],
      [2.5, 2.5],
    ]) {
      wood.push({ position: [ranger.x + sx, ry + 9, ranger.z + sz], size: [0.5, 18, 0.5] });
    }
    wood.push({ position: [ranger.x, ry + 18, ranger.z], size: [7, 0.5, 7] });
    wood.push({ position: [ranger.x, ry + 19.8, ranger.z], size: [5, 3.2, 5] });
    roofs.push({ position: [ranger.x, ry + 21.8, ranger.z], size: [6.4, 0.6, 6.4] });
    // Cabins.
    for (let i = 0; i < 3; i++) {
      const cx = cabins.x - 14 + i * 14;
      const cz = cabins.z + (i % 2 ? 6 : -6);
      const cy = t.ground(cx, cz);
      wood.push({ position: [cx, cy + 2, cz], size: [8, 4, 6] });
      roofs.push({ position: [cx - 2, cy + 4.9, cz], size: [5.6, 0.4, 7], rotationY: 0 });
      roofs.push({ position: [cx + 2, cy + 4.9, cz], size: [5.6, 0.4, 7], rotationY: 0 });
    }
    // Crash site: broken fuselage sections and a wing.
    const cy = t.ground(crash.x, crash.z);
    const wreck: BoxInstance[] = [
      { position: [crash.x - 10, cy + 2.6, crash.z], size: [5, 5, 22], rotationY: 0.5 },
      { position: [crash.x + 12, cy + 2.4, crash.z + 9], size: [5, 4.6, 16], rotationY: 0.9 },
      { position: [crash.x + 2, cy + 0.8, crash.z - 14], size: [26, 0.8, 6], rotationY: 0.2 },
      { position: [crash.x + 24, cy + 4, crash.z + 20], size: [1.2, 8, 6], rotationY: 0.9 }, // tail fin
    ];
    return { wood, roofs, wreck, crashY: cy };
  }, [t, crash, ranger, cabins]);

  const materials = useMemo(
    () => ({
      wood: new MeshStandardMaterial({ color: '#6b4a2e', roughness: 0.9 }),
      roof: new MeshStandardMaterial({ color: '#3b3f44', roughness: 0.8 }),
      hull: new MeshStandardMaterial({ color: '#d9dde2', roughness: 0.5, metalness: 0.4 }),
      scorch: new MeshStandardMaterial({ color: '#1b1714', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  useStaticColliders(
    (rapier) =>
      [...parts.wood, ...parts.wreck].map((b) => {
        const a = b.rotationY ?? 0;
        return rapier.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2)
          .setTranslation(...b.position)
          .setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
      }),
    [parts],
  );

  return (
    <group>
      <InstancedBoxes items={parts.wood} material={materials.wood} />
      <InstancedBoxes items={parts.roofs} material={materials.roof} />
      <InstancedBoxes items={parts.wreck} material={materials.hull} />
      <mesh position={[crash.x, parts.crashY + 0.05, crash.z]} rotation-x={-Math.PI / 2} material={materials.scorch} receiveShadow>
        <circleGeometry args={[34, 24]} />
      </mesh>
    </group>
  );
}