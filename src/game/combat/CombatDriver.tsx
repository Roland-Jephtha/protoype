import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CircleGeometry, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3, type PointLight } from 'three';
import { HERO_COMBAT } from '../../config/combat';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { heroFeetY } from './heroActions';
import { SkillFx } from './SkillFx';
import { inCone, pickAlongRay, targets, type Target, type Vec3 } from './targets';
import { addImpact } from './impacts';

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
  const dashHits = useRef(new Set<Target>());
  const dashDir = useRef(new Vector3());
  const dashTime = useRef(0);
  const power = useRef<{ target: Target | null; charge: number; timer: number } | null>(null);
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
    const events = c.step(
      {
        // While carrying a vehicle, punch throws it instead (handled by Lifting).
        attackPressed: !runtime.carrying && input.consumePressed('attack'),
        attackHeld: !runtime.carrying && input.isHeld('attack'),
        aimHeld,
        dashPressed: input.consumePressed('dash'),
        breathHeld: input.isHeld('breath'),
        freezeHeld: input.isHeld('freeze'),
        novaHeld: input.isHeld('nova'),
      },
      dt,
    );
    runtime.aiming = aimHeld || c.breath !== 'none';

    const fwd = runtime.cameraForward;
    const chest = tmp.chest.set(runtime.playerPosition.x, heroFeetY() + CHEST_HEIGHT, runtime.playerPosition.z);
    const punch = HERO_COMBAT.punch;
    const reach = runtime.moveMode === 'flight' ? punch.flightRange : punch.range;
    const facing = () => {
      const yaw = runtime.heroFacingYaw;
      return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
    };
    /** Damages a target and charges solar energy for it. */
    const hit = (t: Target, amount: number, knock: Vec3) => {
      t.damage(amount, knock);
      c.dealtDamage(amount);
    };
    /** Knockback away from the hero: horizontal push plus lift. */
    const away = (t: Target, push: number, lift: number) => {
      const dx = t.position.x - chest.x;
      const dz = t.position.z - chest.z;
      const len = Math.hypot(dx, dz) || 1;
      return { x: (dx / len) * push, y: lift, z: (dz / len) * push };
    };
    /** Turns toward the nearest enemy within `range` for `seconds`. */
    const faceNearest = (range: number, seconds: number) => {
      let nearest: Target | null = null;
      let best = range;
      for (const t of targets) {
        if (!t.alive) continue;
        const d = Math.hypot(t.position.x - chest.x, t.position.y - chest.y, t.position.z - chest.z) - t.radius;
        if (d < best) {
          best = d;
          nearest = t;
        }
      }
      if (!nearest) return null;
      runtime.combatFaceYaw = Math.atan2(nearest.position.x - chest.x, nearest.position.z - chest.z);
      faceTimer.current = seconds;
      return nearest;
    };

    for (const e of events) {
      if (e.type === 'punch') {
        const t = faceNearest(reach + punch.magnetRange, punch.duration);
        // Push off into the punch.
        const f = facing();
        runtime.heroImpulse.x += f.x * punch.stepSpeed;
        runtime.heroImpulse.z += f.z * punch.stepSpeed;
        runtime.heroControlLoss = Math.max(runtime.heroControlLoss, 0.1);
        // Just out of reach: step into the punch.
        if (t) {
          const dx = t.position.x - chest.x;
          const dz = t.position.z - chest.z;
          const d = Math.hypot(dx, dz) - t.radius;
          if (d > reach * 0.7) {
            runtime.heroImpulse.x += (dx / (d + t.radius)) * punch.magnetSpeed;
            runtime.heroImpulse.z += (dz / (d + t.radius)) * punch.magnetSpeed;
            runtime.heroControlLoss = Math.max(runtime.heroControlLoss, 0.12);
          }
        }
      }
      else if (e.type === 'punchHit') {
        const { damage, knockback } = c.punchStrength();
        for (const t of inCone(chest, facing(), reach, punch.coneHalfAngle, targets)) {
          hit(t, damage, away(t, knockback, knockback * 0.25));
          addImpact(t.position, 'punch');
        }
      } else if (e.type === 'powerPunch') {
        const pp = HERO_COMBAT.powerPunch;
        // Home onto the nearest enemy in range: dash to it, the blow lands on arrival.
        const target = faceNearest(pp.homingRange, pp.homingTimeout);
        power.current = { target, charge: e.charge, timer: pp.homingTimeout };
        if (target) {
          const dir = tmp.dir.set(target.position.x - chest.x, target.position.y - chest.y, target.position.z - chest.z);
          const dist = dir.length() - target.radius - 1;
          if (dist > 0.5) {
            dir.normalize();
            if (runtime.moveMode !== 'flight') dir.y = 0;
            const speed = Math.min(HERO_COMBAT.dash.speed, dist / HERO_COMBAT.dash.duration);
            runtime.heroDash = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
          }
        }
      } else if (e.type === 'dash') {
        const d = HERO_COMBAT.dash;
        // In flight: straight where the camera looks; on foot: along the ground.
        const dir = tmp.dir.copy(fwd);
        if (runtime.moveMode !== 'flight') dir.y = 0;
        dir.normalize();
        runtime.heroDash = { x: dir.x * d.speed, y: dir.y * d.speed, z: dir.z * d.speed };
        dashDir.current.copy(dir);
        dashHits.current.clear();
        dashTime.current = d.duration + 0.05;
      } else if (e.type === 'nova') {
        const n = HERO_COMBAT.nova;
        for (const t of targets) {
          if (!t.alive) continue;
          const d = Math.hypot(t.position.x - chest.x, t.position.y - chest.y, t.position.z - chest.z);
          if (d > n.radius + t.radius) continue;
          const k = 1 - Math.min(1, d / n.radius) * 0.5;
          hit(t, n.damage * k, away(t, n.knockback * k, n.lift * k));
        }
        addImpact(chest, 'nova');
        runtime.cameraShake = 1;
        runtime.novaFlash++;
      }
    }

    // Power punch: lands when the homing lunge reaches its target (or on timeout, on whatever is in front).
    const pw = power.current;
    if (pw) {
      pw.timer -= dt;
      const pp = HERO_COMBAT.powerPunch;
      const t = pw.target;
      const reached = t && t.alive && Math.hypot(t.position.x - chest.x, t.position.y - chest.y, t.position.z - chest.z) - t.radius <= pp.range;
      if (reached || pw.timer <= 0) {
        power.current = null;
        const k = 0.6 + 0.4 * pw.charge;
        const struck = reached && t ? [t] : inCone(chest, facing(), pp.range, punch.coneHalfAngle + 0.2, targets);
        for (const s of struck) {
          hit(s, pp.damage * k, away(s, pp.knockback * k, pp.knockback * 0.35 * k));
          addImpact(s.position, 'power');
        }
        runtime.cameraShake = Math.max(runtime.cameraShake, struck.length ? 0.5 : 0.15);
      }
    }

    // Dash: everything the hero ploughs through is hit once.
    if (dashTime.current > 0) {
      dashTime.current -= dt;
      const d = HERO_COMBAT.dash;
      for (const t of targets) {
        if (!t.alive || dashHits.current.has(t)) continue;
        if (Math.hypot(t.position.x - chest.x, t.position.y - chest.y, t.position.z - chest.z) > d.hitRadius + t.radius) continue;
        dashHits.current.add(t);
        const dd = dashDir.current;
        hit(t, d.damage, { x: dd.x * d.knockback, y: d.knockback * 0.3, z: dd.z * d.knockback });
        addImpact(t.position, 'power');
        runtime.cameraShake = Math.max(runtime.cameraShake, 0.3);
      }
    }

    // Super breath / freeze breath: a cone from the mouth along the crosshair.
    const br = runtime.breath;
    br.kind = c.breath;
    if (c.breath !== 'none') {
      const eye = runtime.heroEyesValid ? runtime.heroEyes : tmp.eye.set(chest.x, heroFeetY() + HERO_COMBAT.heat.eyeHeightFallback, chest.z);
      br.from.copy(eye).y -= 0.12;
      br.dir.copy(fwd);
      const cfg = c.breath === 'wind' ? HERO_COMBAT.superBreath : HERO_COMBAT.freezeBreath;
      for (const t of inCone(br.from, br.dir, cfg.range, cfg.coneHalfAngle, targets)) {
        if (c.breath === 'wind') {
          const push = HERO_COMBAT.superBreath.push * dt;
          hit(t, cfg.damagePerSecond * dt, { x: br.dir.x * push, y: Math.max(0, br.dir.y) * push + push * 0.15, z: br.dir.z * push });
        } else {
          hit(t, cfg.damagePerSecond * dt, { x: 0, y: 0, z: 0 });
          t.freeze?.(HERO_COMBAT.freezeBreath.freezePerSecond * dt);
        }
      }
    }

    // Facing: aiming (heat vision, breath) faces the crosshair; a punch briefly faces its target.
    if (runtime.aiming) runtime.combatFaceYaw = Math.atan2(fwd.x, fwd.z);
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

  return (
    <>
      <HeatBeamFx />
      <SkillFx />
    </>
  );
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
