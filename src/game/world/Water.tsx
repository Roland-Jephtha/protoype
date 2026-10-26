import { useFrame } from '@react-three/fiber';
import { CuboidCollider, CylinderCollider, RigidBody } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry } from 'three';
import { METRO_BAY } from '../../config/world';
import { runtime } from '../runtime';
import type { WaterLevel } from './waterLevel';

const WAKES = 14;
const WAKE_LIFE = 0.9;

/**
 * Registers this region's water with the player (who runs on it or swims in
 * it) and draws the wake rings behind him on the surface.
 */
export function WaterBody({ level }: { level: WaterLevel }) {
  useEffect(() => {
    runtime.waterLevel = level;
    return () => {
      runtime.waterLevel = null;
      runtime.heroOnWater = null;
    };
  }, [level]);

  const assets = useMemo(() => {
    const geo = new RingGeometry(0.7, 1, 32).rotateX(-Math.PI / 2);
    const mats = Array.from({ length: WAKES }, () => new MeshBasicMaterial({ color: '#eaf6ff', transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }));
    return { geo, mats };
  }, []);
  useEffect(
    () => () => {
      assets.geo.dispose();
      assets.mats.forEach((m) => m.dispose());
    },
    [assets],
  );
  const rings = useRef<(Mesh | null)[]>([]);
  const state = useRef({ born: new Array<number>(WAKES).fill(-99), next: 0, clock: 0, since: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    s.clock += dt;
    s.since += dt;
    const on = runtime.heroOnWater;
    const p = runtime.playerPosition;
    const v = runtime.playerVelocity;
    const speed = Math.hypot(v.x, v.z);
    // Running leaves a trail of rings; wading ripples slowly.
    const every = on === 'run' ? Math.max(0.04, 0.5 / Math.max(speed, 1)) : on === 'wade' && speed > 0.5 ? 0.35 : Infinity;
    if (s.since >= every) {
      s.since = 0;
      const r = rings.current[s.next];
      const lvl = runtime.waterLevel?.(p.x, p.z);
      if (r && lvl != null) {
        r.position.set(p.x, lvl + 0.03, p.z);
        s.born[s.next] = s.clock;
        s.next = (s.next + 1) % WAKES;
      }
    }
    rings.current.forEach((r, i) => {
      if (!r) return;
      const age = s.clock - s.born[i];
      r.visible = age < WAKE_LIFE;
      if (!r.visible) return;
      const k = age / WAKE_LIFE;
      r.scale.setScalar(0.6 + k * (on === 'run' ? 2.5 : 3.5));
      assets.mats[i].opacity = 0.55 * (1 - k);
    });
  });

  return (
    <group>
      {assets.mats.map((m, i) => (
        <mesh key={i} ref={(r) => void (rings.current[i] = r)} geometry={assets.geo} material={m} visible={false} frustumCulled={false} />
      ))}
    </group>
  );
}

/**
 * Metropolis Bay: open sea around the city out to the region edge, quay walls
 * along the waterfront, a pier, a lighthouse island and a moored freighter.
 */
export function MetropolisBay() {
  const B = METRO_BAY;
  const assets = useMemo(() => {
    const sea = new MeshStandardMaterial({ color: '#3d8fb8', roughness: 0.22, metalness: 0, transparent: true, opacity: 0.93 });
    const seaGeo = new PlaneGeometry(B.half * 6, B.half * 6).rotateX(-Math.PI / 2);
    const concrete = new MeshStandardMaterial({ color: '#8d8a84', roughness: 0.9 });
    const wood = new MeshStandardMaterial({ color: '#6b4f36', roughness: 0.85 });
    const rock = new MeshStandardMaterial({ color: '#6f6a5f', roughness: 1 });
    const white = new MeshStandardMaterial({ color: '#f2efe8', roughness: 0.6 });
    const red = new MeshStandardMaterial({ color: '#b3262a', roughness: 0.6 });
    const hull = new MeshStandardMaterial({ color: '#2d3a4a', roughness: 0.7 });
    const deck = new MeshStandardMaterial({ color: '#7a3b2a', roughness: 0.8 });
    const lamp = new MeshStandardMaterial({ color: '#fff3c0', emissive: '#ffd36a', emissiveIntensity: 2 });
    const box = new BoxGeometry(1, 1, 1);
    const cyl = new CylinderGeometry(1, 1, 1, 24);
    const cone = new CylinderGeometry(0.75, 1, 1, 20);
    return { sea, seaGeo, concrete, wood, rock, white, red, hull, deck, lamp, box, cyl, cone };
  }, [B.half]);
  useEffect(
    () => () => {
      for (const a of Object.values(assets)) a.dispose();
    },
    [assets],
  );

  const L = B.landHalf;
  const wallDepth = -B.seabed;
  const { island: I, freighter: F, pier: P } = B;
  const shaft = 26;
  return (
    <group>
      <mesh geometry={assets.seaGeo} material={assets.sea} position-y={B.waterLevel} receiveShadow />
      <RigidBody type="fixed" colliders={false}>
        {/* Seabed (the hero swims long before reaching it). */}
        <CuboidCollider args={[B.half * 1.2, 1, B.half * 1.2]} position={[0, B.seabed - 1, 0]} />
        {/* Quay walls around the land. */}
        {[0, 1, 2, 3].map((i) => {
          const ns = i < 2;
          const sgn = i % 2 ? 1 : -1;
          return <CuboidCollider key={i} args={ns ? [L, wallDepth / 2, 1] : [1, wallDepth / 2, L]} position={ns ? [0, -wallDepth / 2, sgn * L] : [sgn * L, -wallDepth / 2, 0]} />;
        })}
        {/* Pier deck. */}
        <CuboidCollider args={[P.width / 2, 0.4, P.length / 2]} position={[P.x, 0.6, L + P.length / 2]} />
        {/* Island and lighthouse. */}
        <CylinderCollider args={[(I.height - B.seabed) / 2, I.radius]} position={[I.x, (I.height + B.seabed) / 2, I.z]} />
        <CylinderCollider args={[shaft / 2, 3.2]} position={[I.x, I.height + shaft / 2, I.z]} />
        {/* Freighter hull. */}
        <CuboidCollider args={[F.width / 2, (F.height - B.seabed) / 2, F.length / 2]} position={[F.x, (F.height + B.seabed) / 2, F.z]} rotation={[0, F.yaw, 0]} />
      </RigidBody>

      {/* Quay walls (visual). */}
      {[0, 1, 2, 3].map((i) => {
        const ns = i < 2;
        const sgn = i % 2 ? 1 : -1;
        return (
          <mesh
            key={i}
            geometry={assets.box}
            material={assets.concrete}
            position={ns ? [0, -wallDepth / 2 + 0.05, sgn * L] : [sgn * L, -wallDepth / 2 + 0.05, 0]}
            scale={ns ? [L * 2 + 2, wallDepth, 2] : [2, wallDepth, L * 2 + 2]}
            receiveShadow
          />
        );
      })}

      {/* Pier: deck and piles. */}
      <mesh geometry={assets.box} material={assets.wood} position={[P.x, 0.6, L + P.length / 2]} scale={[P.width, 0.8, P.length]} castShadow receiveShadow />
      {Array.from({ length: Math.floor(P.length / 12) }, (_, i) =>
        [-1, 1].map((s) => <mesh key={`${i}${s}`} geometry={assets.cyl} material={assets.wood} position={[P.x + s * (P.width / 2 - 0.5), -3, L + 6 + i * 12]} scale={[0.35, 7, 0.35]} />),
      )}

      {/* Lighthouse island. */}
      <mesh geometry={assets.cone} material={assets.rock} position={[I.x, (I.height + B.seabed) / 2, I.z]} scale={[I.radius, I.height - B.seabed, I.radius]} receiveShadow />
      {Array.from({ length: 4 }, (_, i) => (
        <mesh key={i} geometry={assets.cyl} material={i % 2 ? assets.red : assets.white} position={[I.x, I.height + (i + 0.5) * (shaft / 4), I.z]} scale={[3.2 - i * 0.25, shaft / 4, 3.2 - i * 0.25]} castShadow />
      ))}
      <mesh geometry={assets.cyl} material={assets.lamp} position={[I.x, I.height + shaft + 1.5, I.z]} scale={[2.2, 3, 2.2]} />
      <mesh geometry={assets.cone} material={assets.red} position={[I.x, I.height + shaft + 4, I.z]} scale={[2.6, 2, 2.6]} />

      {/* Freighter: hull, deck, bridge tower and containers. */}
      <group position={[F.x, 0, F.z]} rotation-y={F.yaw}>
        <mesh geometry={assets.box} material={assets.hull} position-y={(F.height + B.seabed) / 2 + 3} scale={[F.width, F.height - B.seabed - 6, F.length]} castShadow />
        <mesh geometry={assets.box} material={assets.deck} position-y={F.height - 0.2} scale={[F.width - 1, 0.6, F.length - 2]} receiveShadow />
        <mesh geometry={assets.box} material={assets.white} position={[0, F.height + 8, -F.length / 2 + 14]} scale={[F.width - 4, 16, 14]} castShadow />
        {Array.from({ length: 18 }, (_, i) => (
          <mesh
            key={i}
            geometry={assets.box}
            material={[assets.red, assets.concrete, assets.hull][i % 3]}
            position={[((i % 3) - 1) * 7, F.height + 1.5 + (i % 2) * 2.6, -F.length / 2 + 34 + Math.floor(i / 3) * 16]}
            scale={[6.4, 2.5, 13]}
            castShadow
          />
        ))}
      </group>
    </group>
  );
}
