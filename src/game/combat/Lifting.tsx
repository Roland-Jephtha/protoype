import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Euler, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type Mesh } from 'three';
import { LIFT } from '../../config/combat';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { VEHICLES } from '../vehicles/vehicleGeometry';
import { buildLiftGeometry, clubAngle, LIFT_LABEL, ONE_HANDED, type LiftKind } from './liftShapes';
import { inCone } from './targets';
import { HIT_STOP } from '../../config/combat';
import { heroFeetY } from './heroActions';
import { addImpact } from './impacts';
import { liftSources, nearestLiftable, wreckRequests, type LiftCandidate, type LiftSource, type WreckRequest } from './liftables';
import { targets, type Target } from './targets';


const tmpHalf = new Vector3();
const tmpDir = new Vector3();
const tmpZ = new Vector3(0, 0, 1);

interface Thrown {
  body: RAPIER.RigidBody;
  type: LiftKind;
  paint: string;
  scale: number;
  /** Half-extents (m) of its box. */
  half: Vector3;
  age: number;
  hit: Set<Target>;
}

/** Meshes and painted materials of liftables (vehicles and props), built on first use and shared. */
class LiftLooks {
  private geos = new Map<LiftKind, BufferGeometry>();
  private mats = new Map<string, MeshStandardMaterial>();
  geometry(type: LiftKind) {
    let g = this.geos.get(type);
    if (!g) {
      g = buildLiftGeometry(type);
      this.geos.set(type, g);
    }
    return g;
  }
  /** Half-extents of the box around a liftable at `scale`. */
  half(type: LiftKind, scale: number, out = new Vector3()) {
    const v = VEHICLES[type as keyof typeof VEHICLES];
    if (v) return out.set(v.width / 2, v.height / 2, v.length / 2).multiplyScalar(scale);
    const g = this.geometry(type);
    g.computeBoundingBox();
    return g.boundingBox!.getSize(out).multiplyScalar(scale / 2);
  }
  material(paint: string) {
    let m = this.mats.get(paint);
    if (!m) {
      m = new MeshStandardMaterial({ vertexColors: true, color: new Color(paint), roughness: 0.5, metalness: 0.25, flatShading: true });
      this.mats.set(paint, m);
    }
    return m;
  }
  dispose() {
    this.geos.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}

/** Thrown and dropped vehicles: real rigid bodies that hurt what they hit while moving fast. */
class ThrownSet {
  readonly items: Thrown[] = [];
  /** World time scale currently applied to the bodies (Speed Force, hit-stop). */
  private scale = 1;

  add(world: RAPIER.World, item: Thrown) {
    // Spawned during slow motion: start out slowed too.
    if (this.scale !== 1) this.rescale(item.body, this.scale);
    this.items.push(item);
    while (this.items.length > LIFT.maxThrown) this.remove(world, 0);
  }

  remove(world: RAPIER.World, index: number) {
    const [t] = this.items.splice(index, 1);
    if (t && world.getRigidBody(t.body.handle)) world.removeRigidBody(t.body);
  }

  /** Scales a body's motion by `k` and its gravity to the current time scale. */
  private rescale(body: RAPIER.RigidBody, k: number) {
    const v = body.linvel();
    const w = body.angvel();
    body.setLinvel({ x: v.x * k, y: v.y * k, z: v.z * k }, true);
    body.setAngvel({ x: w.x * k, y: w.y * k, z: w.z * k }, true);
    body.setGravityScale(this.scale * this.scale, true);
  }

  /** Follows the world time scale: slow motion slows thrown things too (velocity × s, gravity × s²). */
  setTimeScale(s: number) {
    if (s === this.scale) return;
    const k = s / this.scale;
    this.scale = s;
    for (const t of this.items) this.rescale(t.body, k);
  }

  step(world: RAPIER.World, dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i];
      t.age += dt;
      if (t.age > LIFT.wreckLife) {
        this.remove(world, i);
        continue;
      }
      const v = t.body.linvel();
      // Real (unslowed) speed decides whether it hurts.
      const speed = Math.hypot(v.x, v.y, v.z) / this.scale;
      if (speed < LIFT.minHitSpeed) continue;
      const p = t.body.translation();
      const reach = Math.max(t.half.x, t.half.z);
      for (const target of targets) {
        if (!target.alive || t.hit.has(target)) continue;
        const d = Math.hypot(target.position.x - p.x, target.position.y - (p.y + t.half.y), target.position.z - p.z);
        if (d > target.radius + reach) continue;
        t.hit.add(target);
        const k = LIFT.knockback / speed / this.scale;
        target.damage(LIFT.damage, { x: v.x * k, y: Math.max(6, v.y * k + 6), z: v.z * k });
        runtime.combat.dealtDamage(LIFT.damage);
        addImpact(target.position, 'power');
        runtime.cameraShake = Math.max(runtime.cameraShake, 0.4);
      }
    }
  }

  clear(world: RAPIER.World) {
    while (this.items.length) this.remove(world, this.items.length - 1);
  }

  /** Thrown / dropped things that have settled can be picked up again. */
  source(world: RAPIER.World): LiftSource {
    const source: LiftSource = {
      nearest: (x, y, z, maxDistance) => {
        let best: LiftCandidate | null = null;
        this.items.forEach((t, i) => {
          if (t.age < 0.4) return;
          const v = t.body.linvel();
          if (Math.hypot(v.x, v.y, v.z) / this.scale > LIFT.repickSpeed) return;
          const p = t.body.translation();
          const d = Math.max(0, Math.hypot(p.x - x, p.y + t.half.y - y, p.z - z) - Math.max(t.half.x, t.half.z));
          if (d <= maxDistance && (!best || d < best.distance)) best = { source, key: i, type: t.type, paint: t.paint, scale: t.scale, x: p.x, y: p.y, z: p.z, yaw: 0, distance: d, thrown: true };
        });
        return best;
      },
      take: (key) => this.remove(world, key),
    };
    return source;
  }
}

/** Creates a tumbling physics wreck for a vehicle that was knocked flying or blew up. */
function spawnWreck(world: RAPIER.World, rapier: typeof RAPIER, thrown: ThrownSet, looks: LiftLooks, r: WreckRequest) {
  const half = looks.half(r.type, 1);
  const q = new Quaternion().setFromEuler(new Euler(0, r.yaw, 0));
  const body = world.createRigidBody(
    rapier.RigidBodyDesc.dynamic()
      .setTranslation(r.x, r.y, r.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinvel(r.vx, r.vy, r.vz)
      .setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 4 })
      .setCcdEnabled(true),
  );
  world.createCollider(rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(0, half.y, 0).setDensity(LIFT.density).setFriction(0.7).setRestitution(0.15), body);
  thrown.add(world, { body, type: r.type, paint: r.paint, scale: 1, half, age: 0, hit: new Set() });
}

/**
 * Lifting: walk up to a vehicle, street lamp, tree, rock, cactus — or anything
 * he threw earlier — and press Interact. Long things are held in one hand like
 * a club, heavy things overhead in both. Attack swings the club / slams the
 * heavy thing into enemies, Throw (G / button) hurls it along the crosshair,
 * Interact sets it down.
 */
export function Lifting() {
  const { world, rapier } = useRapier();
  const looks = useMemo(() => new LiftLooks(), []);
  const thrown = useMemo(() => new ThrownSet(), []);
  useEffect(
    () => () => {
      thrown.clear(world);
      looks.dispose();
      runtime.carrying = null;
      useApp.getState().setLiftPrompt(null);
    },
    [world, thrown, looks],
  );
  // What he threw can be picked up again.
  useEffect(() => {
    const source = thrown.source(world);
    liftSources.add(source);
    return () => {
      liftSources.delete(source);
    };
  }, [world, thrown]);

  const release = (velocity: { x: number; y: number; z: number }, forwardOffset: number) => {
    const carry = runtime.carrying;
    if (!carry) return;
    runtime.carrying = null;
    const yaw = runtime.heroFacingYaw;
    const half = looks.half(carry.type, carry.scale);
    const q = new Quaternion().setFromEuler(new Euler(0, yaw + Math.PI / 2, 0));
    const p = runtime.playerPosition;
    const body = world.createRigidBody(
      rapier.RigidBodyDesc.dynamic()
        .setTranslation(p.x + Math.sin(yaw) * forwardOffset, heroFeetY() + (forwardOffset > 0 ? 0.3 : LIFT.holdHeight), p.z + Math.cos(yaw) * forwardOffset)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: (Math.random() - 0.5) * 3, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 3 })
        .setCcdEnabled(true),
    );
    world.createCollider(rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(0, half.y, 0).setDensity(LIFT.density).setFriction(0.7).setRestitution(0.15), body);
    thrown.add(world, { body, type: carry.type, paint: carry.paint, scale: carry.scale, half, age: 0, hit: new Set() });
  };

  /** The swing / slam lands: everything in front within the object's reach is smashed. */
  const swingHit = (club: boolean) => {
    const carry = runtime.carrying;
    if (!carry) return;
    const half = looks.half(carry.type, carry.scale, tmpHalf);
    const yaw = runtime.heroFacingYaw;
    const p = runtime.playerPosition;
    const origin = { x: p.x, y: heroFeetY() + 1.2, z: p.z };
    const forward = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    const reach = club ? half.z * 2 * 0.9 + 1 : 3 + half.z;
    const damage = club ? LIFT.swingDamage : LIFT.slamDamage;
    const knock = club ? LIFT.swingKnock : LIFT.slamKnock;
    let landed = 0;
    for (const t of inCone(origin, forward, reach, club ? 1.1 : 0.9, targets)) {
      if (t.kind === 'vehicle') continue;
      const dx = t.position.x - p.x;
      const dz = t.position.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      t.damage(damage, { x: (dx / len) * knock, y: club ? knock * 0.35 : knock * 0.6, z: (dz / len) * knock });
      runtime.combat.dealtDamage(damage);
      addImpact(t.position, 'power');
      landed++;
    }
    // A slam shakes the ground in front even when it misses.
    if (!club) addImpact({ x: p.x + forward.x * 2.5, y: heroFeetY() + 0.2, z: p.z + forward.z * 2.5 }, 'launch');
    runtime.cameraShake = Math.max(runtime.cameraShake, landed ? 0.5 : club ? 0.15 : 0.35);
    if (landed) runtime.hitStop = Math.max(runtime.hitStop, HIT_STOP.heavy);
  };

  useBeforePhysicsStep((w) => {
    // Vehicles knocked flying or blown up become physics wrecks.
    while (wreckRequests.length) spawnWreck(world, rapier, thrown, looks, wreckRequests.shift()!);
    const app = useApp.getState();
    const p = runtime.playerPosition;
    if (!runtime.carrying) {
      const reach = runtime.moveMode === 'flight' ? LIFT.flightReach : LIFT.reach;
      const c = nearestLiftable(p.x, heroFeetY() + 1, p.z, reach);
      app.setLiftPrompt(c ? `Lift ${LIFT_LABEL[c.type]} · E` : null);
      if (c && input.consumePressed('interact')) {
        c.source.take(c.key);
        runtime.carrying = { type: c.type, paint: c.paint, scale: c.scale ?? 1, t: 0, fromY: c.y, swing: -1 };
        if (!(c.type in VEHICLES)) addImpact({ x: c.x, y: c.y, z: c.z }, 'launch'); // torn out of the ground
      } else if (!c && !app.interactPrompt) {
        // A press with nothing to lift is dropped, so it can't fire later near a car.
        input.consumePressed('interact');
      }
    } else {
      const carry = runtime.carrying;
      const club = ONE_HANDED.has(carry.type);
      app.setLiftPrompt(club ? 'Drop · E · Swing · Throw' : 'Drop · E · Smash · Throw');
      carry.t += w.timestep;
      // Attack: swing the club / slam the heavy thing (once it's up). Throw: hurl it. Interact: set it down.
      if (input.consumePressed('attack') && carry.t > LIFT.liftTime && carry.swing < 0) carry.swing = 0;
      if (carry.swing >= 0) {
        const before = carry.swing;
        carry.swing += w.timestep;
        if (before < LIFT.swingHitAt && carry.swing >= LIFT.swingHitAt) swingHit(club);
        if (carry.swing >= LIFT.swingTime) carry.swing = -1;
      }
      if (input.consumePressed('throw')) {
        const f = runtime.cameraForward;
        release({ x: f.x * LIFT.throwSpeed, y: f.y * LIFT.throwSpeed + LIFT.throwLift, z: f.z * LIFT.throwSpeed }, 0);
      } else if (input.consumePressed('interact')) {
        release({ x: 0, y: 0, z: 0 }, 3);
      }
    }
    thrown.setTimeScale(runtime.timeScale);
    thrown.step(w, w.timestep * runtime.timeScale);
  });

  // Meshes: the carried vehicle overhead, and every thrown / dropped one.
  const carried = useRef<Mesh>(null);
  const slots = useRef<(Mesh | null)[]>([]);
  useFrame(() => {
    const c = carried.current;
    if (c) {
      const carry = runtime.carrying;
      c.visible = !!carry;
      if (carry) {
        c.geometry = looks.geometry(carry.type);
        c.material = looks.material(carry.paint);
        c.scale.setScalar(carry.scale);
        const r = runtime.playerRenderPosition;
        const half = looks.half(carry.type, carry.scale, tmpHalf);
        const yaw = runtime.heroFacingYaw;
        if (ONE_HANDED.has(carry.type) && runtime.heroHandValid) {
          // A club in his right hand, gripped near its base, swung over the shoulder and down.
          const a = clubAngle(carry.swing, LIFT.swingTime);
          const dir = tmpDir.set(Math.sin(yaw) * Math.cos(a), Math.sin(a), Math.cos(yaw) * Math.cos(a));
          c.quaternion.setFromUnitVectors(tmpZ, dir);
          // The mesh is centred on its length: shift so the hand grips 0.4 m from the base.
          c.position.copy(runtime.heroHand).addScaledVector(dir, half.z - 0.4 * carry.scale);
        } else {
          // Heavy things go up overhead in both hands, rising from where they lay.
          const k = Math.min(1, carry.t / LIFT.liftTime);
          const ease = k * k * (3 - 2 * k);
          const top = r.y + LIFT.holdHeight - Math.min(half.y * 0.6, 0.6);
          // A slam brings it down in front for a moment.
          const slam = carry.swing >= 0 ? Math.sin(Math.min(1, carry.swing / LIFT.swingTime) * Math.PI) : 0;
          c.position.set(r.x + Math.sin(yaw) * 1.6 * slam, carry.fromY + (top - carry.fromY) * ease - 1.8 * slam, r.z + Math.cos(yaw) * 1.6 * slam);
          c.rotation.set(0, yaw + Math.PI / 2, 0);
        }
      }
    }
    slots.current.forEach((m, i) => {
      if (!m) return;
      const t = thrown.items[i];
      m.visible = !!t;
      if (!t) return;
      m.geometry = looks.geometry(t.type);
      m.material = looks.material(t.paint);
      m.scale.setScalar(t.scale);
      const tr = t.body.translation();
      const rot = t.body.rotation();
      m.position.set(tr.x, tr.y, tr.z);
      m.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    });
  });

  return (
    <group>
      <mesh ref={carried} visible={false} castShadow frustumCulled={false} />
      {Array.from({ length: LIFT.maxThrown }, (_, i) => (
        <mesh key={i} ref={(m) => void (slots.current[i] = m)} visible={false} castShadow receiveShadow frustumCulled={false} />
      ))}
    </group>
  );
}
