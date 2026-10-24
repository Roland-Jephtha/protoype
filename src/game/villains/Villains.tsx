import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, ConeGeometry, CylinderGeometry, DoubleSide, IcosahedronGeometry, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from 'three';
import type { RegionId } from '../../config/regions';
import { VILLAIN_AI, VILLAIN_LAIRS, VILLAINS } from '../../config/villains';
import { useApp } from '../../state/appStore';
import { heroFeetY, hitHero } from '../combat/heroActions';
import { targets, type Target } from '../combat/targets';
import { LifeBoundary } from '../life/Wildlife';
import { runtime } from '../runtime';
import { mulberry32 } from '../world/cityLayout';
import { VillainModel, type VillainAnim, type VillainModelHandle } from './VillainModel';
import { createVillain, damageVillain, spawnOmega, stepOmega, stepVillain, villainCentre, type OmegaBolt, type Villain, type VillainEvent } from './villainBrain';

const MAX_OMEGA = 24;
const MAX_WAVES = 4;
const WAVE_TIME = 0.6;

/** Everything the villains of one region simulate, stepped at the fixed physics rate. */
class VillainWorld {
  readonly villains: Villain[];
  readonly omega: OmegaBolt[] = [];
  readonly waves: { x: number; y: number; z: number; radius: number; born: number }[] = [];
  readonly hitTargets: Target[];
  clock = 0;
  private readonly rand = mulberry32(4040);
  private readonly hero = new Vector3();
  private readonly ground: (x: number, z: number) => number;

  constructor(regionId: RegionId, ground: (x: number, z: number) => number) {
    this.ground = ground;
    this.villains = VILLAIN_LAIRS[regionId].map((l) => createVillain(VILLAINS[l.id], l.x, l.z, ground));
    this.hitTargets = this.villains.map((v) => ({
      position: villainCentre(v, { x: 0, y: 0, z: 0 }),
      radius: v.def.heightMeters * 0.32,
      alive: true,
      damage: (amount, knock) => this.handle(v, damageVillain(v, amount, knock)),
    }));
  }

  private handle(v: Villain, events: VillainEvent[]) {
    for (const e of events) {
      if (e.type === 'hitHero') hitHero(e.amount, e.knock, e.controlLoss);
      else if (e.type === 'freezeHero') runtime.heroFrozen = Math.max(runtime.heroFrozen, e.seconds);
      else if (e.type === 'omega') this.omega.push(...spawnOmega(e.from, e.count, this.rand).slice(0, Math.max(0, MAX_OMEGA - this.omega.length)));
      else if (e.type === 'shockwave') {
        this.waves.push({ ...e, born: this.clock });
        if (this.waves.length > MAX_WAVES) this.waves.shift();
      } else if (e.type === 'engaged') useApp.getState().showToast(`${v.def.name} — ${v.def.title}`);
      else if (e.type === 'defeated') {
        runtime.villainsDefeated++;
        useApp.getState().showToast(`${v.def.name} is down!`);
      }
    }
  }

  step(dt: number) {
    this.clock += dt;
    const hero = this.hero.set(runtime.playerPosition.x, heroFeetY(), runtime.playerPosition.z);
    const heroActive = runtime.combat.health > 0;
    let boss: Villain | null = null;
    let bossDist = Infinity;
    this.villains.forEach((v, i) => {
      this.handle(v, stepVillain(v, dt, { hero, heroActive, groundY: this.ground, rand: this.rand }));
      const t = this.hitTargets[i];
      villainCentre(v, t.position);
      t.alive = v.mode !== 'defeated' && v.mode !== 'gone';
      const d = Math.hypot(v.x - hero.x, v.z - hero.z);
      if (t.alive && v.mode !== 'dormant' && d < bossDist) {
        boss = v;
        bossDist = d;
      }
    });
    const b = boss as Villain | null;
    runtime.boss = b ? { name: b.def.name, health: b.health, max: b.def.health } : null;
    const hits = stepOmega(this.omega, dt, hero, heroActive, this.ground);
    for (let i = 0; i < hits; i++) hitHero(VILLAIN_AI.omegaDamage, { x: 0, y: 3, z: 0 }, 0.3);
  }
}

/** Villains of the current region: AI at the fixed step, hits on the hero, and their power effects. */
export function Villains({ regionId, ground }: { regionId: RegionId; ground: (x: number, z: number) => number }) {
  const world = useMemo(() => new VillainWorld(regionId, ground), [regionId, ground]);

  useEffect(() => {
    for (const t of world.hitTargets) targets.add(t);
    return () => {
      for (const t of world.hitTargets) targets.delete(t);
      runtime.boss = null;
    };
  }, [world]);

  useBeforePhysicsStep((w) => world.step(w.timestep));

  return (
    <LifeBoundary>
      {world.villains.map((v, i) => (
        <VillainActor key={i} v={v} />
      ))}
      <PowerFx world={world} />
    </LifeBoundary>
  );
}

/** One villain's model, placed and animated from its simulation state. */
function VillainActor({ v }: { v: Villain }) {
  const ref = useRef<VillainModelHandle>(null);
  useFrame(() => {
    const h = ref.current;
    const r = h?.root;
    if (!h || !r) return;
    r.visible = v.mode !== 'gone';
    r.position.set(v.x, v.y, v.z);
    // Sent flying: tumble; beaten: lie on the back; downed: getting up.
    const tilt =
      v.mode === 'launched'
        ? -v.tumble
        : v.mode === 'defeated'
          ? v.vy === 0
            ? -Math.PI / 2
            : -v.tumble
          : v.mode === 'downed'
            ? (-Math.PI / 2) * Math.min(1, v.timer / VILLAIN_AI.getUpTime)
            : 0;
    r.rotation.set(tilt, v.heading, 0, 'YXZ');
    const speed = Math.hypot(v.vx, v.vz);
    let anim: VillainAnim = 'idle';
    let rate = 1;
    if (v.mode === 'launched' || v.mode === 'defeated' || v.mode === 'leap' || v.mode === 'downed') anim = 'fall';
    else if (v.mode === 'windup') anim = 'taunt';
    else if (v.flying || (v.def.canFly && v.mode === 'charge')) anim = speed > 6 || v.mode === 'charge' ? 'fly' : 'idle';
    else if (v.mode === 'charge') {
      anim = 'run';
      rate = 2;
    } else if (speed > v.def.walkSpeed * 1.6) {
      anim = 'run';
      rate = Math.min(2.2, speed / 5);
    } else if (speed > 0.4) {
      anim = 'walk';
      rate = Math.min(2, speed / 1.5);
    }
    h.play(anim, rate);
    h.punch(v.punch?.side ?? 'right', v.punch ? v.punch.t / 0.4 : -1);
  });
  return <VillainModel ref={ref} def={v.def} />;
}

/** Heat beams, freeze breath, Omega beams and shockwave rings. */
function PowerFx({ world }: { world: VillainWorld }) {
  const { villains, omega, waves } = world;
  const assets = useMemo(() => {
    const beamGeo = new CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
    const beam = new MeshBasicMaterial({ color: '#ff3020', transparent: true, opacity: 0.85, blending: AdditiveBlending, depthWrite: false, fog: false });
    const coneGeo = new ConeGeometry(1, 1, 16, 1, true).translate(0, -0.5, 0).rotateX(Math.PI);
    const frost = new MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0.35, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const orbGeo = new IcosahedronGeometry(0.45, 1);
    // Solid core: additive red washes out to white against a bright sky.
    const orb = new MeshBasicMaterial({ color: '#ff1030', fog: false });
    const ringGeo = new RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    // One material per ring: each fades on its own.
    const rings = Array.from({ length: MAX_WAVES }, () => new MeshBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false }));
    return { beamGeo, beam, coneGeo, frost, orbGeo, orb, ringGeo, rings };
  }, []);
  useEffect(
    () => () => {
      for (const a of Object.values(assets)) (Array.isArray(a) ? a : [a]).forEach((x) => x.dispose());
    },
    [assets],
  );

  const beams = useRef<(Mesh | null)[]>([]);
  const cones = useRef<(Mesh | null)[]>([]);
  const orbs = useRef<InstancedMesh>(null);
  const rings = useRef<(Mesh | null)[]>([]);
  const tmp = useRef({ eye: new Vector3(), dir: new Vector3(), up: new Vector3(0, 1, 0), q: new Quaternion(), m: new Matrix4(), hidden: new Matrix4().makeScale(0, 0, 0) });

  useFrame(() => {
    const t = tmp.current;
    villains.forEach((v, i) => {
      const beam = beams.current[i];
      const cone = cones.current[i];
      const firing = v.mode === 'beam' || v.mode === 'breath';
      if (beam) beam.visible = v.mode === 'beam';
      if (cone) cone.visible = v.mode === 'breath';
      if (!firing) return;
      // From the eyes (or mouth) toward the trailing aim point.
      t.eye.set(v.x, v.y + v.def.heightMeters * 0.92, v.z);
      t.dir.set(v.aim.x - t.eye.x, v.aim.y - t.eye.y, v.aim.z - t.eye.z);
      const len = Math.min(t.dir.length(), v.mode === 'beam' ? VILLAIN_AI.beamRange : VILLAIN_AI.freezeRange);
      t.dir.normalize();
      t.q.setFromUnitVectors(t.up, t.dir);
      const mesh = v.mode === 'beam' ? beam : cone;
      if (!mesh) return;
      mesh.position.copy(t.eye);
      mesh.quaternion.copy(t.q);
      if (v.mode === 'beam') mesh.scale.set(0.06, len, 0.06);
      else mesh.scale.set(len * 0.35, len, len * 0.35);
    });

    const o = orbs.current;
    if (o) {
      for (let i = 0; i < MAX_OMEGA; i++) {
        const b = omega[i];
        if (!b) o.setMatrixAt(i, t.hidden);
        else o.setMatrixAt(i, t.m.makeTranslation(b.x, b.y, b.z));
      }
      o.instanceMatrix.needsUpdate = true;
    }

    rings.current.forEach((r, i) => {
      if (!r) return;
      const w = waves[i];
      const age = w ? world.clock - w.born : Infinity;
      r.visible = age < WAVE_TIME;
      if (!w || !r.visible) return;
      r.position.set(w.x, w.y + 0.2, w.z);
      r.scale.setScalar(1 + (age / WAVE_TIME) * w.radius);
      (r.material as MeshBasicMaterial).opacity = 0.7 * (1 - age / WAVE_TIME);
    });
  });

  return (
    <group>
      {villains.map((_, i) => (
        <group key={i}>
          <mesh ref={(m) => void (beams.current[i] = m)} geometry={assets.beamGeo} material={assets.beam} visible={false} frustumCulled={false} />
          <mesh ref={(m) => void (cones.current[i] = m)} geometry={assets.coneGeo} material={assets.frost} visible={false} frustumCulled={false} />
        </group>
      ))}
      <instancedMesh ref={orbs} args={[assets.orbGeo, assets.orb, MAX_OMEGA]} frustumCulled={false} />
      {Array.from({ length: MAX_WAVES }, (_, i) => (
        <mesh key={i} ref={(m) => void (rings.current[i] = m)} geometry={assets.ringGeo} material={assets.rings[i]} visible={false} frustumCulled={false} />
      ))}
    </group>
  );
}
