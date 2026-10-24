import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BoxGeometry, Color, CylinderGeometry, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { DRONE, DRONE_PATROLS } from '../../config/combat';
import type { RegionId } from '../../config/regions';
import { runtime } from '../runtime';
import { mulberry32 } from '../world/cityLayout';
import { merged, part } from '../world/propGeometries';
import { createDrone, damageDrone, fireBolt, stepBolts, stepDrone, type Bolt, type Drone } from './drone';
import { heroFeetY, knockOut } from './heroActions';
import { targets, type Target } from './targets';

const MAX_BOLTS = 48;
const MAX_BLASTS = 8;
const BLAST_TIME = 0.6;
const BODY = '#3a3f46';

/** Original drone design: armoured saucer body, four rotor pods, a chin cannon. Faces +Z. */
function droneGeometry() {
  const arms = [45, 135, 225, 315].flatMap((deg) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.sin(a) * 0.95;
    const z = Math.cos(a) * 0.95;
    return [
      part(new BoxGeometry(0.14, 0.1, 0.9).rotateY(a), '#23262b', x * 0.55, 0, z * 0.55),
      part(new CylinderGeometry(0.42, 0.42, 0.06, 14), '#16181b', x, 0.08, z),
      part(new CylinderGeometry(0.1, 0.12, 0.2, 8), BODY, x, 0, z),
    ];
  });
  return merged([
    part(new SphereGeometry(0.62, 16, 10).scale(1, 0.42, 1), BODY),
    part(new CylinderGeometry(0.35, 0.5, 0.18, 14), '#5a6068', 0, 0.22, 0),
    part(new BoxGeometry(0.12, 0.12, 0.7), '#16181b', 0, -0.28, 0.35),
    ...arms,
  ]);
}

/**
 * Prometheus drone patrols for the current region: simulation at the fixed
 * step (patrol, attack, shoot, wreck, respawn), bolts that hurt the hero,
 * instanced rendering with hit flashes, burning wrecks and explosions.
 */
export function Drones({ regionId, ground }: { regionId: RegionId; ground: (x: number, z: number) => number }) {
  /** Simulation clock (s), for explosion ages. */
  const clock = useRef(0);
  const sim = useMemo(() => {
    const rand = mulberry32(911);
    const drones: Drone[] = DRONE_PATROLS[regionId].flatMap((p) =>
      Array.from({ length: p.count }, (_, i) => createDrone({ x: p.x, z: p.z, radius: p.radius }, (i / p.count) * Math.PI * 2, ground)),
    );
    const bolts: Bolt[] = [];
    const blasts: { x: number; y: number; z: number; born: number }[] = [];
    const hitTargets: Target[] = drones.map((d) => ({
      position: { x: d.x, y: d.y, z: d.z },
      radius: DRONE.radius,
      alive: true,
      damage: (amount, knock) => {
        if (damageDrone(d, amount, knock)) {
          runtime.dronesDestroyed++;
          blasts.push({ x: d.x, y: d.y, z: d.z, born: clock.current });
          if (blasts.length > MAX_BLASTS) blasts.shift();
        }
      },
    }));
    return { drones, bolts, blasts, hitTargets, rand };
  }, [regionId, ground]);

  useEffect(() => {
    for (const t of sim.hitTargets) targets.add(t);
    return () => {
      for (const t of sim.hitTargets) targets.delete(t);
      runtime.dronesAlive = 0;
    };
  }, [sim]);

  const hero = useMemo(() => new Vector3(), []);
  useBeforePhysicsStep((w) => {
    const dt = w.timestep;
    hero.set(runtime.playerPosition.x, heroFeetY(), runtime.playerPosition.z);
    const heroActive = runtime.combat.health > 0;
    let alive = 0;
    sim.drones.forEach((d, i) => {
      const shot = stepDrone(d, dt, { hero, heroActive, groundY: ground, rand: sim.rand });
      if (shot) fireBolt(sim.bolts, shot, MAX_BOLTS);
      const t = sim.hitTargets[i];
      t.position.x = d.x;
      t.position.y = d.y;
      t.position.z = d.z;
      t.alive = d.mode === 'patrol' || d.mode === 'attack';
      if (t.alive) alive++;
    });
    runtime.dronesAlive = alive;
    const hits = stepBolts(sim.bolts, dt, hero, heroActive, ground);
    for (let i = 0; i < hits; i++) if (runtime.combat.takeDamage(DRONE.boltDamage)) knockOut();
    clock.current += dt;
  });

  const assets = useMemo(() => {
    const body = droneGeometry();
    const bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6, flatShading: true });
    const eye = new SphereGeometry(0.13, 10, 8).translate(0, -0.02, 0.55);
    const eyeMat = new MeshBasicMaterial({ color: '#ff2a1a' });
    const bolt = new BoxGeometry(0.12, 0.12, 1.8);
    const boltMat = new MeshBasicMaterial({ color: '#ff4a2a', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, fog: false });
    const fire = new IcosahedronGeometry(1, 1);
    const fireMat = new MeshBasicMaterial({ color: '#ff7a1a', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false });
    return { body, bodyMat, eye, eyeMat, bolt, boltMat, fire, fireMat };
  }, []);
  useEffect(
    () => () => {
      for (const v of Object.values(assets)) v.dispose();
    },
    [assets],
  );

  const bodies = useRef<InstancedMesh>(null);
  const eyes = useRef<InstancedMesh>(null);
  const boltMesh = useRef<InstancedMesh>(null);
  const fires = useRef<InstancedMesh>(null);
  const scratch = useRef({ m: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(), z: new Vector3(0, 0, 1), d: new Vector3(), white: new Color('#ffffff'), base: new Color('#ffffff'), red: new Color('#ff2a1a'), dark: new Color('#3a2a22'), hidden: new Matrix4().makeScale(0, 0, 0), clock: 0 });

  useFrame((_, dt) => {
    const sc = scratch.current;
    sc.clock += dt;
    const { m, q, e, p, s } = sc;
    const b = bodies.current;
    const ey = eyes.current;
    if (b && ey) {
      sim.drones.forEach((d, i) => {
        if (d.mode === 'down') {
          b.setMatrixAt(i, sc.hidden);
          ey.setMatrixAt(i, sc.hidden);
          return;
        }
        // Banks into its motion; wrecks tumble.
        const tilt = d.mode === 'wreck' ? 0.9 : Math.max(-0.4, Math.min(0.4, Math.hypot(d.vx, d.vz) * 0.025));
        e.set(tilt, d.heading + d.spin, d.mode === 'wreck' ? 0.5 : 0, 'YXZ');
        q.setFromEuler(e);
        p.set(d.x, d.y, d.z);
        s.setScalar(1.25);
        m.compose(p, q, s);
        b.setMatrixAt(i, m);
        ey.setMatrixAt(i, m);
        b.setColorAt(i, d.mode === 'wreck' ? sc.dark : d.sinceHit < 0.08 ? sc.white : sc.base);
        ey.setColorAt(i, d.mode === 'wreck' ? sc.dark : sc.red);
      });
      b.instanceMatrix.needsUpdate = true;
      ey.instanceMatrix.needsUpdate = true;
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
      if (ey.instanceColor) ey.instanceColor.needsUpdate = true;
    }

    const bm = boltMesh.current;
    if (bm) {
      for (let i = 0; i < MAX_BOLTS; i++) {
        const bolt = sim.bolts[i];
        if (!bolt) {
          bm.setMatrixAt(i, sc.hidden);
          continue;
        }
        q.setFromUnitVectors(sc.z, sc.d.set(bolt.dx, bolt.dy, bolt.dz));
        p.set(bolt.x, bolt.y, bolt.z);
        s.setScalar(1);
        m.compose(p, q, s);
        bm.setMatrixAt(i, m);
      }
      bm.instanceMatrix.needsUpdate = true;
    }

    // Burning wrecks and explosion flashes share one mesh.
    const f = fires.current;
    if (f) {
      let n = 0;
      for (const d of sim.drones) {
        if (d.mode !== 'wreck' || n >= sim.drones.length) continue;
        p.set(d.x, d.y + 0.4, d.z);
        s.setScalar(0.5 + Math.abs(Math.sin(sc.clock * 13 + d.phase)) * 0.35);
        m.compose(p, q.identity(), s);
        f.setMatrixAt(n++, m);
      }
      for (const bl of sim.blasts) {
        const age = clock.current - bl.born;
        if (age > BLAST_TIME || n >= sim.drones.length + MAX_BLASTS) continue;
        p.set(bl.x, bl.y, bl.z);
        s.setScalar(0.5 + (age / BLAST_TIME) * 4.5);
        m.compose(p, q.identity(), s);
        f.setMatrixAt(n++, m);
      }
      f.count = n;
      f.instanceMatrix.needsUpdate = true;
    }
  });

  if (sim.drones.length === 0) return null;
  return (
    <group>
      <instancedMesh ref={bodies} args={[assets.body, assets.bodyMat, sim.drones.length]} castShadow frustumCulled={false} />
      <instancedMesh ref={eyes} args={[assets.eye, assets.eyeMat, sim.drones.length]} frustumCulled={false} />
      <instancedMesh ref={boltMesh} args={[assets.bolt, assets.boltMat, MAX_BOLTS]} frustumCulled={false} />
      <instancedMesh ref={fires} args={[assets.fire, assets.fireMat, sim.drones.length + MAX_BLASTS]} frustumCulled={false} />
    </group>
  );
}
