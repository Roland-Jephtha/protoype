import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { BoxGeometry, Color, CylinderGeometry, Euler, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { merged, part } from '../world/propGeometries';
import type { PathDef } from '../world/terrainNoise';
import { samplePath } from './traffic';

/** Freight train timings and sizes (m, m/s). 24 m/s ≈ 86 km/h: a sprint can just keep up, flight wins. */
const TRAIN = {
  speed: 24,
  locoLength: 18,
  wagonLength: 15,
  gap: 1.2,
  wagons: 6,
  width: 3.1,
  height: 4.2,
  /** Hidden run past the end of the line before the train starts over (m). */
  layover: 400,
};

const WAGON_PAINT = ['#7a3a24', '#2f4f6b', '#6b6b2f', '#8c8f93', '#7a3a24', '#3d5a3a'];
const DARK = '#1c1d20';

function wheelSets(axles: number[]) {
  return axles.flatMap((z) => [-0.75, 0.75].map((x) => part(new CylinderGeometry(0.48, 0.48, 0.2, 10).rotateZ(Math.PI / 2), DARK, x, 0.48, z)));
}

function locomotiveGeometry() {
  const L = TRAIN.locoLength;
  return merged([
    part(new BoxGeometry(2.9, 0.5, L), DARK, 0, 1.15, 0), // frame
    part(new BoxGeometry(2.7, 2.6, L - 5), '#c7372f', 0, 2.7, -1.6), // engine hood
    part(new BoxGeometry(3.0, 3.1, 4.2), '#c7372f', 0, 2.95, L / 2 - 2.6), // cab
    part(new BoxGeometry(3.02, 0.9, 3.2), '#1d2a36', 0, 3.6, L / 2 - 2.6), // cab windows
    part(new BoxGeometry(3.04, 0.35, L), '#f2c230', 0, 1.6, 0), // stripe
    part(new BoxGeometry(0.5, 0.3, 0.1), '#fff3c4', 0, 4.3, L / 2 - 0.45), // headlight
    ...wheelSets([-L / 2 + 2, -L / 2 + 3.4, L / 2 - 3.4, L / 2 - 2]),
  ]);
}

function wagonGeometry() {
  const L = TRAIN.wagonLength;
  return merged([
    part(new BoxGeometry(2.9, 0.45, L), DARK, 0, 1.1, 0),
    part(new BoxGeometry(3.0, 2.9, L - 0.4), '#ffffff', 0, 2.75, 0), // box body (tinted per wagon)
    part(new BoxGeometry(3.04, 0.2, L - 0.2), '#d0d0d0', 0, 4.25, 0), // roof
    part(new BoxGeometry(3.06, 2.2, 2.4), '#bbbbbb', 0, 2.6, 0), // sliding door
    ...wheelSets([-L / 2 + 1.6, -L / 2 + 3, L / 2 - 3, L / 2 - 1.6]),
  ]);
}

/**
 * A freight train running the length of the forest railway at a steady speed,
 * then starting over from the far end after a hidden layover. Each car is a
 * kinematic box, so the hero can't run through it. Race it: the HUD toasts
 * when you draw level and when you pull ahead.
 */
export function Train({ rail, ground, railTop }: { rail: PathDef; ground: (x: number, z: number) => number; railTop: number }) {
  const { world, rapier } = useRapier();
  const path = useMemo(() => samplePath(rail.points), [rail]);
  /** Distance from the train's front to each car's centre. */
  const cars = useMemo(() => {
    const out = [{ offset: TRAIN.locoLength / 2, length: TRAIN.locoLength }];
    let back = TRAIN.locoLength + TRAIN.gap;
    for (let i = 0; i < TRAIN.wagons; i++) {
      out.push({ offset: back + TRAIN.wagonLength / 2, length: TRAIN.wagonLength });
      back += TRAIN.wagonLength + TRAIN.gap;
    }
    return { list: out, total: back };
  }, []);

  const assets = useMemo(() => ({ loco: locomotiveGeometry(), wagon: wagonGeometry(), material: new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, flatShading: true }) }), []);
  useEffect(
    () => () => {
      assets.loco.dispose();
      assets.wagon.dispose();
      assets.material.dispose();
    },
    [assets],
  );

  const bodies = useRef<RAPIER.RigidBody[]>([]);
  useEffect(() => {
    bodies.current = cars.list.map((c) => {
      const body = world.createRigidBody(rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -200, 0));
      world.createCollider(rapier.ColliderDesc.cuboid(TRAIN.width / 2, TRAIN.height / 2, c.length / 2), body);
      return body;
    });
    return () => {
      for (const b of bodies.current) if (world.getRigidBody(b.handle)) world.removeRigidBody(b);
      bodies.current = [];
    };
  }, [world, rapier, cars]);

  const locoMesh = useRef<InstancedMesh>(null);
  const wagonMesh = useRef<InstancedMesh>(null);
  useEffect(() => {
    const mesh = wagonMesh.current;
    if (!mesh) return;
    const c = new Color();
    for (let i = 0; i < TRAIN.wagons; i++) mesh.setColorAt(i, c.set(WAGON_PAINT[i % WAGON_PAINT.length]));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  const scratch = useMemo(() => ({ m: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(1, 1, 1), hidden: new Matrix4().makeTranslation(0, -200, 0) }), []);
  /** Front of the train, distance along the line. Starts partway in so it's visible soon after arrival. */
  const front = useRef(path.length * 0.35);
  const race = useRef<'idle' | 'level' | 'won'>('idle');
  const raceCheck = useRef(0);

  useFrame((_, rawDt) => {
    if (useApp.getState().paused) return;
    const dt = Math.min(rawDt, 0.05);
    front.current += TRAIN.speed * dt;
    if (front.current > path.length + cars.total + TRAIN.layover) front.current = 0;
    runtime.trainFront = front.current;

    const { m, q, e, p, s } = scratch;
    cars.list.forEach((c, i) => {
      const along = front.current - c.offset;
      const visible = along - c.length / 2 > 0 && along + c.length / 2 < path.length;
      const body = bodies.current[i];
      const mesh = i === 0 ? locoMesh.current : wagonMesh.current;
      const index = i === 0 ? 0 : i - 1;
      if (!visible) {
        mesh?.setMatrixAt(index, scratch.hidden);
        body?.setNextKinematicTranslation({ x: 0, y: -200 - i * 10, z: 0 });
        return;
      }
      // Heading from the two bogies so cars bend smoothly through curves.
      const a = path.at(along + c.length * 0.35);
      const b = path.at(along - c.length * 0.35);
      const x = (a.x + b.x) / 2;
      const z = (a.z + b.z) / 2;
      const y = ground(x, z) + railTop;
      e.set(0, Math.atan2(a.x - b.x, a.z - b.z), 0);
      q.setFromEuler(e);
      p.set(x, y, z);
      m.compose(p, q, s);
      mesh?.setMatrixAt(index, m);
      body?.setNextKinematicTranslation({ x, y: y + TRAIN.height / 2, z });
      body?.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
      if (i === 0) runtime.trainPosition.set(x, y, z);
    });
    for (const mesh of [locoMesh.current, wagonMesh.current]) if (mesh) mesh.instanceMatrix.needsUpdate = true;

    // Race toasts (checked a few times a second).
    raceCheck.current += dt;
    if (raceCheck.current < 0.25) return;
    raceCheck.current = 0;
    const head = path.at(front.current);
    const fx = Math.sin(head.angle);
    const fz = Math.cos(head.angle);
    const dx = runtime.playerPosition.x - head.x;
    const dz = runtime.playerPosition.z - head.z;
    const ahead = dx * fx + dz * fz;
    const side = Math.abs(dx * fz - dz * fx);
    const speed = Math.hypot(runtime.playerVelocity.x, runtime.playerVelocity.z);
    const onLine = front.current > 0 && front.current < path.length;
    if (!onLine || side > 60) {
      if (side > 120 || !onLine) race.current = 'idle';
      return;
    }
    if (race.current === 'idle' && ahead > -cars.total && ahead < 10 && speed > 15) {
      race.current = 'level';
      useApp.getState().showToast(`Racing the freight train: ${Math.round(TRAIN.speed * 3.6)} km/h`);
    } else if (race.current === 'level' && ahead > 60) {
      race.current = 'won';
      useApp.getState().showToast('You beat the train!');
    }
  });

  return (
    <>
      <instancedMesh ref={locoMesh} args={[assets.loco, assets.material, 1]} castShadow receiveShadow frustumCulled={false} />
      <instancedMesh ref={wagonMesh} args={[assets.wagon, assets.material, TRAIN.wagons]} castShadow receiveShadow frustumCulled={false} />
    </>
  );
}
