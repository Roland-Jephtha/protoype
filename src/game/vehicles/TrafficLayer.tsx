import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry } from 'three';
import { LIFT, VEHICLE_DAMAGE } from '../../config/combat';
import { useApp } from '../../state/appStore';
import { liftSources, wreckRequests, type LiftCandidate, type LiftSource } from '../combat/liftables';
import { addImpact } from '../combat/impacts';
import { targets, type Target } from '../combat/targets';
import { runtime } from '../runtime';
import { lightState, stepTraffic, type Lane, type Vehicle } from './traffic';
import { VEHICLES, type VehicleType } from './vehicleGeometry';

const HIDDEN = new Matrix4().makeScale(0, 0, 0);

/** Takes a vehicle off the road for `seconds` (the hero lifted it). */
function takeVehicle(v: Vehicle, seconds: number) {
  v.out = seconds;
  v.speed = 0;
}

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

  // Vehicles are targets: heat vision burns them, freeze breath ices them, big hits knock them flying.
  const hitTargets = useMemo(
    () =>
      sim.vehicles.map((v, i): Target => {
        const spec = VEHICLES[setup[i].type];
        let health: number = VEHICLE_DAMAGE.health;
        const wreck = (knock: { x: number; y: number; z: number }, burnt: boolean) => {
          const p = lanes[v.lane].path.at(v.s);
          wreckRequests.push({ type: setup[i].type, paint: burnt ? VEHICLE_DAMAGE.burntPaint : setup[i].paint, x: p.x, y: groundY(p.x, p.z) + roadLift + 0.2, z: p.z, yaw: p.angle, vx: knock.x, vy: Math.max(4, knock.y), vz: knock.z });
          addImpact(t.position, 'power');
          if (burnt) runtime.carsDestroyed++;
          takeVehicle(v, LIFT.respawnDelay);
          health = VEHICLE_DAMAGE.health;
        };
        const t: Target = {
          position: { x: 0, y: -100, z: 0 },
          radius: Math.max(spec.length, spec.width) * 0.45,
          alive: false,
          damage: (amount, knock) => {
            if (v.out) return;
            health -= amount;
            if (Math.hypot(knock.x, knock.y, knock.z) >= VEHICLE_DAMAGE.launchKnock) wreck(knock, health <= 0);
            else if (health <= 0) wreck({ x: 0, y: 6, z: 0 }, true);
          },
          freeze: (seconds) => {
            if (!v.out) v.frozen = Math.min(VEHICLE_DAMAGE.maxFreeze, (v.frozen ?? 0) + seconds);
          },
        };
        return t;
      }),
    [sim, setup, lanes, groundY, roadLift],
  );
  useEffect(() => {
    for (const t of hitTargets) targets.add(t);
    return () => {
      for (const t of hitTargets) targets.delete(t);
    };
  }, [hitTargets]);

  // The hero can pick these vehicles up.
  useEffect(() => {
    const source: LiftSource = {
      nearest: (x, y, z, maxDistance) => {
        let best: LiftCandidate | null = null;
        sim.vehicles.forEach((v, i) => {
          if (v.out) return;
          const p = lanes[v.lane].path.at(v.s);
          const vy = groundY(p.x, p.z) + roadLift;
          const d = Math.hypot(p.x - x, vy + 0.8 - y, p.z - z);
          if (d <= maxDistance && (!best || d < best.distance)) best = { source, key: i, type: setup[i].type, paint: setup[i].paint, x: p.x, y: vy, z: p.z, yaw: p.angle, distance: d };
        });
        return best;
      },
      take: (key) => takeVehicle(sim.vehicles[key], LIFT.respawnDelay),
    };
    liftSources.add(source);
    return () => {
      liftSources.delete(source);
    };
  }, [sim, lanes, setup, groundY, roadLift]);

  const meshes = useRef<Partial<Record<VehicleType, InstancedMesh>>>({});
  const frozenShown = useRef<boolean[]>([]);
  const colorsDirty = useRef(false);
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
      const target = hitTargets[i];
      target.alive = !v.out;
      // Lifted or thrown by the hero: hidden here until it comes back.
      if (v.out) {
        target.position.y = -100;
        meshes.current[type]?.setMatrixAt(sim.indexInType[i], HIDDEN);
        bodies.current[i]?.setNextKinematicTranslation({ x: 0, y: -100 - i, z: 0 });
        return;
      }
      const pos = lanes[v.lane].path.at(v.s);
      const y = groundY(pos.x, pos.z) + roadLift;
      e.set(0, pos.angle, 0);
      q.setFromEuler(e);
      p.set(pos.x, y, pos.z);
      m.compose(p, q, s);
      meshes.current[type]?.setMatrixAt(sim.indexInType[i], m);
      target.position.x = pos.x;
      target.position.y = y + spec.height / 2;
      target.position.z = pos.z;
      // Ice tint while frozen (only touched when it changes).
      const frozen = (v.frozen ?? 0) > 0;
      if (frozen !== frozenShown.current[i]) {
        frozenShown.current[i] = frozen;
        meshes.current[type]?.setColorAt(sim.indexInType[i], scratch.c.set(frozen ? '#bfe6ff' : setup[i].paint));
        colorsDirty.current = true;
      }
      const body = bodies.current[i];
      if (body) {
        body.setNextKinematicTranslation({ x: pos.x, y: y + spec.height / 2, z: pos.z });
        body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      }
    });
    for (const mesh of Object.values(meshes.current)) {
      if (!mesh) continue;
      if (colorsDirty.current && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    }
    colorsDirty.current = false;
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
          // Vehicles move every frame: skip culling rather than recomputing bounds per frame.
          frustumCulled={false}
        />
      ))}
    </>
  );
}
