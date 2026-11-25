import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { CylinderGeometry, Mesh, MeshBasicMaterial, OctahedronGeometry, Vector3 } from 'three';
import { SOLDIER, SOLDIER_SQUADS, type SoldierRole } from '../../config/enemies';
import type { RegionId } from '../../config/regions';
import { useApp } from '../../state/appStore';
import { Civilian, type CivilianHandle } from '../characters/Civilian';
import { randomPalette } from '../characters/outfit';
import { heroFeetY, hitHero } from '../combat/heroActions';
import { addImpact } from '../combat/impacts';
import { targets, type Target } from '../combat/targets';
import { LifeBoundary } from '../life/Wildlife';
import { runtime } from '../runtime';
import { mulberry32 } from '../world/cityLayout';
import { createSoldier, damageSoldier, freezeSoldier, separate, SOLDIER_CHEST, soldierDown, stepSoldier, type Soldier, type SoldierEvent } from './soldierBrain';

const TRACERS = 6;
const TRACER_TIME = 0.09;

/** LexCorp colours: dark armour for brutes, green for riflemen. */
const PALETTES: Record<SoldierRole, ReturnType<typeof randomPalette>> = {
  brute: randomPalette(11, { top: '#23262d', bottoms: '#1b1d22', shoes: '#0d0d0f', hair: '#14110f' }),
  rifle: randomPalette(23, { top: '#2f5a43', bottoms: '#22262b', shoes: '#0d0d0f', hair: '#1a1410' }),
};

interface Squad {
  soldiers: Soldier[];
  /** Seconds until a fresh squad replaces one that's all knocked out. */
  respawn: number;
}

/** All soldiers of a region, stepped at the fixed physics rate. */
class SoldierWorld {
  readonly squads: Squad[];
  readonly all: Soldier[];
  readonly hitTargets: Target[];
  readonly tracers: { from: Vector3; to: Vector3; born: number }[] = [];
  clock = 0;
  private readonly rand = mulberry32(777);
  private readonly hero = new Vector3();

  private readonly ground: (x: number, z: number) => number;
  private readonly resolve?: (x: number, z: number, r: number) => { x: number; z: number };

  constructor(regionId: RegionId, ground: (x: number, z: number) => number, resolve?: (x: number, z: number, r: number) => { x: number; z: number }) {
    this.ground = ground;
    this.resolve = resolve;
    const app = useApp.getState();
    // Free roam only for now; story missions place their own enemies.
    const defs = app.mode === 'story' ? [] : SOLDIER_SQUADS[regionId];
    this.squads = defs.map((d) => ({
      respawn: 0,
      soldiers: [
        ...Array.from({ length: d.brutes }, (_, i) => this.spawn('brute', d.x, d.z, i)),
        ...Array.from({ length: d.rifles }, (_, i) => this.spawn('rifle', d.x, d.z, d.brutes + i)),
      ],
    }));
    this.all = this.squads.flatMap((q) => q.soldiers);
    this.hitTargets = this.all.map((s) => ({
      position: { x: s.x, y: s.y + SOLDIER_CHEST, z: s.z },
      radius: SOLDIER.radius,
      alive: true,
      kind: 'enemy' as const,
      damage: (amount, knock) => this.handle(s, damageSoldier(s, amount, knock)),
      freeze: (seconds) => freezeSoldier(s, seconds),
    }));
  }

  private spawn(role: SoldierRole, cx: number, cz: number, i: number) {
    const a = (i / 6) * Math.PI * 2;
    return createSoldier(role, cx + Math.cos(a) * 3, cz + Math.sin(a) * 3, this.ground);
  }

  private handle(s: Soldier, events: SoldierEvent[]) {
    for (const e of events) {
      if (e.type === 'punch' && e.hit) hitHero(e.amount, e.knock, 0.3);
      else if (e.type === 'shot') {
        const p = runtime.playerPosition;
        const to = new Vector3(p.x, heroFeetY() + 1.2, p.z);
        // A miss flies past.
        if (!e.hit) to.add(new Vector3((this.rand() - 0.5) * 4, (this.rand() - 0.3) * 2, (this.rand() - 0.5) * 4));
        this.tracers.push({ from: new Vector3(e.from.x, e.from.y, e.from.z), to, born: this.clock });
        if (this.tracers.length > TRACERS) this.tracers.shift();
        if (e.hit) hitHero(e.amount, null, 0);
      } else if (e.type === 'out') {
        runtime.soldiersOut++;
        addImpact({ x: s.x, y: s.y + 0.3, z: s.z }, 'launch');
      }
    }
  }

  step(dt: number) {
    this.clock += dt;
    const hero = this.hero.set(runtime.playerPosition.x, heroFeetY(), runtime.playerPosition.z);
    const v = runtime.playerVelocity;
    const ctx = { hero, heroSpeed: Math.hypot(v.x, v.z), heroActive: runtime.combat.health > 0, groundY: this.ground, resolve: this.resolve, rand: this.rand };
    for (const q of this.squads) {
      for (const s of q.soldiers) this.handle(s, stepSoldier(s, dt, ctx));
      separate(q.soldiers);
      // The whole squad down: reinforcements later.
      if (q.soldiers.every((s) => s.mode === 'gone')) {
        q.respawn += dt;
        if (q.respawn >= SOLDIER.squadRespawn) {
          q.respawn = 0;
          for (const s of q.soldiers) Object.assign(s, createSoldier(s.role, s.home.x, s.home.z, this.ground));
        }
      }
    }
    let alive = 0;
    this.all.forEach((s, i) => {
      const t = this.hitTargets[i];
      t.position.x = s.x;
      t.position.y = s.y + SOLDIER_CHEST;
      t.position.z = s.z;
      t.alive = !soldierDown(s);
      if (t.alive) alive++;
    });
    runtime.soldiersAlive = alive;
  }
}

/** LexCorp soldier squads of the current region: AI, hits on the hero, tracers. */
export function Soldiers({ regionId, ground, resolve }: { regionId: RegionId; ground: (x: number, z: number) => number; resolve?: (x: number, z: number, r: number) => { x: number; z: number } }) {
  const world = useMemo(() => new SoldierWorld(regionId, ground, resolve), [regionId, ground, resolve]);
  useEffect(() => {
    for (const t of world.hitTargets) targets.add(t);
    return () => {
      for (const t of world.hitTargets) targets.delete(t);
      runtime.soldiersAlive = 0;
    };
  }, [world]);
  useBeforePhysicsStep((w) => world.step(w.timestep * runtime.timeScale));
  const warn = useMemo(() => ({ geo: new OctahedronGeometry(0.16, 0), mat: new MeshBasicMaterial({ color: '#ff2a2a', fog: false }) }), []);
  useEffect(
    () => () => {
      warn.geo.dispose();
      warn.mat.dispose();
    },
    [warn],
  );

  return (
    <LifeBoundary>
      {world.all.map((s, i) => (
        <SoldierActor key={i} s={s} seed={i} warnGeo={warn.geo} warnMat={warn.mat} />
      ))}
      <Tracers world={world} />
    </LifeBoundary>
  );
}

/** One soldier: the shared mannequin in LexCorp colours, animated from its state; a red warning gem flashes before it attacks. */
function SoldierActor({ s, seed, warnGeo, warnMat }: { s: Soldier; seed: number; warnGeo: OctahedronGeometry; warnMat: MeshBasicMaterial }) {
  const ref = useRef<CivilianHandle>(null);
  const warn = useRef<Mesh>(null);
  const last = useRef('');
  useFrame(() => {
    const h = ref.current;
    const r = h?.root;
    if (!h || !r) return;
    r.visible = s.mode !== 'gone';
    if (!r.visible) return;
    r.position.set(s.x, s.y, s.z);
    const lying = s.mode === 'launched' ? -s.tumble : s.mode === 'out' || s.mode === 'down' ? -Math.PI / 2 * (s.mode === 'down' ? Math.min(1, s.timer / 0.6) : 1) : 0;
    r.rotation.set(lying, s.heading, 0, 'YXZ');
    const speed = Math.hypot(s.vx, s.vz);
    // Clip per state (one-shots restart when the state changes).
    let clip = 'Idle_Loop';
    let rate = 1;
    let once = false;
    if (s.frozen > 0) rate = 0;
    else if (s.mode === 'windup') {
      clip = s.role === 'brute' ? 'Punch_Cross' : 'Spell_Simple_Shoot';
      once = true;
      rate = s.role === 'brute' ? 1.2 : 1;
    } else if (s.mode === 'stagger') {
      clip = 'Hit_Chest';
      once = true;
      rate = 1.6;
    } else if (s.mode === 'launched' || s.mode === 'out' || s.mode === 'down') {
      clip = 'Death01';
      once = true;
      rate = 1.5;
    } else if (speed > 3.5) {
      clip = 'Jog_Fwd_Loop';
      rate = speed / 3.2;
    } else if (speed > 0.3) {
      clip = 'Walk_Loop';
      rate = speed / 1.4;
    }
    const key = `${clip}:${s.mode}`;
    if (key !== last.current) {
      last.current = key;
      h.play(clip, rate, once);
    }
    if (warn.current) {
      warn.current.visible = s.mode === 'windup';
      warn.current.position.set(s.x, s.y + SOLDIER.height + 0.45, s.z);
      warn.current.rotation.y += 0.15;
    }
  });
  return (
    <>
      <Civilian ref={ref} seed={seed + 300} palette={PALETTES[s.role]} height={SOLDIER.height} animateWithin={90} visibleWithin={220} castShadow={false} />
      <mesh ref={warn} geometry={warnGeo} material={warnMat} visible={false} />
    </>
  );
}

/** Rifle shots: a brief bright streak from the muzzle. */
function Tracers({ world }: { world: SoldierWorld }) {
  const assets = useMemo(() => ({ geo: new CylinderGeometry(0.03, 0.03, 1, 4, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), mat: new MeshBasicMaterial({ color: '#ffe08a', fog: false }) }), []);
  useEffect(
    () => () => {
      assets.geo.dispose();
      assets.mat.dispose();
    },
    [assets],
  );
  const meshes = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    meshes.current.forEach((m, i) => {
      if (!m) return;
      const t = world.tracers[i];
      m.visible = !!t && world.clock - t.born < TRACER_TIME;
      if (!t || !m.visible) return;
      m.position.copy(t.from);
      m.lookAt(t.to);
      m.scale.set(1, 1, t.from.distanceTo(t.to));
    });
  });
  return (
    <>
      {Array.from({ length: TRACERS }, (_, i) => (
        <mesh key={i} ref={(m) => void (meshes.current[i] = m)} geometry={assets.geo} material={assets.mat} visible={false} frustumCulled={false} />
      ))}
    </>
  );
}
