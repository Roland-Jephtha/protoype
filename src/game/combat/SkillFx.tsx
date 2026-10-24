import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PointsMaterial,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type PointLight,
} from 'three';
import { HERO_COMBAT } from '../../config/combat';
import { runtime } from '../runtime';
import { heroFeetY } from './heroActions';
import { impacts } from './impacts';

const PARTICLES = 220;
const PARTICLE_LIFE = 0.7;
const EMIT_PER_SECOND = 260;
const IMPACT_MESHES = 16;
/** Flash size and duration per impact kind (m, s). The Nova's flash is small: its ring carries the blast. */
const IMPACT_LOOK = { punch: { size: 0.9, time: 0.16 }, power: { size: 3, time: 0.3 }, nova: { size: 9, time: 0.35 } };
const NOVA_RING_TIME = 0.7;

const SPREAD = new Vector3();

/** Soft round sprite (radial gradient) for breath particles, drawn once. */
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
}

/** One particle stream (wind or frost) drawn as soft points. */
class Stream {
  readonly particles: Particle[] = [];
  readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(PARTICLES * 3);
  emit = 0;

  constructor() {
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setDrawRange(0, 0);
  }

  /** Emits particles from `from` along `dir`, spread within `cone` (rad). */
  spawn(dt: number, from: Vector3, dir: Vector3, cone: number, speed: number) {
    this.emit += EMIT_PER_SECOND * dt;
    while (this.emit >= 1 && this.particles.length < PARTICLES) {
      this.emit -= 1;
      SPREAD.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * Math.tan(cone)).add(dir).normalize();
      const sp = speed * (0.7 + Math.random() * 0.5);
      this.particles.push({ x: from.x, y: from.y, z: from.z, vx: SPREAD.x * sp, vy: SPREAD.y * sp, vz: SPREAD.z * sp, age: Math.random() * 0.1 });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age > PARTICLE_LIFE) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Slow down as the breath spreads.
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
      p.vz *= 1 - 1.5 * dt;
    }
    this.particles.forEach((p, i) => this.positions.set([p.x, p.y, p.z], i * 3));
    this.geometry.setDrawRange(0, this.particles.length);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }
}

/**
 * Effects for the hero's skills: breath streams (wind / frost), the Super
 * Nova charge glow, flash and shockwave ring, the dash streak, and hit flashes.
 */
export function SkillFx() {
  const assets = useMemo(() => {
    const dot = softDot();
    const wind = new PointsMaterial({ map: dot, color: '#f4f8ff', size: 1.4, transparent: true, opacity: 0.35, depthWrite: false });
    const frost = new PointsMaterial({ map: dot, color: '#8fd2ff', size: 1.1, transparent: true, opacity: 0.75, depthWrite: false });
    const glowGeo = new SphereGeometry(1, 20, 14);
    const glow = new MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.12, blending: AdditiveBlending, depthWrite: false });
    const streakGeo = new CapsuleGeometry(0.45, 1, 4, 10).rotateX(Math.PI / 2);
    const streak = new MeshBasicMaterial({ color: '#7fb8ff', transparent: true, opacity: 0.14, blending: AdditiveBlending, depthWrite: false });
    const ringGeo = new RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2);
    const ring = new MeshBasicMaterial({ color: '#ffe3a0', transparent: true, opacity: 0.8, side: DoubleSide, depthWrite: false });
    const flashes = Array.from({ length: IMPACT_MESHES }, () => new MeshBasicMaterial({ color: '#fff3d0', transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false }));
    return { dot, wind, frost, glowGeo, glow, streakGeo, streak, ringGeo, ring, flashes };
  }, []);
  const streams = useMemo(() => ({ wind: new Stream(), frost: new Stream() }), []);
  useEffect(
    () => () => {
      for (const a of Object.values(assets)) (Array.isArray(a) ? a : [a]).forEach((x) => x.dispose());
      streams.wind.geometry.dispose();
      streams.frost.geometry.dispose();
    },
    [assets, streams],
  );

  const glow = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const streak = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const flashes = useRef<(Mesh | null)[]>([]);
  const tmp = useRef({ v: new Vector3(), chest: new Vector3(), z: new Vector3(0, 0, 1) });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = tmp.current;
    const br = runtime.breath;

    // --- breath streams ---------------------------------------------------------------
    if (br.kind !== 'none') {
      const stream = br.kind === 'wind' ? streams.wind : streams.frost;
      const cone = br.kind === 'wind' ? HERO_COMBAT.superBreath.coneHalfAngle : HERO_COMBAT.freezeBreath.coneHalfAngle;
      stream.spawn(dt, br.from, br.dir, cone, br.kind === 'wind' ? 38 : 24);
    }
    streams.wind.update(dt);
    streams.frost.update(dt);

    // --- Super Nova charge glow ------------------------------------------------------------
    const charge = runtime.combat.novaCharge;
    const chest = t.chest.set(runtime.playerRenderPosition.x, runtime.playerRenderPosition.y + 1.1, runtime.playerRenderPosition.z);
    if (glow.current) {
      glow.current.visible = charge > 0;
      glow.current.position.copy(chest);
      glow.current.scale.setScalar(0.5 + charge * 0.9 + Math.sin(performance.now() / 45) * 0.06 * charge);
      (glow.current.material as MeshBasicMaterial).opacity = 0.04 + 0.12 * charge;
    }
    if (light.current) {
      light.current.position.copy(chest);
      light.current.intensity = charge * 45;
    }

    // --- dash streak -------------------------------------------------------------------------
    if (streak.current) {
      const dashing = runtime.heroDashing;
      streak.current.visible = dashing;
      if (dashing) {
        const v = runtime.playerVelocity;
        t.v.set(v.x, v.y, v.z).normalize();
        streak.current.position.copy(chest).addScaledVector(t.v, -3);
        streak.current.quaternion.setFromUnitVectors(t.z, t.v);
        streak.current.scale.set(0.7, 0.7, 5);
      }
    }

    // --- hit flashes and the Nova ring ------------------------------------------------------------
    const now = performance.now() / 1000;
    flashes.current.forEach((m, i) => {
      if (!m) return;
      const imp = impacts[i];
      const look = imp ? IMPACT_LOOK[imp.kind] : null;
      const age = imp ? now - imp.born : Infinity;
      m.visible = !!look && age < look.time;
      if (!imp || !look || !m.visible) return;
      const k = age / look.time;
      m.position.set(imp.x, imp.y, imp.z);
      m.scale.setScalar(0.2 + k * look.size);
      (m.material as MeshBasicMaterial).opacity = 0.7 * (1 - k);
    });
    if (ring.current) {
      const nova = [...impacts].reverse().find((i) => i.kind === 'nova');
      const age = nova ? now - nova.born : Infinity;
      ring.current.visible = age < NOVA_RING_TIME;
      if (nova && ring.current.visible) {
        const k = age / NOVA_RING_TIME;
        ring.current.position.set(nova.x, heroFeetY() + 0.4, nova.z);
        ring.current.scale.setScalar(1 + k * HERO_COMBAT.nova.radius);
        (ring.current.material as MeshBasicMaterial).opacity = 0.8 * (1 - k);
      }
    }
  });

  return (
    <group>
      <points geometry={streams.wind.geometry} material={assets.wind} frustumCulled={false} />
      <points geometry={streams.frost.geometry} material={assets.frost} frustumCulled={false} />
      <mesh ref={glow} geometry={assets.glowGeo} material={assets.glow} visible={false} />
      <pointLight ref={light} color="#fff0b0" intensity={0} distance={30} decay={2} />
      <mesh ref={streak} geometry={assets.streakGeo} material={assets.streak} visible={false} />
      <mesh ref={ring} geometry={assets.ringGeo} material={assets.ring} visible={false} frustumCulled={false} />
      {assets.flashes.map((mat, i) => (
        <mesh key={i} ref={(m) => void (flashes.current[i] = m)} geometry={assets.glowGeo} material={mat} visible={false} frustumCulled={false} />
      ))}
    </group>
  );
}

