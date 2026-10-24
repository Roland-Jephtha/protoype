import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AnimationMixer, Box3, Color, Group, LoopOnce, LoopRepeat, Quaternion, Vector3, type AnimationAction, type AnimationClip, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HERO_MODELS } from '../../config/assets';
import { VILLAINS, type VillainDef } from '../../config/villains';
import { MIXAMO_TO_DAVIDA3D, retargetClip } from '../characters/retarget';
import { CombatPose, type BoneAliases } from '../player/combatPose';
import { resolveClips } from '../player/heroAnimation';

export type VillainAnim = 'idle' | 'walk' | 'run' | 'fly' | 'fall' | 'taunt';

/** Hero (Mixamo) clips each villain role is built from. */
const ROLE_PATTERNS: Record<VillainAnim, RegExp[]> = {
  idle: [/^mixamo\.com$/i, /idle/i],
  walk: [/^walking$/i, /walk/i],
  run: [/^running$/i, /run/i],
  fly: [/^flying$/i, /fly/i],
  fall: [/falling/i],
  taunt: [/dynamic pose/i, /^mixamo\.com$/i],
};
const LOOPING: Record<VillainAnim, boolean> = { idle: true, walk: true, run: true, fly: true, fall: true, taunt: false };

/** DavidA3D rig names for the bones CombatPose needs. */
const DAVIDA3D_ALIASES: BoneAliases = { ...Object.fromEntries(MIXAMO_TO_DAVIDA3D.map((p) => [p.source, p.target])), Spine1: 'Spine' };

// Fetch every villain model (and the hero model the clips come from) once at startup.
useGLTF.preload(HERO_MODELS.hatch.url);
for (const v of Object.values(VILLAINS)) if (v.model.kind === 'villain') useGLTF.preload(v.model.url);

/** Villains farther than this from the camera aren't animated (m). */
const VILLAIN_ANIMATE_WITHIN = 150;
/** Retargeted clips are sampled at this rate (the mixer interpolates between keys). */
const BAKE_FPS = 20;

/** Baked clips per villain model (retargeting runs once per model, not per instance). */
const bakedCache = new WeakMap<Object3D, Partial<Record<VillainAnim, AnimationClip>>>();

function bakeClips(villainScene: Object3D, heroScene: Object3D, heroClips: AnimationClip[], yawOffset: number) {
  let baked = bakedCache.get(villainScene);
  if (baked) return baked;
  baked = {};
  const src = cloneSkinned(heroScene);
  // Both rigs must face +Z while baking, or motion would be applied mirrored.
  const tgt = new Group().add(cloneSkinned(villainScene));
  tgt.rotation.y = yawOffset;
  const roles = resolveClips(heroClips, ROLE_PATTERNS as never) as Partial<Record<VillainAnim, AnimationClip>>;
  for (const [role, clip] of Object.entries(roles) as [VillainAnim, AnimationClip][]) baked[role] = retargetClip(src, tgt, clip, MIXAMO_TO_DAVIDA3D, BAKE_FPS);
  bakedCache.set(villainScene, baked);
  return baked;
}

export interface VillainModelHandle {
  root: Group | null;
  play: (anim: VillainAnim, speed?: number) => void;
  /** Overlay poses applied after animation: punch (0..1 progress), beam (eyes forward). */
  punch: (side: 'left' | 'right', progress: number) => void;
  /** World position between the eyes (for beams), false if unavailable. */
  eyes: (out: Vector3) => boolean;
}

/**
 * A villain's visual: its own model animated with the hero's clips
 * retargeted onto its rig, or (the clone) the hero model itself, tinted dark.
 * Feet at y = 0, facing +Z.
 */
export const VillainModel = forwardRef<VillainModelHandle, { def: VillainDef }>(function VillainModel({ def }, ref) {
  const hero = useGLTF(HERO_MODELS.hatch.url);
  const villain = useGLTF(def.model.kind === 'villain' ? def.model.url : HERO_MODELS.hatch.url);

  const built = useMemo(() => {
    const isHero = def.model.kind === 'hero';
    const clips: Partial<Record<VillainAnim, AnimationClip>> = isHero
      ? (resolveClips(hero.animations, ROLE_PATTERNS as never) as Partial<Record<VillainAnim, AnimationClip>>)
      : bakeClips(villain.scene, hero.scene, hero.animations, def.yawOffset);
    const model = cloneSkinned(villain.scene);
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
    const pose = new CombatPose(model, isHero ? undefined : DAVIDA3D_ALIASES);
    return { model, clips, owned, scale, offset: [-((box.min.x + box.max.x) / 2) * scale, -box.min.y * scale, -((box.min.z + box.max.z) / 2) * scale] as [number, number, number], pose };
  }, [def, hero, villain]);
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
  const overlay = useRef<{ punch: { side: 'left' | 'right'; progress: number } | null }>({ punch: null });
  const tmp = useRef({ q: new Quaternion(), fwd: new Vector3(), up: new Vector3() });

  useImperativeHandle(ref, () => ({
    root: root.current,
    play: (role, speed = 1) => {
      const next = anim.actions[role] ?? anim.actions.idle;
      if (!next) return;
      next.setEffectiveTimeScale(speed);
      const playing = current.current ?? anim.actions.idle ?? null;
      if (next === playing) return;
      next.reset().fadeIn(0.2).play();
      playing?.fadeOut(0.2);
      current.current = next;
    },
    punch: (side, progress) => {
      overlay.current.punch = progress >= 0 && progress < 1 ? { side, progress } : null;
    },
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
    anim.mixer.update(Math.min(dt, 0.05));
    const p = overlay.current.punch;
    if (p) {
      r.updateWorldMatrix(true, true);
      r.getWorldQuaternion(tmp.current.q);
      tmp.current.fwd.set(0, 0, 1).applyQuaternion(tmp.current.q);
      built.pose.applyPunch(p.side, p.progress, tmp.current.fwd, def.heightMeters);
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
