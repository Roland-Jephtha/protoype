import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  AnimationMixer,
  BufferGeometry,
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
import { useApp } from '../../state/appStore';
import { canonicalBoneName, MIXAMO_FROM_UAL } from './boneNames';
import { ClothCape, type CapsuleCollider } from './clothCape';
import type { GroundMotor } from './groundMovement';
import { LOCOMOTION, LOOPING, resolveClips, roleForState } from './heroAnimation';
import { applySuperSuit, measureModel } from './superSuit';

/** Finds a bone by canonical name across rigs (Mixamo or Quaternius naming). */
function boneByCanon(root: Object3D, names: string[]): Object3D | undefined {
  let hit: Object3D | undefined;
  root.traverse((o) => {
    if (!hit && (o as Bone).isBone && names.includes(canonicalBoneName(o.name))) hit = o;
  });
  return hit;
}

/** Capsules approximating the back, head and legs, sized from the character height. */
function bodyColliders(root: Object3D, H: number): CapsuleCollider[] {
  const b = (mixamo: string) => boneByCanon(root, [mixamo, MIXAMO_FROM_UAL[mixamo]]);
  const out: CapsuleCollider[] = [];
  const cap = (a: string, z: string | null, radius: number) => {
    const A = b(a);
    const B = z ? b(z) : undefined;
    if (A && (B || !z)) out.push({ a: A, b: B, radius: radius * H });
  };
  cap('Hips', 'Spine2', 0.075);
  cap('Spine2', 'Neck', 0.08);
  cap('Head', null, 0.065);
  for (const s of ['Left', 'Right']) {
    cap(`${s}UpLeg`, `${s}Leg`, 0.05);
    cap(`${s}Leg`, `${s}Foot`, 0.04);
  }
  return out;
}

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
    let cape: ClothCape | null = null;
    let capeAnchor: Object3D | null = null;
    if (chest && def.addCape) {
      // Cloth cape pinned across the shoulders, colliding with torso/head/legs.
      capeAnchor = new Object3D();
      attachAtBindPose(model, chest, capeAnchor, new Vector3(m.centerX, m.minY + 0.81 * m.height, m.backZ - 0.01 * m.height));
      const H = def.heightMeters;
      cape = new ClothCape({ length: 0.6 * H, topWidth: 0.22 * H, hemWidth: 0.4 * H, localPerMeter: 1 / scale });
      cape.setColliders(bodyColliders(model, H));
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

    return { model, scale, minY: m.minY, centerX: m.centerX, cape, capeAnchor, ownedMaterials, ownedGeometries };
  }, [gltf, def]);

  useEffect(
    () => () => {
      built.ownedMaterials.forEach((mat) => mat.dispose());
      built.ownedGeometries.forEach((g) => g.dispose());
      built.cape?.dispose();
    },
    [built],
  );

  // The cloth lives in world space, so its mesh is a direct child of the scene.
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const mesh = built.cape?.mesh;
    if (!mesh) return;
    scene.add(mesh);
    return () => {
      scene.remove(mesh);
    };
  }, [scene, built]);
  const stillAir = useMemo(() => new Vector3(), []);

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
    // Up to ~5× so the legs keep pace at 80 km/h instead of the feet gliding.
    else if (role === 'sprint') next?.setEffectiveTimeScale(rate(sp.sprint, 0.7, 5));
    else next?.setEffectiveTimeScale(1);

    anim.mixer.update(dt);
    if (built.cape && built.capeAnchor && facing.current && !useApp.getState().paused) {
      // Bones were just posed by the mixer; refresh world matrices before sampling them.
      facing.current.updateWorldMatrix(true, true);
      built.cape.update(built.capeAnchor, dt, stillAir, 2 + hSpeed * 1.4);
    }
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
