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
import { buildLiftGeometry, LIFT_LABEL, type LiftKind } from './liftShapes';
import { heroFeetY } from './heroActions';
import { addImpact } from './impacts';
import { nearestLiftable, wreckRequests, type WreckRequest } from './liftables';
import { targets, type Target } from './targets';


const tmpHalf = new Vector3();

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

  add(world: RAPIER.World, item: Thrown) {
    this.items.push(item);
    while (this.items.length > LIFT.maxThrown) this.remove(world, 0);
  }

  remove(world: RAPIER.World, index: number) {
    const [t] = this.items.splice(index, 1);
    if (t && world.getRigidBody(t.body.handle)) world.removeRigidBody(t.body);
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
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed < LIFT.minHitSpeed) continue;
      const p = t.body.translation();
      const reach = Math.max(t.half.x, t.half.z);
      for (const target of targets) {
        if (!target.alive || t.hit.has(target)) continue;
        const d = Math.hypot(target.position.x - p.x, target.position.y - (p.y + t.half.y), target.position.z - p.z);
        if (d > target.radius + reach) continue;
        t.hit.add(target);
        const k = LIFT.knockback / speed;
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
 * Lifting: walk up to a vehicle, street lamp, tree, rock or cactus and press
 * Interact to hold it overhead; punch (click / ✊) throws it along the
 * crosshair, Interact again sets it down.
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
        runtime.carrying = { type: c.type, paint: c.paint, scale: c.scale ?? 1 };
        if (!(c.type in VEHICLES)) addImpact({ x: c.x, y: c.y, z: c.z }, 'launch'); // torn out of the ground
      } else if (!c && !app.interactPrompt) {
        // A press with nothing to lift is dropped, so it can't fire later near a car.
        input.consumePressed('interact');
      }
    } else {
      app.setLiftPrompt('Drop · E');
      if (input.consumePressed('attack')) {
        const f = runtime.cameraForward;
        release({ x: f.x * LIFT.throwSpeed, y: f.y * LIFT.throwSpeed + LIFT.throwLift, z: f.z * LIFT.throwSpeed }, 0);
      } else if (input.consumePressed('interact')) {
        release({ x: 0, y: 0, z: 0 }, 3);
      }
    }
    thrown.step(w, w.timestep);
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
        const r = runtime.playerRenderPosition;
        const half = looks.half(carry.type, carry.scale, tmpHalf);
        // Held sideways over the head, lifted by its middle.
        c.position.set(r.x, r.y + LIFT.holdHeight - Math.min(half.y * 0.6, 0.6), r.z);
        c.rotation.set(0, runtime.heroFacingYaw + Math.PI / 2, 0);
        c.scale.setScalar(carry.scale);
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
