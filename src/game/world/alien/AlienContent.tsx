import { useEffect, useMemo } from 'react';
import { BoxGeometry, CylinderGeometry, MeshStandardMaterial, PlaneGeometry, type BufferGeometry } from 'three';
import { OUTDOOR_DENSITY, type RegionId } from '../../../config/regions';
import { useSettings } from '../../../state/settings';
import { mulberry32 } from '../cityLayout';
import { InstancedProps, type PropInstance } from '../InstancedProps';
import { merged, part, scatter } from '../propGeometries';
import type { AlienParams } from '../terrainNoise';
import { useTerrain } from '../terrainContext';
import { useStaticColliders } from '../useStaticColliders';
import { WaterBody } from '../Water';

/** Apokolips fire spire: a dark jagged obelisk with a burning crown, ~24 m. */
function spireGeometry(): BufferGeometry {
  return merged([
    part(new CylinderGeometry(1.2, 3.2, 20, 5), '#241a18', 0, 10, 0),
    part(new CylinderGeometry(0.2, 1.2, 4, 5), '#3a2420', 0, 22, 0),
    part(new CylinderGeometry(1.5, 1.3, 1.2, 8), '#ff7a2a', 0, 20.4, 0),
  ]);
}

/** Warworld pylon: a riveted metal tower with a red beacon, ~30 m. */
function pylonGeometry(): BufferGeometry {
  return merged([
    part(new BoxGeometry(4, 26, 4), '#4a4a50', 0, 13, 0),
    part(new BoxGeometry(5.2, 2, 5.2), '#2e2e34', 0, 6, 0),
    part(new BoxGeometry(5.2, 2, 5.2), '#2e2e34', 0, 18, 0),
    part(new CylinderGeometry(0.8, 0.8, 3, 8), '#ff3a2a', 0, 27.5, 0),
  ]);
}

interface Block {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
  mat: 'dark' | 'metal' | 'glow' | 'sand';
}

/** Darkseid's palace: a stepped dark ziggurat flanked by towers, with burning braziers. */
function palace(cx: number, cz: number, y0: number): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < 5; i++) {
    const w = 120 - i * 22;
    out.push({ x: cx, y: y0 + i * 10 + 5, z: cz - i * 4, w, h: 10, d: w * 0.8, mat: 'dark' });
  }
  for (const s of [-1, 1]) {
    out.push({ x: cx + s * 70, y: y0 + 40, z: cz + 20, w: 14, h: 80, d: 14, mat: 'dark' });
    out.push({ x: cx + s * 70, y: y0 + 81.5, z: cz + 20, w: 9, h: 3, d: 9, mat: 'glow' });
    out.push({ x: cx + s * 30, y: y0 + 3, z: cz + 62, w: 4, h: 6, d: 4, mat: 'dark' });
    out.push({ x: cx + s * 30, y: y0 + 6.6, z: cz + 62, w: 3, h: 1.2, d: 3, mat: 'glow' });
  }
  // The throne at the top.
  out.push({ x: cx, y: y0 + 54, z: cz - 16, w: 8, h: 8, d: 6, mat: 'glow' });
  return out;
}

/** Warworld's arena: a ring wall with a gate to the south, tiers of stands, and gladiator gates. */
function arena(cx: number, cz: number, y0: number): Block[] {
  const out: Block[] = [];
  const R = 140;
  const n = 56;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    // The gate: leave a gap facing south (+Z, toward the arrival pad).
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.12) continue;
    const seg = ((Math.PI * 2 * R) / n) * 1.04;
    for (let tier = 0; tier < 3; tier++) {
      const r = R + tier * 9;
      out.push({ x: cx + Math.cos(a) * r, y: y0 + 4 + tier * 7, z: cz + Math.sin(a) * r, w: seg * (r / R), h: 8 + tier * 14, d: 9, yaw: Math.PI / 2 - a, mat: tier === 0 ? 'metal' : 'sand' });
    }
  }
  // Champion pillars and the victory beacon.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    out.push({ x: cx + Math.cos(a) * 95, y: y0 + 9, z: cz + Math.sin(a) * 95, w: 5, h: 18, d: 5, mat: 'metal' });
    out.push({ x: cx + Math.cos(a) * 95, y: y0 + 18.8, z: cz + Math.sin(a) * 95, w: 6, h: 1.6, d: 6, mat: 'glow' });
  }
  return out;
}

/**
 * Off-world regions: Apokolips (lava lakes, fire spires, Darkseid's palace)
 * and Warworld (metal pylons, the great arena). Everything built is solid.
 */
export function AlienContent({ regionId }: { regionId: RegionId }) {
  const t = useTerrain();
  const p = t.region.terrain as AlienParams;
  const quality = useSettings((s) => s.graphicsQuality);
  const density = OUTDOOR_DENSITY[quality];
  const apokolips = regionId === 'apokolips';

  const assets = useMemo(
    () => ({
      spire: apokolips ? spireGeometry() : pylonGeometry(),
      box: new BoxGeometry(1, 1, 1),
      lavaGeo: new PlaneGeometry(t.size * 2.5, t.size * 2.5).rotateX(-Math.PI / 2),
      lava: new MeshStandardMaterial({ color: '#d8400a', emissive: '#ff3000', emissiveIntensity: 0.9, roughness: 0.5 }),
      mats: {
        dark: new MeshStandardMaterial({ color: '#2a2220', roughness: 0.8, metalness: 0.2 }),
        metal: new MeshStandardMaterial({ color: '#5a5a62', roughness: 0.45, metalness: 0.7 }),
        glow: new MeshStandardMaterial({ color: '#ffb060', emissive: apokolips ? '#ff6a10' : '#ff2a1a', emissiveIntensity: 2.5 }),
        sand: new MeshStandardMaterial({ color: '#7a5e4a', roughness: 0.9 }),
      },
    }),
    [apokolips, t.size],
  );
  useEffect(
    () => () => {
      assets.spire.dispose();
      assets.box.dispose();
      assets.lavaGeo.dispose();
      assets.lava.dispose();
      Object.values(assets.mats).forEach((m) => m.dispose());
    },
    [assets],
  );

  const flat = p.flats[1];
  const blocks = useMemo(() => {
    const y0 = t.ground(flat.x, flat.z);
    return apokolips ? palace(flat.x, flat.z, y0) : arena(flat.x, flat.z, y0);
  }, [apokolips, flat, t]);

  const towers = useMemo<PropInstance[]>(() => {
    const rand = mulberry32(p.seed + 5);
    const clear = (x: number, z: number) => p.flats.every((f) => Math.hypot(x - f.x, z - f.z) > f.radius + f.falloff + 10) && (p.lavaLevel === undefined || t.ground(x, z) > p.lavaLevel + 1.5);
    return scatter(rand, t.size - 60, Math.round((apokolips ? 110 : 60) * density), clear).map(([x, z]) => {
      const s = 0.7 + rand() * 0.9;
      return { x, y: t.ground(x, z) - 0.5, z, scale: [s, s * (0.8 + rand() * 0.6), s] as [number, number, number], rotationY: rand() * 6.28 };
    });
  }, [p, t, apokolips, density]);

  useStaticColliders(
    (rapier) => [
      ...blocks.map((b) => {
        const d = rapier.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z);
        if (b.yaw) d.setRotation({ x: 0, y: Math.sin(b.yaw / 2), z: 0, w: Math.cos(b.yaw / 2) });
        return d;
      }),
      ...towers.map((tw) => {
        const s = tw.scale as [number, number, number];
        return rapier.ColliderDesc.cylinder(12 * s[1], (apokolips ? 2.2 : 2.6) * s[0]).setTranslation(tw.x, tw.y + 12 * s[1], tw.z);
      }),
    ],
    [blocks, towers],
  );

  // Lava lakes hold the hero up like water: he can sprint across them.
  const lavaLevel = p.lavaLevel;
  const lava = useMemo(() => (lavaLevel === undefined ? null : (x: number, z: number) => (t.ground(x, z) < lavaLevel ? lavaLevel : null)), [lavaLevel, t]);

  const draw = t.region.look.fog.far * 1.2;
  return (
    <group>
      <InstancedProps geometry={assets.spire} instances={towers} maxDistance={draw} roughness={0.7} />
      {blocks.map((b, i) => (
        <mesh key={i} geometry={assets.box} material={assets.mats[b.mat]} position={[b.x, b.y, b.z]} rotation-y={b.yaw ?? 0} scale={[b.w, b.h, b.d]} castShadow={b.mat !== 'glow'} receiveShadow />
      ))}
      {lava && lavaLevel !== undefined && (
        <>
          <mesh geometry={assets.lavaGeo} material={assets.lava} position-y={lavaLevel} />
          <WaterBody level={lava} />
        </>
      )}
    </group>
  );
}
