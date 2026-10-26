import { useEffect, useMemo } from 'react';
import { MeshStandardMaterial } from 'three';
import { OUTDOOR_DENSITY } from '../../../config/regions';
import { ROAD_TRAFFIC } from '../../../config/world';
import { useSettings } from '../../../state/settings';
import { mulberry32 } from '../cityLayout';
import { InstancedBoxes, type BoxInstance } from '../InstancedBoxes';
import { InstancedProps, type PropInstance } from '../InstancedProps';
import { bushGeometry, cactusGeometry, nearPath, pointsAlong, ribbonGeometry, rockGeometry, scatter } from '../propGeometries';
import { useTerrain } from '../terrainContext';
import type { DesertParams } from '../terrainNoise';
import { useStaticColliders } from '../useStaticColliders';
import { spawnVehicles, twoWayRoad } from '../../vehicles/roadTraffic';
import { TrafficLayer } from '../../vehicles/TrafficLayer';

/**
 * Red Mesa Desert dressing: rocks, cacti, scrub, the desert highway with
 * power pylons, and the Prometheus test-range base (a landmark for missions).
 */
export function DesertContent() {
  const t = useTerrain();
  const quality = useSettings((s) => s.graphicsQuality);
  const density = OUTDOOR_DENSITY[quality];
  const p = t.region.terrain as DesertParams;
  const base = p.flats[1]; // Prometheus base

  const geo = useMemo(() => ({ rockA: rockGeometry(11), rockB: rockGeometry(29), cactus: cactusGeometry(), bush: bushGeometry() }), []);
  useEffect(() => () => Object.values(geo).forEach((g) => g.dispose()), [geo]);

  const { rocks, boulders, cacti, bushes } = useMemo(() => {
    const rand = mulberry32(p.seed + 1);
    const clearOf = (x: number, z: number, margin: number) =>
      !nearPath(p.highway, x, z, p.highway.width / 2 + margin) && Math.hypot(x - base.x, z - base.z) > base.radius + margin;
    const toProps = (pts: [number, number][], make: (x: number, z: number) => PropInstance) => pts.map(([x, z]) => make(x, z));

    const rocks = toProps(
      scatter(rand, t.size - 40, Math.round(1400 * density), (x, z) => clearOf(x, z, 6)),
      (x, z) => {
        const s = 0.6 + rand() ** 3 * 4.5;
        return { x, y: t.ground(x, z) - s * 0.25, z, scale: [s * (0.8 + rand() * 0.6), s, s * (0.8 + rand() * 0.6)], rotationY: rand() * 6.28, tiltX: (rand() - 0.5) * 0.4, tint: rand() < 0.5 ? 0xb76b45 : 0xa15c3c };
      },
    );
    // A few big boulders, mostly at the feet of mesas and in the canyon.
    const boulders = toProps(
      scatter(rand, t.size - 40, Math.round(160 * density), (x, z) => clearOf(x, z, 10) && t.slope(x, z) > 0.08),
      (x, z) => {
        const s = 5 + rand() * 9;
        return { x, y: t.ground(x, z) - s * 0.3, z, scale: [s, s * 0.8, s * 1.1], rotationY: rand() * 6.28, tint: 0xa9603d };
      },
    );
    const cacti = toProps(
      scatter(rand, t.size - 40, Math.round(500 * density), (x, z) => clearOf(x, z, 4) && t.slope(x, z) < 0.12),
      (x, z) => ({ x, y: t.ground(x, z), z, scale: 0.7 + rand() * 0.7, rotationY: rand() * 6.28, tint: rand() < 0.5 ? 0xffffff : 0xd8e8c8 }),
    );
    const bushes = toProps(
      scatter(rand, t.size - 40, Math.round(1800 * density), (x, z) => clearOf(x, z, 2) && t.slope(x, z) < 0.2),
      (x, z) => ({ x, y: t.ground(x, z), z, scale: 0.5 + rand() * 0.9, rotationY: rand() * 6.28 }),
    );
    return { rocks, boulders, cacti, bushes };
  }, [t, p, density, base]);

  // Solid props: boulders, larger rocks and cactus trunks block the hero.
  const bigRock = (r: PropInstance) => (Array.isArray(r.scale) ? r.scale[1] : 1) > 1.6;
  const { rocksA, rocksB, colliderIndex } = useMemo(() => {
    // Collider index of each rock (big ones only), so a lifted rock switches its own off.
    const index = new Map<PropInstance, number>();
    let n = boulders.length;
    for (const r of rocks) if (bigRock(r)) index.set(r, n++);
    return { rocksA: rocks.filter((_, i) => i % 2 === 0), rocksB: rocks.filter((_, i) => i % 2 === 1), colliderIndex: index };
  }, [rocks, boulders]);
  const solids = useStaticColliders(
    (rapier) => [
      ...[...boulders, ...rocks.filter(bigRock)].map((r) => {
        const s = Array.isArray(r.scale) ? r.scale : [1, 1, 1];
        return rapier.ColliderDesc.ball(Math.min(s[0], s[2]) * 0.85).setTranslation(r.x, r.y + s[1] * 0.25, r.z);
      }),
      ...cacti.map((c) => rapier.ColliderDesc.cylinder(2.5 * (c.scale as number), 0.4 * (c.scale as number)).setTranslation(c.x, c.y + 2.5 * (c.scale as number), c.z)),
    ],
    [boulders, rocks, cacti],
  );

  const solidOf = (i: number | undefined) => (i === undefined ? undefined : solids.current[i]);
  const draw = t.region.look.fog.far * 1.1;
  return (
    <group>
      <InstancedProps geometry={geo.rockA} instances={rocksA} maxDistance={draw} lift={{ kind: 'rock', colliderOf: (i) => solidOf(colliderIndex.get(rocksA[i])) }} />
      <InstancedProps geometry={geo.rockB} instances={rocksB} maxDistance={draw} lift={{ kind: 'rock', colliderOf: (i) => solidOf(colliderIndex.get(rocksB[i])) }} />
      <InstancedProps geometry={geo.rockB} instances={boulders} maxDistance={draw * 1.5} lift={{ kind: 'boulder', colliderOf: (i) => solids.current[i] }} />
      <InstancedProps geometry={geo.cactus} instances={cacti} maxDistance={draw * 0.7} lift={{ kind: 'cactus', colliderOf: (i) => solids.current[boulders.length + colliderIndex.size + i] }} />
      <InstancedProps geometry={geo.bush} instances={bushes} maxDistance={draw * 0.5} castShadow={false} />
      <Highway />
      <PrometheusBase x={base.x} z={base.z} />
    </group>
  );
}

/** Asphalt strip following the flattened highway band, with centre dashes and power pylons. */
function Highway() {
  const t = useTerrain();
  const p = t.region.terrain as DesertParams;

  // Lifted 18 cm: the strip and the terrain are triangulated differently, so a lower road lets sand poke through.
  const road = useMemo(() => ribbonGeometry(p.highway, p.highway.width - 2, t.ground, 0.18, 4), [p, t]);
  const materials = useMemo(
    () => ({ asphalt: new MeshStandardMaterial({ color: '#3b3a3c', roughness: 0.95 }), marking: new MeshStandardMaterial({ color: '#e8d68a', roughness: 0.8 }), steel: new MeshStandardMaterial({ color: '#6f7378', roughness: 0.6, metalness: 0.5 }) }),
    [],
  );
  useEffect(
    () => () => {
      road.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    },
    [road, materials],
  );

  const dashes: BoxInstance[] = useMemo(
    () => pointsAlong(p.highway, 12).map(({ x, z, angle }) => ({ position: [x, t.ground(x, z) + 0.21, z], size: [0.25, 0.02, 4], rotationY: angle })),
    [p, t],
  );
  const pylons = useMemo(() => {
    const posts: BoxInstance[] = [];
    const arms: BoxInstance[] = [];
    for (const { x, z, angle } of pointsAlong(p.highway, 90)) {
      // 28 m to the side of the road.
      const px = x + Math.cos(angle) * 28;
      const pz = z - Math.sin(angle) * 28;
      const y = t.ground(px, pz);
      posts.push({ position: [px, y + 11, pz], size: [0.8, 22, 0.8], rotationY: angle });
      arms.push({ position: [px, y + 20, pz], size: [9, 0.5, 0.5], rotationY: angle + Math.PI / 2 });
    }
    return { posts, arms };
  }, [p, t]);

  // Highway traffic: cars, pickups and semis at highway speed.
  const lanes = useMemo(() => twoWayRoad(p.highway.points, ROAD_TRAFFIC.desertHighway.speedLimit, 'highway'), [p]);
  const vehicles = useMemo(
    () =>
      spawnVehicles(lanes, ROAD_TRAFFIC.desertHighway.perLane, [
        ['sedan', 45],
        ['pickup', 25],
        ['semi', 20],
        ['van', 10],
      ], 313),
    [lanes],
  );

  useStaticColliders(
    (rapier) =>
      pylons.posts.map((b) => rapier.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2).setTranslation(...b.position)),
    [pylons],
  );

  return (
    <group>
      <mesh geometry={road} material={materials.asphalt} receiveShadow />
      <InstancedBoxes items={dashes} material={materials.marking} castShadow={false} />
      <InstancedBoxes items={pylons.posts} material={materials.steel} />
      <InstancedBoxes items={pylons.arms} material={materials.steel} />
      <TrafficLayer lanes={lanes} setup={vehicles} groundY={t.ground} roadLift={0.18} />
    </group>
  );
}

/**
 * Prometheus test-range base: perimeter wall with a gate, corner watchtowers,
 * hangar, control building, comms dish and a solar field. Placeholder
 * architecture from boxes; it anchors Chapter 2/5 missions.
 */
function PrometheusBase({ x, z }: { x: number; z: number }) {
  const t = useTerrain();
  const y = t.ground(x, z);

  const parts = useMemo(() => {
    const walls: BoxInstance[] = [];
    const half = 120;
    const h = 7;
    // Four walls; the south (+Z) wall has a 30 m gate gap.
    walls.push({ position: [x, y + h / 2, z - half], size: [half * 2, h, 2] });
    walls.push({ position: [x - half, y + h / 2, z], size: [2, h, half * 2] });
    walls.push({ position: [x + half, y + h / 2, z], size: [2, h, half * 2] });
    walls.push({ position: [x - 67.5, y + h / 2, z + half], size: [105, h, 2] });
    walls.push({ position: [x + 67.5, y + h / 2, z + half], size: [105, h, 2] });
    const towers: BoxInstance[] = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].map(([sx, sz]) => ({ position: [x + sx * half, y + 9, z + sz * half], size: [6, 18, 6] }));
    const buildings: BoxInstance[] = [
      { position: [x - 40, y + 11, z - 50], size: [70, 22, 44] }, // hangar
      { position: [x + 55, y + 8, z - 40], size: [36, 16, 26] }, // control building
      { position: [x + 55, y + 18, z - 40], size: [10, 4, 10] }, // control rooftop
      { position: [x + 70, y + 0.15, z + 50], size: [30, 0.3, 30] }, // helipad
    ];
    const solar: BoxInstance[] = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 14; c++) {
        const sx = x - 110 + c * 16;
        const sz = z + 170 + r * 12;
        solar.push({ position: [sx, t.ground(sx, sz) + 1.4, sz], size: [12, 0.2, 5], rotationY: 0 });
      }
    }
    return { walls, towers, buildings, solar };
  }, [x, y, z, t]);

  const materials = useMemo(
    () => ({
      concrete: new MeshStandardMaterial({ color: '#b7b2a7', roughness: 0.9 }),
      metal: new MeshStandardMaterial({ color: '#8d949c', roughness: 0.45, metalness: 0.6 }),
      solar: new MeshStandardMaterial({ color: '#1d2c4a', roughness: 0.25, metalness: 0.6 }),
      dish: new MeshStandardMaterial({ color: '#d9dde2', roughness: 0.4, metalness: 0.3 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  useStaticColliders(
    (rapier) =>
      [...parts.walls, ...parts.towers, ...parts.buildings].map((b) =>
        rapier.ColliderDesc.cuboid(b.size[0] / 2, b.size[1] / 2, b.size[2] / 2).setTranslation(...b.position),
      ),
    [parts],
  );

  return (
    <group>
      <InstancedBoxes items={parts.walls} material={materials.concrete} />
      <InstancedBoxes items={parts.towers} material={materials.concrete} />
      <InstancedBoxes items={parts.buildings} material={materials.metal} />
      <InstancedBoxes items={parts.solar} material={materials.solar} castShadow={false} />
      {/* Comms dish on a mast beside the control building. */}
      <mesh position={[x + 90, y + 10, z - 70]} material={materials.metal} castShadow>
        <cylinderGeometry args={[0.6, 0.8, 20, 8]} />
      </mesh>
      <mesh position={[x + 90, y + 21, z - 70]} rotation={[-0.9, 0, 0]} material={materials.dish} castShadow>
        <sphereGeometry args={[7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 3]} />
      </mesh>
    </group>
  );
}
