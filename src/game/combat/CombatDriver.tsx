import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CircleGeometry, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type PointLight } from 'three';
import { HERO_COMBAT } from '../../config/combat';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { heroFeetY } from './heroActions';
import { inCone, pickAlongRay, targets, type Target } from './targets';

const CHEST_HEIGHT = 1.25;

/**
 * Runs the hero's combat at the fixed physics step: punches (three-hit combo,
 * hits whatever is in front and in reach), heat vision (aimed through the
 * crosshair, stopped by the world, locks onto nearby enemies), facing control
 * while aiming, and the beam's visual effects.
 */
export function CombatDriver() {
  const { world, rapier } = useRapier();
  const rayRef = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const faceTimer = useRef(0);
  const tmp = useMemo(() => ({ aim: new Vector3(), dir: new Vector3(), chest: new Vector3(), eye: new Vector3() }), []);

  useEffect(() => {
    runtime.combat.reset();
    return () => {
      runtime.aiming = false;
      runtime.beam.active = false;
      runtime.combatFaceYaw = null;
    };
  }, []);

  useBeforePhysicsStep((w) => {
    const dt = w.timestep;
    const c = runtime.combat;
    const app = useApp.getState();
    const aimHeld = input.isHeld('aim');
    const events = c.step({ attackPressed: input.consumePressed('attack'), aimHeld }, dt);
    runtime.aiming = aimHeld;

    const fwd = runtime.cameraForward;
    const chest = tmp.chest.set(runtime.playerPosition.x, heroFeetY() + CHEST_HEIGHT, runtime.playerPosition.z);
    const punch = HERO_COMBAT.punch;
    const reach = runtime.moveMode === 'flight' ? punch.flightRange : punch.range;

    for (const e of events) {
      if (e.type === 'punch') {
        // Turn toward the nearest enemy in reach (a little beyond, so swings connect).
        let nearest: Target | null = null;
        let best = reach + 2;
        for (const t of targets) {
          if (!t.alive) continue;
          const d = Math.hypot(t.position.x - chest.x, t.position.y - chest.y, t.position.z - chest.z) - t.radius;
          if (d < best) {
            best = d;
            nearest = t;
          }
        }
        if (nearest) {
          runtime.combatFaceYaw = Math.atan2(nearest.position.x - chest.x, nearest.position.z - chest.z);
          faceTimer.current = punch.duration;
        }
      } else if (e.type === 'punchHit') {
        const yaw = runtime.heroFacingYaw;
        const forward = { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
        const { damage, knockback } = c.punchStrength();
        for (const t of inCone(chest, forward, reach, punch.coneHalfAngle, targets)) {
          const dx = t.position.x - chest.x;
          const dz = t.position.z - chest.z;
          const len = Math.hypot(dx, dz) || 1;
          t.damage(damage, { x: (dx / len) * knockback, y: knockback * 0.25, z: (dz / len) * knockback });
        }
      }
    }

    // Facing: aiming faces the crosshair; a punch briefly faces its target.
    if (aimHeld) runtime.combatFaceYaw = Math.atan2(fwd.x, fwd.z);
    else if (faceTimer.current > 0) faceTimer.current -= dt;
    else runtime.combatFaceYaw = null;

    // --- heat vision ----------------------------------------------------------
    const beam = runtime.beam;
    beam.active = c.firing;
    if (!beam.active) return;
    const heat = HERO_COMBAT.heat;
    const cam = runtime.cameraPosition;
    const exclude = runtime.playerBody ?? undefined;
    rayRef.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
    const ray = rayRef.current;
    // Where the crosshair points: first world surface, or an enemy before it.
    ray.origin = { x: cam.x, y: cam.y, z: cam.z };
    ray.dir = { x: fwd.x, y: fwd.y, z: fwd.z };
    const maxDist = heat.range + runtime.cameraDistance;
    const worldHit = world.castRayAndGetNormal(ray, maxDist, true, undefined, undefined, undefined, exclude);
    const aimDist = worldHit ? worldHit.timeOfImpact : maxDist;
    const picked = pickAlongRay(cam, fwd, aimDist, app.touchDetected ? heat.touchAssistAngle : heat.assistAngle, targets);
    const aim = picked ? tmp.aim.copy(picked.target.position as Vector3) : tmp.aim.copy(cam).addScaledVector(fwd, aimDist);
    // Exact ray hits land on the sphere surface, assisted ones at the centre.
    if (picked && picked.distance < Math.hypot(aim.x - cam.x, aim.y - cam.y, aim.z - cam.z)) aim.copy(cam).addScaledVector(fwd, picked.distance);

    // From the eyes to the aim point; anything in between stops the beam.
    const eye = runtime.heroEyesValid ? runtime.heroEyes : tmp.eye.set(runtime.playerPosition.x, heroFeetY() + heat.eyeHeightFallback, runtime.playerPosition.z);
    const dir = tmp.dir.copy(aim).sub(eye);
    const len = dir.length();
    if (len < 0.01) {
      beam.active = false;
      return;
    }
    dir.divideScalar(len);
    ray.origin = { x: eye.x, y: eye.y, z: eye.z };
    ray.dir = { x: dir.x, y: dir.y, z: dir.z };
    const block = world.castRayAndGetNormal(ray, len, true, undefined, undefined, undefined, exclude);
    beam.from.copy(eye);
    beam.hitTarget = false;
    beam.surface = false;
    if (block && (picked ? block.timeOfImpact < len - 0.3 : true)) {
      beam.to.copy(eye).addScaledVector(dir, block.timeOfImpact);
      beam.surface = true;
      beam.normal.set(block.normal.x, block.normal.y, block.normal.z);
    } else {
      beam.to.copy(aim);
      if (picked) {
        beam.hitTarget = true;
        picked.target.damage(heat.damagePerSecond * dt, { x: dir.x * heat.pushPerSecond * dt, y: 0, z: dir.z * heat.pushPerSecond * dt });
      }
    }
  });

  return <HeatBeamFx />;
}

const SCORCH_COUNT = 64;
const EYE_SPREAD = 0.032;

/** Twin beams from the eyes, a glow and light at the impact, and scorch marks on surfaces. */
function HeatBeamFx() {
  const assets = useMemo(() => {
    const beamGeo = new CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
    const core = new MeshBasicMaterial({ color: '#fff1c2', transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, fog: false });
    const glow = new MeshBasicMaterial({ color: '#ff3a10', transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide });
    const impactGeo = new CircleGeometry(1, 16);
    const impact = new MeshBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false });
    const scorchGeo = new CircleGeometry(0.45, 12);
    const scorch = new MeshBasicMaterial({ color: '#120d0a', transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    return { beamGeo, core, glow, impactGeo, impact, scorchGeo, scorch };
  }, []);
  useEffect(
    () => () => {
      for (const v of Object.values(assets)) v.dispose();
    },
    [assets],
  );

  const beams = useRef<(Mesh | null)[]>([]);
  const impact = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const scorches = useRef<InstancedMesh>(null);
  const stateRef = useRef(
    ({ next: 0, last: new Vector3(1e9, 0, 0), flicker: 0, q: new Quaternion(), up: new Vector3(0, 1, 0), z: new Vector3(0, 0, 1), side: new Vector3(), dir: new Vector3(), m: new Matrix4(), s: new Vector3(), p: new Vector3(), hidden: new Matrix4().makeScale(0, 0, 0) }),
  );

  useEffect(() => {
    const mesh = scorches.current;
    if (!mesh) return;
    for (let i = 0; i < SCORCH_COUNT; i++) mesh.setMatrixAt(i, stateRef.current.hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((frame, dt) => {
    const b = runtime.beam;
    const st = stateRef.current;
    st.flicker += dt;
    const on = b.active;
    for (const m of beams.current) if (m) m.visible = on;
    if (impact.current) impact.current.visible = on;
    if (light.current) light.current.intensity = on ? 30 + Math.sin(st.flicker * 40) * 8 : 0;
    if (!on) return;

    const dir = st.dir.copy(b.to).sub(b.from);
    const len = dir.length();
    dir.divideScalar(len || 1);
    st.q.setFromUnitVectors(st.up, dir);
    // Eyes sit side by side, perpendicular to the beam.
    st.side.crossVectors(dir, st.up).normalize().multiplyScalar(EYE_SPREAD);
    beams.current.forEach((m, i) => {
      if (!m) return;
      const eye = i % 2 === 0 ? 1 : -1;
      const thick = i < 2 ? 0.018 : 0.07 + Math.sin(st.flicker * 50 + i) * 0.01;
      m.position.copy(b.from).addScaledVector(st.side, eye);
      m.quaternion.copy(st.q);
      m.scale.set(thick, len, thick);
    });
    if (impact.current) {
      impact.current.position.copy(b.to).addScaledVector(dir, -0.1);
      impact.current.lookAt(frame.camera.position);
      const s = 0.45 + Math.sin(st.flicker * 37) * 0.12;
      impact.current.scale.setScalar(b.hitTarget ? s * 1.6 : s);
    }
    light.current?.position.copy(b.to).addScaledVector(dir, -0.5);

    // Scorch marks where the beam sweeps across surfaces.
    if (b.surface && scorches.current && st.last.distanceTo(b.to) > 0.5) {
      st.last.copy(b.to);
      st.p.copy(b.to).addScaledVector(b.normal, 0.02);
      st.q.setFromUnitVectors(st.z, b.normal);
      const s = 0.8 + Math.random() * 0.5;
      st.s.set(s, s, s);
      st.m.compose(st.p, st.q, st.s);
      scorches.current.setMatrixAt(st.next, st.m);
      scorches.current.instanceMatrix.needsUpdate = true;
      st.next = (st.next + 1) % SCORCH_COUNT;
    }
  });

  return (
    <group>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} ref={(m) => void (beams.current[i] = m)} geometry={assets.beamGeo} material={i < 2 ? assets.core : assets.glow} visible={false} frustumCulled={false} renderOrder={10} />
      ))}
      <mesh ref={impact} geometry={assets.impactGeo} material={assets.impact} visible={false} renderOrder={11} />
      <pointLight ref={light} color="#ff6a2a" intensity={0} distance={14} decay={2} />
      <instancedMesh ref={scorches} args={[assets.scorchGeo, assets.scorch, SCORCH_COUNT]} frustumCulled={false} />
    </group>
  );
}
