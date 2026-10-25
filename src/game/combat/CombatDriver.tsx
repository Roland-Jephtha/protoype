import { useFrame } from '@react-three/fiber';
import { useBeforePhysicsStep, useRapier } from '@react-three/rapier';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, CircleGeometry, CylinderGeometry, DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, Quaternion, Vector3 } from 'three';
import { HERO_COMBAT } from '../../config/combat';
import { input } from '../../input/InputManager';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { heroFeetY } from './heroActions';
import { SkillFx } from './SkillFx';
import { inCone, targets, type Target, type Vec3 } from './targets';
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
  const power = useRef<{ target: Target | null; charge: number; timer: number } | null>(null);
  const tmp = useMemo(() => ({ aim: new Vector3(), dir: new Vector3(), chest: new Vector3(), eye: new Vector3(), look: new Vector3() }), []);

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
        breathHeld: input.isHeld('breath'),
        freezeHeld: input.isHeld('freeze'),
        novaHeld: input.isHeld('nova'),
      },
      dt,
    );
    runtime.aiming = aimHeld || c.breath !== 'none';
    // Fighting stance: just punched, or an enemy (not traffic) is close.
    let enemyNear = false;
    const pp0 = runtime.playerPosition;
    for (const t of targets) {
      if (!t.alive || t.kind === 'vehicle') continue;
      if (Math.hypot(t.position.x - pp0.x, t.position.z - pp0.z) < HERO_COMBAT.punch.guardRange) {
        enemyNear = true;
        break;
      }
    }
    runtime.combatReady = c.sinceLastPunch < HERO_COMBAT.punch.guardAfterPunch || enemyNear;

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
        const { damage, knockback } = c.punchStrength(e.heavy);
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
            const speed = Math.min(pp.lungeSpeed, dist / pp.lungeTime);
            runtime.heroDash = { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed };
          }
        }
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
      // The knockout blow is the second fist of the one-two.
      const secondFist = c.punchTime >= pp.secondFistAt || !c.powerPunching;
      if ((reached && secondFist) || pw.timer <= 0) {
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

    // Where the hero looks: his facing, with the camera's pitch (so up/down follows the camera).
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.y)));
    const yaw = runtime.heroFacingYaw;
    const look = tmp.look.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const eye = runtime.heroEyesValid ? runtime.heroEyes : tmp.eye.set(chest.x, heroFeetY() + HERO_COMBAT.heat.eyeHeightFallback, chest.z);
    const lockAngle = app.touchDetected ? HERO_COMBAT.heat.touchLockAngle : HERO_COMBAT.heat.lockAngle;
    /** Nearest live target within the lock cone of where he looks (and the camera's view). */
    const lockOn = (range: number) => {
      let best: Target | null = null;
      let bestScore = Infinity;
      for (const t of targets) {
        if (!t.alive) continue;
        const dx = t.position.x - eye.x;
        const dy = t.position.y - eye.y;
        const dz = t.position.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > range + t.radius || d < 0.5) continue;
        // Within the cone around his look direction or the camera direction.
        const aLook = Math.acos(Math.min(1, (dx * look.x + dy * look.y + dz * look.z) / d));
        const aCam = Math.acos(Math.min(1, (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d));
        const a = Math.min(aLook, aCam);
        if (a > lockAngle) continue;
        const score = a * 20 + d * 0.05;
        if (score < bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    };

    // Super breath / freeze breath: a cone from the mouth where he looks (bent toward a locked target).
    const br = runtime.breath;
    br.kind = c.breath;
    let breathLock: Target | null = null;
    if (c.breath !== 'none') {
      const cfg = c.breath === 'wind' ? HERO_COMBAT.superBreath : HERO_COMBAT.freezeBreath;
      br.from.copy(eye).y -= 0.12;
      breathLock = lockOn(cfg.range);
      if (breathLock) br.dir.set(breathLock.position.x - br.from.x, breathLock.position.y - br.from.y, breathLock.position.z - br.from.z).normalize();
      else br.dir.copy(look);
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

    // --- heat vision: from the eyes where he looks, locked onto the nearest target in view ---------
    const beam = runtime.beam;
    beam.active = c.firing;
    let beamLock: Target | null = null;
    if (beam.active) {
      const heat = HERO_COMBAT.heat;
      const exclude = runtime.playerBody ?? undefined;
      rayRef.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
      const ray = rayRef.current;
      beamLock = lockOn(heat.range);
      const aim = beamLock ? tmp.aim.set(beamLock.position.x, beamLock.position.y, beamLock.position.z) : tmp.aim.copy(eye).addScaledVector(look, heat.range);
      const dir = tmp.dir.copy(aim).sub(eye);
      const len = Math.max(0.01, dir.length());
      dir.divideScalar(len);
      ray.origin = { x: eye.x, y: eye.y, z: eye.z };
      ray.dir = { x: dir.x, y: dir.y, z: dir.z };
      const block = world.castRayAndGetNormal(ray, len, true, undefined, undefined, undefined, exclude);
      beam.from.copy(eye);
      beam.hitTarget = false;
      beam.surface = false;
      if (block && (beamLock ? block.timeOfImpact < len - beamLock.radius - 0.3 : true)) {
        beam.to.copy(eye).addScaledVector(dir, block.timeOfImpact);
        beam.surface = true;
        beam.normal.set(block.normal.x, block.normal.y, block.normal.z);
      } else {
        beam.to.copy(aim);
        if (beamLock) {
          beam.hitTarget = true;
          hit(beamLock, heat.damagePerSecond * dt, { x: dir.x * heat.pushPerSecond * dt, y: 0, z: dir.z * heat.pushPerSecond * dt });
        }
      }
    }

    // Facing: a lock turns him to it; otherwise aiming turns him with the camera; a punch briefly faces its target.
    const locked = beamLock ?? breathLock;
    if (locked) runtime.combatFaceYaw = Math.atan2(locked.position.x - chest.x, locked.position.z - chest.z);
    else if (runtime.aiming) runtime.combatFaceYaw = Math.atan2(fwd.x, fwd.z);
    else if (faceTimer.current > 0) faceTimer.current -= dt;
    else runtime.combatFaceYaw = null;
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
      <instancedMesh ref={scorches} args={[assets.scorchGeo, assets.scorch, SCORCH_COUNT]} frustumCulled={false} />
    </group>
  );
}
