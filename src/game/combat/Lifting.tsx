import type RAPIER from '@dimforge/rapier3d-compat';
import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { Color, Euler, MeshStandardMaterial, Quaternion, type BufferGeometry, type Mesh } from 'three';
import { LIFT } from '../../config/combat';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { VEHICLES, type VehicleType } from '../vehicles/vehicleGeometry';
import { heroFeetY } from './heroActions';
import { addImpact } from './impacts';
import { nearestLiftable } from './liftables';
import { targets, type Target } from './targets';

const LABEL: Record<VehicleType, string> = { sedan: 'car', taxi: 'taxi', van: 'van', pickup: 'pickup', bus: 'bus', semi: 'truck' };

interface Thrown {
  body: RAPIER.RigidBody;
  type: VehicleType;
  paint: string;
  age: number;
  hit: Set<Target>;
}

/** Vehicle meshes and painted materials, built on first use and shared. */
class VehicleLooks {
  private geos = new Map<VehicleType, BufferGeometry>();
  private mats = new Map<string, MeshStandardMaterial>();
  geometry(type: VehicleType) {
    let g = this.geos.get(type);
    if (!g) {
      g = VEHICLES[type].build();
      this.geos.set(type, g);
    }
    return g;
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
      const spec = VEHICLES[t.type];
      const reach = Math.max(spec.length, spec.width) / 2;
      for (const target of targets) {
        if (!target.alive || t.hit.has(target)) continue;
        const d = Math.hypot(target.position.x - p.x, target.position.y - (p.y + spec.height / 2), target.position.z - p.z);
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

/**
 * Lifting: walk up to a vehicle and press Interact to hold it overhead; punch
 * (click / ✊) throws it along the crosshair, Interact again sets it down.
 */
export function Lifting() {
  const { world, rapier } = useRapier();
  const looks = useMemo(() => new VehicleLooks(), []);
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
    const spec = VEHICLES[carry.type];
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
    world.createCollider(
      rapier.ColliderDesc.cuboid(spec.width / 2, spec.height / 2, spec.length / 2).setTranslation(0, spec.height / 2, 0).setDensity(LIFT.density).setFriction(0.7).setRestitution(0.15),
      body,
    );
    thrown.add(world, { body, type: carry.type, paint: carry.paint, age: 0, hit: new Set() });
  };

  useBeforePhysicsStep((w) => {
    const app = useApp.getState();
    const p = runtime.playerPosition;
    if (!runtime.carrying) {
      const reach = runtime.moveMode === 'flight' ? LIFT.flightReach : LIFT.reach;
      const c = nearestLiftable(p.x, heroFeetY() + 1, p.z, reach);
      app.setLiftPrompt(c ? `Lift ${LABEL[c.type]} · E` : null);
      if (c && input.consumePressed('interact')) {
        c.source.take(c.key);
        runtime.carrying = { type: c.type, paint: c.paint };
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
        const spec = VEHICLES[carry.type];
        // Held sideways over the head, lifted by its middle.
        c.position.set(r.x, r.y + LIFT.holdHeight - spec.height * 0.3, r.z);
        c.rotation.set(0, runtime.heroFacingYaw + Math.PI / 2, 0);
      }
    }
    slots.current.forEach((m, i) => {
      if (!m) return;
      const t = thrown.items[i];
      m.visible = !!t;
      if (!t) return;
      m.geometry = looks.geometry(t.type);
      m.material = looks.material(t.paint);
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
