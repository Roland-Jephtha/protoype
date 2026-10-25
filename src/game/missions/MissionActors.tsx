import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, ConeGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, SphereGeometry } from 'three';
import type { RegionId } from '../../config/regions';
import { MISSIONS } from '../../missions/missions';
import { currentObjective } from '../../missions/runner';
import type { MissionTarget } from '../../missions/types';
import { useApp } from '../../state/appStore';
import { Civilian, type CivilianHandle } from '../characters/Civilian';
import { runtime } from '../runtime';
import { samplePath } from '../vehicles/traffic';
import { VEHICLES } from '../vehicles/vehicleGeometry';

/** Fire strength lost per second under super breath / freeze breath (1 = full). */
const FIRE_DOUSE = { wind: 0.55, freeze: 0.8 };
/** The breath reaches fires within this distance and angle of where it blows (m, rad). */
const FIRE_REACH = { range: 30, angle: 0.4 };

/**
 * Scripted world for the current objective: the runaway bus, people to carry
 * to the ambulance (and the one being carried), and fires to put out.
 */
export function MissionActors({ regionId, ground }: { regionId: RegionId; ground: (x: number, z: number) => number }) {
  const mission = useApp((s) => s.mission);
  if (!mission) return null;
  const def = MISSIONS[mission.missionId];
  const o = currentObjective(def, mission);
  if (!o) return null;
  if (o.type === 'flag' && o.actor.kind === 'runawayBus' && o.target.region === regionId) return <RunawayBus key={o.id} route={o.actor.route} speed={o.actor.speed} flag={o.flag} ground={ground} />;
  if (o.type === 'deliver') {
    return (
      <>
        {o.pickups.map((t, i) =>
          t.region === regionId && !mission.done[i] && mission.carrying !== i ? <Civilian key={`${o.id}-${i}`} seed={400 + i * 13} position={[t.x, t.y ?? ground(t.x, t.z), t.z]} rotationY={i * 1.7} clip="Crouch_Idle_Loop" /> : null,
        )}
        {o.dropZone.region === regionId && <Ambulance target={o.dropZone} ground={ground} />}
        {mission.carrying !== undefined && <CarriedPerson key={`carry-${mission.carrying}`} seed={400 + mission.carrying * 13} />}
      </>
    );
  }
  if (o.type === 'extinguish') return <Fires key={o.id} fires={o.fires.filter((f) => f.region === regionId)} />;
  return null;
}

/** A bus with no brakes looping the downtown streets until the hero grabs it. */
function RunawayBus({ route, speed, flag, ground }: { route: [number, number][]; speed: number; flag: string; ground: (x: number, z: number) => number }) {
  const { world, rapier } = useRapier();
  const path = useMemo(() => samplePath(route), [route]);
  const geo = useMemo(() => VEHICLES.bus.build(), []);
  const mat = useMemo(() => new MeshStandardMaterial({ vertexColors: true, color: new Color('#d8402f'), roughness: 0.5, metalness: 0.25, flatShading: true }), []);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
      runtime.busPosition = null;
    },
    [geo, mat],
  );
  const bodyRef = useRef<RAPIER.RigidBody | null>(null);
  useEffect(() => {
    const spec = VEHICLES.bus;
    const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
    world.createCollider(rapier.ColliderDesc.cuboid(spec.width / 2, spec.height / 2, spec.length / 2), body);
    bodyRef.current = body;
    return () => {
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body);
      bodyRef.current = null;
    };
  }, [world, rapier]);

  const mesh = useRef<Mesh>(null);
  const sim = useRef({ s: 0, v: speed });
  useFrame((_, rawDt) => {
    if (useApp.getState().paused || useApp.getState().missionPhase !== 'active') return;
    const dt = Math.min(rawDt, 0.05) * runtime.timeScale;
    const st = sim.current;
    // Caught: grind to a halt.
    st.v = runtime.missionFlags.has(flag) ? Math.max(0, st.v - 25 * dt) : speed;
    st.s = (st.s + st.v * dt) % path.length;
    const p = path.at(st.s);
    const y = ground(p.x, p.z);
    runtime.busPosition = { x: p.x, z: p.z };
    if (mesh.current) {
      mesh.current.position.set(p.x, y, p.z);
      mesh.current.rotation.y = p.angle;
    }
    const q = { x: 0, y: Math.sin(p.angle / 2), z: 0, w: Math.cos(p.angle / 2) };
    bodyRef.current?.setNextKinematicTranslation({ x: p.x, y: y + VEHICLES.bus.height / 2, z: p.z });
    bodyRef.current?.setNextKinematicRotation(q);
  });
  return <mesh ref={mesh} geometry={geo} material={mat} castShadow />;
}

/** The ambulance at the drop zone. */
function Ambulance({ target, ground }: { target: MissionTarget; ground: (x: number, z: number) => number }) {
  const geo = useMemo(() => VEHICLES.van.build(), []);
  const mat = useMemo(() => new MeshStandardMaterial({ vertexColors: true, color: '#f2f2f2', roughness: 0.5, flatShading: true }), []);
  const lights = useRef<MeshBasicMaterial>(null);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  useFrame(({ clock }) => {
    if (lights.current) lights.current.color.set(Math.sin(clock.elapsedTime * 10) > 0 ? '#ff2030' : '#2050ff');
  });
  const y = ground(target.x, target.z);
  return (
    <group position={[target.x, y, target.z]} rotation-y={Math.PI / 2}>
      <mesh geometry={geo} material={mat} castShadow />
      <mesh position={[0, 2.35, 0.6]}>
        <boxGeometry args={[1.2, 0.18, 0.4]} />
        <meshBasicMaterial ref={lights} color="#ff2030" />
      </mesh>
    </group>
  );
}

/** The person being carried, over the hero's shoulder. */
function CarriedPerson({ seed }: { seed: number }) {
  const ref = useRef<CivilianHandle>(null);
  const holder = useRef<Group>(null);
  useFrame(() => {
    const g = holder.current;
    if (!g) return;
    const p = runtime.playerRenderPosition;
    const yaw = runtime.heroFacingYaw;
    // Lying across the shoulders, slightly behind the head.
    g.position.set(p.x - Math.sin(yaw) * 0.25, p.y + 1.55, p.z - Math.cos(yaw) * 0.25);
    g.rotation.set(0, yaw + Math.PI / 2, Math.PI / 2, 'YXZ');
  });
  return (
    <group ref={holder}>
      <group position={[0, -0.85, 0]}>
        <Civilian ref={ref} seed={seed} clip="Idle_Loop" height={1.6} castShadow={false} />
      </group>
    </group>
  );
}

/** Fires on a building face: the breath shrinks them until they go out. */
function Fires({ fires }: { fires: (MissionTarget & { y: number })[] }) {
  const assets = useMemo(() => {
    const flame = new ConeGeometry(1, 2.4, 8, 1, true).translate(0, 1.2, 0);
    const smoke = new SphereGeometry(1, 8, 6);
    const flameMats = [new MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false }), new MeshBasicMaterial({ color: '#ffd04a', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false })];
    const smokeMat = new MeshBasicMaterial({ color: '#3a3836', transparent: true, opacity: 0.35, depthWrite: false });
    const steamMat = new MeshBasicMaterial({ color: '#e8eef2', transparent: true, opacity: 0.4, depthWrite: false });
    return { flame, smoke, flameMats, smokeMat, steamMat };
  }, []);
  useEffect(
    () => () => {
      assets.flame.dispose();
      assets.smoke.dispose();
      assets.flameMats.forEach((m) => m.dispose());
      assets.smokeMat.dispose();
      assets.steamMat.dispose();
      runtime.firesOut = 0;
    },
    [assets],
  );
  const groups = useRef<(Group | null)[]>([]);
  const strength = useRef(fires.map(() => 1));
  useEffect(() => {
    runtime.firesOut = 0;
  }, []);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const active = useApp.getState().missionPhase === 'active' && !useApp.getState().paused;
    const br = runtime.breath;
    let out = 0;
    fires.forEach((f, i) => {
      // Douse fires inside the breath cone.
      if (active && br.kind !== 'none' && strength.current[i] > 0) {
        const dx = f.x - br.from.x;
        const dy = f.y - br.from.y;
        const dz = f.z - br.from.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < FIRE_REACH.range && (dx * br.dir.x + dy * br.dir.y + dz * br.dir.z) / (d || 1) > Math.cos(FIRE_REACH.angle)) {
          strength.current[i] = Math.max(0, strength.current[i] - FIRE_DOUSE[br.kind] * dt);
        }
      }
      if (strength.current[i] <= 0) out++;
      const g = groups.current[i];
      if (!g) return;
      const k = strength.current[i];
      const flicker = 0.85 + Math.sin(clock.elapsedTime * 13 + i * 2) * 0.15;
      const [inner, outer, smoke] = g.children as Mesh[];
      inner.visible = outer.visible = k > 0;
      inner.scale.set(2.4 * k * flicker, 3.2 * k * flicker, 2.4 * k * flicker);
      outer.scale.set(4 * k, 5.2 * k * flicker, 4 * k);
      smoke.position.y = 4 + (clock.elapsedTime * 3 + i) % 6;
      smoke.scale.setScalar(k > 0 ? 2 + k * 2 : 1.5);
      smoke.material = k > 0 ? assets.smokeMat : assets.steamMat;
    });
    runtime.firesOut = out;
  });

  return (
    <group>
      {fires.map((f, i) => (
        <group key={i} ref={(g) => void (groups.current[i] = g)} position={[f.x, f.y, f.z]}>
          <mesh geometry={assets.flame} material={assets.flameMats[1]} />
          <mesh geometry={assets.flame} material={assets.flameMats[0]} />
          <mesh geometry={assets.smoke} material={assets.smokeMat} />
        </group>
      ))}
    </group>
  );
}
