import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { lightState, stepTraffic, type Lane, type Vehicle } from './traffic';
import { VEHICLES, type VehicleType } from './vehicleGeometry';

export interface VehicleSetup {
  lane: number;
  type: VehicleType;
  s: number;
  temper: number;
  /** Paint colour (multiplies the white body panels). */
  paint: string;
}

/**
 * Drives a set of vehicles along lanes: simulation each frame, one instanced
 * mesh per vehicle type, and a kinematic collider per vehicle so the hero
 * can't walk through traffic (and can stand in front of it — it brakes).
 */
export function TrafficLayer({ lanes, setup, groundY, roadLift = 0 }: { lanes: Lane[]; setup: VehicleSetup[]; groundY: (x: number, z: number) => number; roadLift?: number }) {
  const { world, rapier } = useRapier();

  const sim = useMemo(() => {
    const vehicles: Vehicle[] = setup.map((v) => ({ lane: v.lane, s: v.s, speed: 0, temper: v.temper, length: VEHICLES[v.type].length }));
    const types = [...new Set(setup.map((v) => v.type))];
    const indexInType = setup.map((v, i) => setup.slice(0, i).filter((w) => w.type === v.type).length);
    return { vehicles, types, indexInType };
  }, [setup]);

  const assets = useMemo(() => {
    const material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.25, flatShading: true });
    const geometries = {} as Record<VehicleType, BufferGeometry>;
    for (const t of sim.types) geometries[t] = VEHICLES[t].build();
    return { material, geometries };
  }, [sim]);
  useEffect(
    () => () => {
      assets.material.dispose();
      Object.values(assets.geometries).forEach((g) => g.dispose());
    },
    [assets],
  );

  // One kinematic body + box collider per vehicle.
  const bodies = useRef<RAPIER.RigidBody[]>([]);
  useEffect(() => {
    bodies.current = setup.map((v) => {
      const spec = VEHICLES[v.type];
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -100, 0));
      world.createCollider(rapier.ColliderDesc.cuboid(spec.width / 2, spec.height / 2, spec.length / 2), body);
      return body;
    });
    return () => {
      for (const b of bodies.current) if (world.getRigidBody(b.handle)) world.removeRigidBody(b);
      bodies.current = [];
    };
  }, [world, rapier, setup]);

  const meshes = useRef<Partial<Record<VehicleType, InstancedMesh>>>({});
  const scratch = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(1, 1, 1), c: new Color() }), []);

  // Paint each instance once.
  useEffect(() => {
    setup.forEach((v, i) => meshes.current[v.type]?.setColorAt(sim.indexInType[i], scratch.c.set(v.paint)));
    for (const mesh of Object.values(meshes.current)) if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [setup, sim, scratch]);

  useFrame((_, rawDt) => {
    if (useApp.getState().paused) return;
    const dt = Math.min(rawDt, 0.05);
    runtime.trafficTime += dt;
    const time = runtime.trafficTime;
    stepTraffic(sim.vehicles, lanes, dt, { player: runtime.playerPosition, groundY, light: (g) => lightState(g, time) });
    runtime.trafficMoving = sim.vehicles.filter((v) => v.speed > 1).length;
    runtime.trafficStopped = sim.vehicles.filter((v) => v.speed < 0.1).length;
    const { m, q, e, p, s } = scratch;
    sim.vehicles.forEach((v, i) => {
      const type = setup[i].type;
      const spec = VEHICLES[type];
      const pos = lanes[v.lane].path.at(v.s);
      const y = groundY(pos.x, pos.z) + roadLift;
      e.set(0, pos.angle, 0);
      q.setFromEuler(e);
      p.set(pos.x, y, pos.z);
      m.compose(p, q, s);
      meshes.current[type]?.setMatrixAt(sim.indexInType[i], m);
      const body = bodies.current[i];
      if (body) {
        body.setNextKinematicTranslation({ x: pos.x, y: y + spec.height / 2, z: pos.z });
        body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
    });
    for (const mesh of Object.values(meshes.current)) {
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  });

  return (
    <>
      {sim.types.map((t) => (
        <instancedMesh
          key={t}
          ref={(m: InstancedMesh | null) => {
            if (m) meshes.current[t] = m;
          }}
          args={[assets.geometries[t], assets.material, setup.filter((v) => v.type === t).length]}
          castShadow
          receiveShadow
        />
      ))}
    </>
  );
}
