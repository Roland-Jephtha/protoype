import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AnimationMixer,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Group,
  type Material,
} from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroAnim, HeroModelDef } from '../../config/assets';
import { createCapeGeometry, updateCape, type CapeState } from './cape';
import type { GroundMotor } from './groundMovement';
import { LOCOMOTION, LOOPING, resolveClips, roleForState } from './heroAnimation';
import { applySuperSuit, measureModel } from './superSuit';

/** Finds the upper-spine/chest bone used to anchor the cape and emblem. */
function findChestBone(root: Object3D): Bone | null {
  const bones: Bone[] = [];
  root.traverse((o) => {
    if ((o as Bone).isBone) bones.push(o as Bone);
  });
  const prefs = [/spine\.?0*3/i, /chest/i, /upper.?chest/i, /spine\.?0*2/i, /spine/i];
  for (const re of prefs) {
    const hit = bones.find((b) => re.test(b.name));
    if (hit) return hit;
  }
  return null;
}

/**
 * Parents `child` to `bone` so that, in the bind pose, it sits at
 * `rootSpacePos` with the root's orientation. Afterwards it follows the bone.
 */
function attachAtBindPose(root: Object3D, bone: Bone, child: Object3D, rootSpacePos: Vector3) {
  root.updateMatrixWorld(true);
  const rootInv = new Matrix4().copy(root.matrixWorld).invert();
  const boneInRoot = new Matrix4().multiplyMatrices(rootInv, bone.matrixWorld);
  const desired = new Matrix4().compose(rootSpacePos, new Quaternion(), new Vector3(1, 1, 1));
  const local = new Matrix4().copy(boneInRoot).invert().multiply(desired);
  local.decompose(child.position, child.quaternion, child.scale);
  bone.add(child);
}

/**
 * Rigged GLB hero. Uniformly scaled to `def.heightMeters`, feet at y = 0,
 * facing +Z. Animations follow the GroundMotor state with crossfades; walk/run
 * playback speed tracks ground speed so feet don't slide.
 */
export function HeroModel({ def, motor }: { def: HeroModelDef; motor: GroundMotor }) {
  const gltf = useGLTF(def.url);
  const facing = useRef<Group>(null);

  const built = useMemo(() => {
    const model = cloneSkinned(gltf.scene);
    const m = measureModel(model);
    const ownedMaterials: Material[] = [];
    const ownedGeometries: BufferGeometry[] = [];
    const scale = def.heightMeters / m.height;

    if (def.styling === 'superSuit') ownedMaterials.push(applySuperSuit(model, m));

    model.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Skinned bounds don't follow animation; avoid popping out of view.
        mesh.frustumCulled = false;
      }
    });

    const chest = findChestBone(model);
    let capePivot: Object3D | null = null;
    const capeGeometry = def.addCape ? createCapeGeometry(0.62 * m.height, 0.25 * m.height, 0.42 * m.height) : null;
    if (capeGeometry) ownedGeometries.push(capeGeometry);
    if (chest && capeGeometry) {
      const capeMat = new MeshStandardMaterial({ color: 0xb01826, roughness: 0.75, side: DoubleSide });
      ownedMaterials.push(capeMat);
      const anchor = new Object3D();
      attachAtBindPose(model, chest, anchor, new Vector3(m.centerX, m.minY + 0.81 * m.height, m.backZ - 0.01 * m.height));
      capePivot = new Object3D();
      const capeMesh = new Mesh(capeGeometry, capeMat);
      capeMesh.castShadow = true;
      capePivot.add(capeMesh);
      anchor.add(capePivot);
    }
    if (chest && def.styling === 'superSuit') {
      // Generic diamond chest emblem (original shape, not a licensed logo).
      const gold = new MeshStandardMaterial({ color: 0xe7b52c, roughness: 0.35, metalness: 0.5 });
      const red = new MeshStandardMaterial({ color: 0xc0182a, roughness: 0.5 });
      ownedMaterials.push(gold, red);
      const emblem = new Object3D();
      attachAtBindPose(model, chest, emblem, new Vector3(m.centerX, m.minY + 0.745 * m.height, m.chestFrontZ));
      const s = m.height / 1.9;
      const outer = new Mesh(diamondGeometry(0.075 * s), gold);
      const inner = new Mesh(diamondGeometry(0.045 * s), red);
      ownedGeometries.push(outer.geometry, inner.geometry);
      inner.position.z = 0.004 * s;
      emblem.add(outer, inner);
    }

    return { model, scale, minY: m.minY, centerX: m.centerX, capePivot, ownedMaterials, ownedGeometries };
  }, [gltf, def]);

  useEffect(
    () => () => {
      built.ownedMaterials.forEach((mat) => mat.dispose());
      built.ownedGeometries.forEach((g) => g.dispose());
    },
    [built],
  );

  const anim = useMemo(() => {
    const mixer = new AnimationMixer(built.model);
    const clips = resolveClips(gltf.animations, def.clips);
    const actions: Partial<Record<HeroAnim, AnimationAction>> = {};
    for (const [role, clip] of Object.entries(clips) as [HeroAnim, AnimationClip][]) {
      const a = mixer.clipAction(clip);
      a.setLoop(LOOPING[role] ? LoopRepeat : LoopOnce, Infinity);
      a.clampWhenFinished = !LOOPING[role];
      actions[role] = a;
    }
    const jumpStartDuration = clips.jumpStart ? clips.jumpStart.duration * 0.6 : 0;
    return { mixer, actions, jumpStartDuration };
  }, [built, gltf, def]);

  useEffect(
    () => () => {
      anim.mixer.stopAllAction();
      anim.mixer.uncacheRoot(built.model);
    },
    [anim, built],
  );

  const cape = useRef<CapeState>({ lift: 0.1, phase: 0 });
  const currentRole = useRef<HeroAnim | null>(null);
  // Three.js objects are mutated per frame by design; keep them behind a ref.
  const animRef = useRef(anim);
  useEffect(() => {
    animRef.current = anim;
    currentRole.current = null;
  }, [anim]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const anim = animRef.current;
    if (facing.current) facing.current.rotation.y = motor.facingYaw;

    const v = motor.velocity;
    const hSpeed = Math.hypot(v.x, v.z);
    let role = roleForState(motor.state, motor.stateTime, anim.jumpStartDuration);
    if (!anim.actions[role]) role = role === 'hardLand' && anim.actions.land ? 'land' : role === 'jumpStart' ? 'airborne' : role;
    const next = anim.actions[role] ?? anim.actions.idle;

    if (role !== currentRole.current && next) {
      const prevRole = currentRole.current;
      const prev = prevRole ? anim.actions[prevRole] : undefined;
      const fade = role === 'airborne' || role === 'jumpStart' || role === 'land' ? 0.1 : 0.2;
      next.reset();
      // Keep foot phase when blending between locomotion loops.
      if (prev && prevRole && LOCOMOTION.includes(prevRole) && LOCOMOTION.includes(role)) {
        next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
      }
      next.setEffectiveWeight(1).fadeIn(fade).play();
      prev?.fadeOut(fade);
      currentRole.current = role;
    }

    // Locomotion playback rate follows ground speed.
    const sp = def.clipSpeeds;
    const rate = (ref: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, hSpeed / ref));
    if (role === 'walk') next?.setEffectiveTimeScale(rate(sp.walk, 0.5, 2.2));
    else if (role === 'run') next?.setEffectiveTimeScale(rate(sp.run, 0.6, 2.2));
    else if (role === 'sprint') next?.setEffectiveTimeScale(rate(sp.sprint, 0.7, 2.4));
    else next?.setEffectiveTimeScale(1);

    anim.mixer.update(dt);
    if (built.capePivot) updateCape(built.capePivot, motor, cape.current, dt);
  });

  return (
    <group ref={facing}>
      <group
        rotation-y={def.yawOffset}
        scale={built.scale}
        position={[-built.centerX * built.scale, -built.minY * built.scale, 0]}
      >
        <primitive object={built.model} />
      </group>
    </group>
  );
}

/** Flat rhombus in the XY plane, facing +Z. */
function diamondGeometry(size: number) {
  const g = new BufferGeometry();
  const w = size * 0.95;
  g.setAttribute('position', new Float32BufferAttribute([0, size, 0, -w, 0, 0, 0, -size, 0, w, 0, 0], 3));
  g.setAttribute('normal', new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
