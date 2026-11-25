import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AnimationMixer, Box3, Color, Group, LoopOnce, LoopRepeat, Quaternion, Vector3, type AnimationAction, type AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HERO_MODELS } from '../../config/assets';
import { VILLAINS, type VillainClipRole, type VillainDef } from '../../config/villains';
import { MIXAMO_TO_DAVIDA3D, MIXAMO_TO_RIGIFY, retargetClip, standUpright, UAL_TO_RIGIFY, type BonePair } from '../characters/retarget';
import { CombatPose, type BoneAliases } from '../player/combatPose';
import { resolveClips } from '../player/heroAnimation';
import { runtime } from '../runtime';

export type VillainAnim = VillainClipRole;

/** Hero (Mixamo) clips each villain role is built from. */
const ROLE_PATTERNS: Partial<Record<VillainAnim, RegExp[]>> = {
  idle: [/^mixamo\.com$/i, /idle/i],
  walk: [/^walking$/i, /walk/i],
  run: [/^running$/i, /run/i],
  fly: [/^flying$/i, /fly/i],
  fall: [/falling/i],
  taunt: [/dynamic pose/i, /^mixamo\.com$/i],
};
const LOOPING: Record<VillainAnim, boolean> = { idle: true, walk: true, run: true, fly: true, fall: true, taunt: false, hit: false, stun: true, die: false, attack: false, attack2: false, attack3: false };
const ATTACKS: VillainAnim[] = ['attack', 'attack2', 'attack3'];
/** Strike clips from the CC0 mannequin, retargeted onto Rigify villains as their punches. */
const UAL_STRIKES: Partial<Record<VillainAnim, string>> = { attack: 'Punch_Cross', attack2: 'Punch_Jab', hit: 'Hit_Chest', die: 'Death01' };

/** DavidA3D rig names for the bones CombatPose needs. */
const DAVIDA3D_ALIASES: BoneAliases = { ...Object.fromEntries(MIXAMO_TO_DAVIDA3D.map((p) => [p.source, p.target])), Spine1: 'Spine' };
const RIGIFY_ALIASES: BoneAliases = { ...Object.fromEntries(MIXAMO_TO_RIGIFY.map((p) => [p.source, p.target])), Spine1: 'spine' };

// Fetch every villain model (and the hero model the clips come from) once at startup.
useGLTF.preload(HERO_MODELS.hatch.url);
useGLTF.preload(HERO_MODELS.ual.url);
for (const v of Object.values(VILLAINS)) if (v.model.kind === 'villain') useGLTF.preload(v.model.url);

/** Villains farther than this from the camera aren't animated (m). */
const VILLAIN_ANIMATE_WITHIN = 150;
/** Retargeted clips are sampled at this rate (the mixer interpolates between keys). */
const BAKE_FPS = 20;

/** Baked clips per villain model (retargeting runs once per model, not per instance). */
const bakedCache = new WeakMap<Object3D, Partial<Record<VillainAnim, AnimationClip>>>();

/** A clone of the villain's scene, stood upright if its rig needs it. */
function villainClone(scene: Object3D, def: VillainDef) {
  const model = cloneSkinned(scene);
  if (def.model.kind === 'villain' && def.model.rig.type === 'rigify' && def.model.rig.upright) standUpright(model);
  return model;
}

function bakeClips(def: VillainDef, villainScene: Object3D, hero: { scene: Object3D; animations: AnimationClip[] }, ual: { scene: Object3D; animations: AnimationClip[] }) {
  let baked = bakedCache.get(villainScene);
  if (baked) return baked;
  baked = {};
  const rigify = def.model.kind === 'villain' && def.model.rig.type === 'rigify';
  const pairs: BonePair[] = rigify ? MIXAMO_TO_RIGIFY : MIXAMO_TO_DAVIDA3D;
  const hips = rigify ? { source: 'Hips', target: 'hips' } : undefined;
  const src = cloneSkinned(hero.scene);
  // Both rigs must face +Z while baking, or motion would be applied mirrored.
  const tgt = new Group().add(villainClone(villainScene, def));
  tgt.rotation.y = def.yawOffset;
  const roles = resolveClips(hero.animations, ROLE_PATTERNS as never) as Partial<Record<VillainAnim, AnimationClip>>;
  for (const [role, clip] of Object.entries(roles) as [VillainAnim, AnimationClip][]) baked[role] = retargetClip(src, tgt, clip, pairs, BAKE_FPS, hips);
  // Rigify rigs also get real punches, hit and death from the mannequin's library.
  if (rigify) {
    const ualSrc = cloneSkinned(ual.scene);
    for (const [role, name] of Object.entries(UAL_STRIKES) as [VillainAnim, string][]) {
      const clip = ual.animations.find((c) => c.name === name);
      if (clip) baked[role] = retargetClip(ualSrc, tgt, clip, UAL_TO_RIGIFY, 30, { source: 'hips', target: 'hips' });
    }
  }
  bakedCache.set(villainScene, baked);
  return baked;
}

/** A model with its own animations: roles by clip name. */
function nativeClips(def: VillainDef, animations: AnimationClip[]) {
  const out: Partial<Record<VillainAnim, AnimationClip>> = {};
  if (def.model.kind !== 'villain' || def.model.rig.type !== 'native') return out;
  for (const [role, name] of Object.entries(def.model.rig.clips) as [VillainAnim, string][]) {
    const clip = animations.find((c) => c.name === name);
    if (clip) out[role] = clip;
  }
  return out;
}

export interface VillainModelHandle {
  root: Group | null;
  play: (anim: VillainAnim, speed?: number) => void;
  /** A punch (0..1 progress, < 0 = none): a real attack clip where the model has one, else a procedural arm swing. */
  punch: (side: 'left' | 'right', progress: number) => void;
  /** World position between the eyes (for beams), false if unavailable. */
  eyes: (out: Vector3) => boolean;
  /** Whether the model has its own clip for a role (e.g. a death fall). */
  has: (role: VillainAnim) => boolean;
}

/**
 * A villain's visual: its own model animated with the hero's clips
 * retargeted onto its rig, or (the clone) the hero model itself, tinted dark.
 * Feet at y = 0, facing +Z.
 */
export const VillainModel = forwardRef<VillainModelHandle, { def: VillainDef }>(function VillainModel({ def }, ref) {
  const hero = useGLTF(HERO_MODELS.hatch.url);
  const ual = useGLTF(HERO_MODELS.ual.url);
  const villain = useGLTF(def.model.kind === 'villain' ? def.model.url : HERO_MODELS.hatch.url);

  const built = useMemo(() => {
    const isHero = def.model.kind === 'hero';
    const rig = def.model.kind === 'villain' ? def.model.rig : null;
    const clips: Partial<Record<VillainAnim, AnimationClip>> = isHero
      ? (resolveClips(hero.animations, ROLE_PATTERNS as never) as Partial<Record<VillainAnim, AnimationClip>>)
      : rig?.type === 'native'
        ? nativeClips(def, villain.animations)
        : bakeClips(def, villain.scene, hero, ual);
    const model = isHero ? cloneSkinned(villain.scene) : villainClone(villain.scene, def);
    const owned: Material[] = [];
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const recolour = (m: Material) => {
        const c = (m as MeshStandardMaterial).clone();
        const named = def.colors?.[m.name];
        if (named) c.color = new Color(named);
        if (def.tint) c.color.multiply(new Color(def.tint));
        // No reflection map in the scene yet: metal materials would render nearly black.
        if (c.metalness !== undefined) c.metalness = Math.min(c.metalness, 0.15);
        // Glowing eyes stay bright.
        if (/glow/i.test(m.name)) c.emissive = new Color('#ff1a0a');
        owned.push(c);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolour) : recolour(mesh.material);
    });
    model.updateMatrixWorld(true);
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    const scale = def.heightMeters / (size.y || 1);
    const pose = new CombatPose(model, isHero ? undefined : rig?.type === 'native' ? rig.aliases : rig?.type === 'rigify' ? RIGIFY_ALIASES : DAVIDA3D_ALIASES);
    return { model, clips, owned, scale, offset: [-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale] as [number, number, number], pose };
  }, [def, hero, villain, ual]);
  useEffect(() => () => built.owned.forEach((m) => m.dispose()), [built]);

  const anim = useMemo(() => {
    const mixer = new AnimationMixer(built.model);
    const actions: Partial<Record<VillainAnim, AnimationAction>> = {};
    for (const [role, clip] of Object.entries(built.clips) as [VillainAnim, AnimationClip][]) {
      const a = mixer.clipAction(clip);
      a.setLoop(LOOPING[role] ? LoopRepeat : LoopOnce, Infinity);
      a.clampWhenFinished = !LOOPING[role];
      actions[role] = a;
    }
    actions.idle?.play();
    return { mixer, actions };
  }, [built]);
  useEffect(
    () => () => {
      anim.mixer.stopAllAction();
    },
    [anim],
  );

  const root = useRef<Group>(null);
  const current = useRef<AnimationAction | null>(null);
  const overlay = useRef<{ punch: { side: 'left' | 'right'; progress: number } | null; attacking: AnimationAction | null; nextAttack: number }>({ punch: null, attacking: null, nextAttack: 0 });
  const tmp = useRef({ q: new Quaternion(), fwd: new Vector3(), up: new Vector3() });

  useImperativeHandle(ref, () => ({
    root: root.current,
    play: (role, speed = 1) => {
      // An attack clip plays out before the next role takes over.
      if (overlay.current.attacking) return;
      const next = anim.actions[role] ?? (role === 'stun' || role === 'hit' ? anim.actions.idle : role === 'die' ? (anim.actions.fall ?? anim.actions.idle) : anim.actions.idle);
      if (!next) return;
      next.setEffectiveTimeScale(speed);
      const playing = current.current ?? anim.actions.idle ?? null;
      if (next === playing) return;
      next.reset().fadeIn(0.2).play();
      playing?.fadeOut(0.2);
      current.current = next;
    },
    punch: (side, progress) => {
      const o = overlay.current;
      const active = progress >= 0 && progress < 1;
      const clips = ATTACKS.map((k) => anim.actions[k]).filter((a): a is AnimationAction => !!a);
      if (clips.length) {
        // Real attack clip: starts with the punch and plays through (the blow lands ~35% in).
        if (active && !o.attacking) {
          const a = clips[o.nextAttack++ % clips.length];
          a.reset().setEffectiveTimeScale(a.getClip().duration / 0.75).setEffectiveWeight(1).fadeIn(0.06).play();
          current.current?.fadeOut(0.06);
          current.current = a;
          o.attacking = a;
        } else if (o.attacking && !o.attacking.isRunning()) {
          o.attacking = null;
        }
        o.punch = null;
        return;
      }
      o.punch = active ? { side, progress } : null;
    },
    has: (role) => !!anim.actions[role],
    eyes: (out) => {
      const r = root.current;
      if (!r) return false;
      r.getWorldQuaternion(tmp.current.q);
      tmp.current.fwd.set(0, 0, 1).applyQuaternion(tmp.current.q);
      tmp.current.up.set(0, 1, 0).applyQuaternion(tmp.current.q);
      return built.pose.eyes(out, tmp.current.fwd, tmp.current.up, def.heightMeters);
    },
  }));

  useFrame(({ camera }, dt) => {
    const r = root.current;
    if (!r) return;
    if (!r.visible || r.position.distanceTo(camera.position) > VILLAIN_ANIMATE_WITHIN) return;
    anim.mixer.update(Math.min(dt, 0.05) * runtime.timeScale);
    const p = overlay.current.punch;
    if (p) {
      r.updateWorldMatrix(true, true);
      r.getWorldQuaternion(tmp.current.q);
      tmp.current.fwd.set(0, 0, 1).applyQuaternion(tmp.current.q);
      built.pose.applyFighting(tmp.current.fwd, def.heightMeters, 0, [{ side: p.side, progress: p.progress, twist: 0.45, lean: 0.2 }]);
    }
  });

  return (
    <group ref={root}>
      <group rotation-y={def.yawOffset}>
        <group scale={built.scale} position={built.offset}>
          <primitive object={built.model} />
        </group>
      </group>
    </group>
  );
});
