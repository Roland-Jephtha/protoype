import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRapier } from '@react-three/rapier';
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
import { PLAYER } from '../../config/gameConfig';
import { runtime } from '../runtime';
import { ClothCape, type CapsuleCollider } from './clothCape';
import { FootSoles, nextFootLift } from './footGrounding';
import type { GroundMotor } from './groundMovement';
import { LOCOMOTION, LOOPING, resolveClips, roleForState } from './heroAnimation';
import { applySuperSuit, measureModel } from './superSuit';

/** Diagnostics: `?nofootfix` disables foot grounding to compare before/after. */
const FOOT_FIX_ENABLED = typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('nofootfix');

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

    const soles = new FootSoles(model);

    return { model, scale, minY: m.minY, centerX: m.centerX, cape, capeAnchor, soles, ownedMaterials, ownedGeometries };
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

  // Foot grounding: a downward ray finds the surface under the hero (road,
  // sidewalk, stairs, ramp); the body is lifted so the soles never sink into it.
  const { world, rapier } = useRapier();
  const groundRay = useRef<InstanceType<typeof rapier.Ray> | null>(null);
  const liftGroup = useRef<Group>(null);
  const footLift = useRef(0);
  // Flight: body pitch follows the climb/dive angle (pivot at the hips).
  const pitchGroup = useRef<Group>(null);
  const pivotY = def.heightMeters * 0.6;
  const flight = useRef({ pitch: 0, bob: 0 });
  const tmpPos = useMemo(() => new Vector3(), []);

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

    const prevRole = currentRole.current;
    const prev = prevRole ? anim.actions[prevRole] : undefined;
    if (role !== prevRole && next === prev) {
      // Different role, same clip (run ↔ sprint both use the run clip): keep playing it.
      // Cross-fading an action into itself would fade it out and drop the hero into
      // his rest pose — the "gliding with arms out" look.
      currentRole.current = role;
    } else if (role !== prevRole && next) {
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
    // Run and sprint: one rule. Playback follows ground speed (up to ~5.5× at 90 km/h)
    // so the feet keep pace with the ground instead of sliding.
    else if (role === 'run' || role === 'sprint') next?.setEffectiveTimeScale(rate(role === 'run' ? sp.run : sp.sprint, 0.6, 5.5));
    else next?.setEffectiveTimeScale(1);
    // Total weight of all playing clips; below 1 means the pose is blending toward the rest pose.
    runtime.heroAnimWeight = [...new Set(Object.values(anim.actions))].reduce((sum, a) => sum + (a?.isRunning() ? a.getEffectiveWeight() : 0), 0);

    anim.mixer.update(dt);
    const f = facing.current;
    if (!f) return;

    // Flight pose: the `fly` clip is already horizontal, so only climb (nose up)
    // and dive (nose down) are added. Hovering adds a gentle bob.
    const fl = flight.current;
    const climbAngle = role === 'fly' && Math.hypot(hSpeed, v.y) > 2 ? -Math.atan2(v.y, Math.max(hSpeed, 0.01)) : 0;
    const targetPitch = Math.max(-1.4, Math.min(1.4, climbAngle));
    fl.pitch += (targetPitch - fl.pitch) * (1 - Math.exp(-6 * dt));
    fl.bob += dt;
    if (pitchGroup.current) {
      pitchGroup.current.rotation.x = fl.pitch;
      pitchGroup.current.position.y = pivotY + (role === 'hover' ? Math.sin(fl.bob * 2.2) * 0.04 : 0);
    }
    // Bones were just posed by the mixer; refresh world matrices before sampling them.
    f.updateWorldMatrix(true, true);

    if (built.soles.available && liftGroup.current) {
      f.getWorldPosition(tmpPos);
      groundRay.current ??= new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
      const ray = groundRay.current;
      ray.origin = { x: tmpPos.x, y: tmpPos.y + 0.8, z: tmpPos.z };
      const hit = world.castRay(ray, 2.5, true, undefined, undefined, undefined, runtime.playerBody ?? undefined);
      const groundY = hit ? tmpPos.y + 0.8 - hit.timeOfImpact : tmpPos.y - PLAYER.controllerOffset;
      // Sole height as if uncorrected (the measured pose includes last frame's lift).
      const soleAboveGround = built.soles.lowestWorldY() - groundY - footLift.current;
      if (FOOT_FIX_ENABLED) {
        const planted = role === 'idle' || role === 'walk' || role === 'land' || role === 'hardLand';
        footLift.current = nextFootLift(footLift.current, soleAboveGround, motor.grounded, planted, dt);
        liftGroup.current.position.y = footLift.current;
        f.updateWorldMatrix(false, true);
      }
      runtime.heroSoleAboveGround = soleAboveGround + footLift.current;
      runtime.heroFootLift = footLift.current;
    }

    if (built.cape && built.capeAnchor && !useApp.getState().paused) {
      built.cape.update(built.capeAnchor, dt, stillAir, 2 + hSpeed * 1.4);
    }
  });

  return (
    <group ref={facing}>
      <group ref={liftGroup}>
        {/* Flight pitch pivots around the hips. */}
        <group ref={pitchGroup} position-y={pivotY}>
          <group position-y={-pivotY}>
            <group
              rotation-y={def.yawOffset}
              scale={built.scale}
              position={[-built.centerX * built.scale, -built.minY * built.scale, 0]}
            >
              <primitive object={built.model} />
            </group>
          </group>
        </group>
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
