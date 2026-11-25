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
import { HERO_MODELS, type HeroAnim, type HeroModelDef } from '../../config/assets';
import { mixamoAliases, retargetClip, rigPairs, UAL_TO_MIXAMO, RIG_NAMES } from '../characters/retarget';
import { CapeBones } from './capeBones';
import { AfterimageTrail } from './afterimages';
import { SPEED_FORCE } from '../../config/combat';
import { useSettings } from '../../state/settings';
import { useApp } from '../../state/appStore';
import { canonicalBoneName, MIXAMO_FROM_UAL } from './boneNames';
import { PLAYER } from '../../config/gameConfig';
import { runtime } from '../runtime';
import { hitPose } from '../combat/heroActions';
import { ClothCape, type CapsuleCollider } from './clothCape';
import { FootSoles, nextFootLift } from './footGrounding';
import type { GroundMotor } from './groundMovement';
import { LOCOMOTION, LOOPING, resolveClips, roleForState } from './heroAnimation';
import { applySuperSuit, measureModel } from './superSuit';
import { CombatPose } from './combatPose';
import { HERO_COMBAT, HERO_HIT, LIFT, type StrikeKind } from '../../config/combat';
import { clubAngle, ONE_HANDED } from '../combat/liftShapes';

/** Real strike clips from the CC0 mannequin's animation library (others still use the procedural arm pose). */
// None: Superman's punches are posed procedurally (applySuperPunch), not boxing clips.
const STRIKE_CLIPS: Partial<Record<StrikeKind, string>> = {};
/** Strike clips are played this much longer than the strike itself, so their follow-through blends out. */
const STRIKE_TAIL = 1.35;

/** Starts `next` at the same point of its cycle as `prev` (keeps foot phase between locomotion loops). */
function syncPhase(next: AnimationAction, prev: AnimationAction) {
  next.time = (prev.time / prev.getClip().duration) * next.getClip().duration;
}

/** Strike clips baked onto each hero rig (retargeted once per model). */
const strikeCache = new WeakMap<Object3D, Partial<Record<StrikeKind, AnimationClip>>>();

function strikeClips(heroScene: Object3D, ualScene: Object3D, ualClips: AnimationClip[], def: HeroModelDef) {
  let out = strikeCache.get(heroScene);
  if (out) return out;
  out = {};
  const sameRig = def.id === 'ual';
  const src = sameRig ? null : cloneSkinned(ualScene);
  const tgt = sameRig ? null : cloneSkinned(heroScene);
  const rig = def.retarget?.rig;
  const pairs = rig ? rigPairs('ual', rig) : UAL_TO_MIXAMO;
  const hips = { source: 'hips', target: rig ? RIG_NAMES[rig].hips : 'Hips' };
  for (const [kind, name] of Object.entries(STRIKE_CLIPS) as [StrikeKind, string][]) {
    const clip = ualClips.find((c) => c.name === name);
    if (!clip) continue;
    out[kind] = sameRig || !src || !tgt ? clip : retargetClip(src, tgt, clip, pairs, 30, hips);
  }
  strikeCache.set(heroScene, out);
  return out;
}

/** A clip from the CC0 mannequin's library on this hero's rig (e.g. the fall onto the back), once per model. */
const ualClipCache = new WeakMap<Object3D, Map<string, AnimationClip | null>>();

function ualClip(heroScene: Object3D, ual: { scene: Object3D; animations: AnimationClip[] }, def: HeroModelDef, name: string): AnimationClip | null {
  let cache = ualClipCache.get(heroScene);
  if (!cache) {
    cache = new Map();
    ualClipCache.set(heroScene, cache);
  }
  if (cache.has(name)) return cache.get(name) ?? null;
  const clip = ual.animations.find((c) => c.name === name) ?? null;
  let out: AnimationClip | null = clip;
  if (clip && def.id !== 'ual') {
    const rig = def.retarget?.rig;
    out = retargetClip(cloneSkinned(ual.scene), cloneSkinned(heroScene), clip, rig ? rigPairs('ual', rig) : UAL_TO_MIXAMO, 30, { source: 'hips', target: rig ? RIG_NAMES[rig].hips : 'Hips' });
  }
  cache.set(name, out);
  return out;
}

/** Locomotion clips for a model without its own: another hero's clips retargeted onto its rig (once per model). */
const roleCache = new WeakMap<Object3D, AnimationClip[]>();

function retargetedClips(heroScene: Object3D, source: { scene: Object3D; animations: AnimationClip[] }, def: HeroModelDef): AnimationClip[] {
  const rig = def.retarget?.rig;
  if (!rig) return [];
  let out = roleCache.get(heroScene);
  if (out) return out;
  const src = cloneSkinned(source.scene);
  const tgt = cloneSkinned(heroScene);
  const pairs = rigPairs('mixamo', rig);
  const hips = { source: 'Hips', target: RIG_NAMES[rig].hips };
  // Only the clips the roles use.
  const wanted = new Set(Object.values(resolveClips(source.animations, def.clips)));
  out = [...wanted].filter(Boolean).map((c) => retargetClip(src, tgt, c as AnimationClip, pairs, 30, hips));
  roleCache.set(heroScene, out);
  return out;
}

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
    const pose = new CombatPose(model, def.retarget ? mixamoAliases(def.retarget.rig) : undefined);
    // A model's own skinned cape (Injustice rigs) is driven procedurally.
    const capeBones = new CapeBones(model);

    return { model, scale, minY: m.minY, centerX: m.centerX, cape, capeAnchor, soles, pose, capeBones, ownedMaterials, ownedGeometries };
  }, [gltf, def]);

  useEffect(
    () => () => {
      built.ownedMaterials.forEach((mat) => mat.dispose());
      built.ownedGeometries.forEach((g) => g.dispose());
      built.cape?.dispose();
      runtime.heroEyesValid = false;
    },
    [built],
  );

  // The cloth lives in world space, so its mesh is a direct child of the scene.
  const scene = useThree((s) => s.scene);
  // Speed Force afterimages: ghost copies of this model, in world space.
  const quality = useSettings((s) => s.graphicsQuality);
  const ghosts = useMemo(() => new AfterimageTrail(built.model, SPEED_FORCE.afterimages.count[quality]), [built, quality]);
  useEffect(() => {
    ghosts.addTo(scene);
    return () => {
      ghosts.removeFrom(scene);
      ghosts.dispose();
    };
  }, [scene, ghosts]);
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
  const combatTmp = useRef({ q: new Quaternion(), forward: new Vector3(), up: new Vector3(), guard: 0 });

  const ual = useGLTF(HERO_MODELS.ual.url);
  // Models without their own clips borrow the Hatch hero's (always committed).
  const clipSource = useGLTF(HERO_MODELS.hatch.url);
  const anim = useMemo(() => {
    const mixer = new AnimationMixer(built.model);
    const clips = resolveClips(def.retarget ? retargetedClips(gltf.scene, clipSource, def) : gltf.animations, def.clips);
    // Punches: real strike clips, played over everything while a punch is thrown.
    const strikes: Partial<Record<StrikeKind, AnimationAction>> = {};
    for (const [kind, clip] of Object.entries(strikeClips(gltf.scene, ual.scene, ual.animations, def)) as [StrikeKind, AnimationClip][]) {
      const a = mixer.clipAction(clip);
      a.setLoop(LoopOnce, 1);
      a.clampWhenFinished = true;
      strikes[kind] = a;
    }
    const actions: Partial<Record<HeroAnim, AnimationAction>> = {};
    for (const [role, clip] of Object.entries(clips) as [HeroAnim, AnimationClip][]) {
      const a = mixer.clipAction(clip);
      a.setLoop(LOOPING[role] ? LoopRepeat : LoopOnce, Infinity);
      a.clampWhenFinished = !LOOPING[role];
      actions[role] = a;
    }
    const jumpStartDuration = clips.jumpStart ? clips.jumpStart.duration * 0.6 : 0;
    // Borrowed (retargeted) clips can stand the body higher or lower than its bind
    // pose: measure the soles in the idle pose once and put them on the ground.
    let soleOffset = 0;
    const idle = actions.idle;
    if (idle && built.soles.available) {
      // Measured in the model's own space (detached from the scene while measuring).
      const parent = built.model.parent;
      parent?.remove(built.model);
      idle.play();
      mixer.update(0);
      built.model.updateMatrixWorld(true);
      soleOffset = built.soles.lowestWorldY() - built.minY;
      idle.stop();
      mixer.update(0);
      parent?.add(built.model);
    }
    // Knocked down: a real fall onto the back (held at its last frame while he lies there).
    const fallClip = ualClip(gltf.scene, ual, def, 'Death01');
    const fall = fallClip ? mixer.clipAction(fallClip) : null;
    if (fall) {
      fall.setLoop(LoopOnce, 1);
      fall.clampWhenFinished = true;
    }
    return { mixer, actions, strikes, jumpStartDuration, soleOffset, fall };
  }, [built, gltf, def, ual, clipSource]);

  useEffect(
    () => () => {
      anim.mixer.stopAllAction();
      anim.mixer.uncacheRoot(built.model);
    },
    [anim, built],
  );

  const currentRole = useRef<string | null>(null);
  const ghostsRef = useRef(ghosts);
  useEffect(() => {
    ghostsRef.current = ghosts;
  }, [ghosts]);
  const currentAction = useRef<AnimationAction | null>(null);
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
    // Knocked off his feet: a real fall clip onto his back where the rig has one (else a tilt).
    const hh = runtime.heroHit;
    const fullHit = hh.t >= 0 ? hitPose(hh.kind, hh.t, hh.forward) : null;
    if (!fullHit && hh.t >= 0) hh.t = -1;
    const fallingDown = !!anim.fall && hh.t >= 0 && hh.kind === 'knockdown' && hh.t < HERO_HIT.fall + HERO_HIT.lie;
    const hit = anim.fall && hh.kind === 'knockdown' ? null : fullHit;
    if (hit && hh.kind === 'knockdown' && hit.drop > 0.3 && anim.actions.airborne) role = 'airborne';
    if (!anim.actions[role]) role = role === 'hardLand' && anim.actions.land ? 'land' : role === 'jumpStart' ? 'airborne' : role;
    let next = anim.actions[role] ?? anim.actions.idle;
    let key: string = role;
    // A punch with a real strike clip takes over the whole body for its duration.
    const cb = runtime.combat;
    const strikeKind = cb.punching && !cb.powerPunching && !runtime.carrying ? cb.strikes[0]?.kind : undefined;
    const strikeAction = strikeKind ? anim.strikes[strikeKind] : undefined;
    const striking = !!strikeAction && cb.punchTime < cb.strikeLength * STRIKE_TAIL;
    if (fallingDown && anim.fall) {
      next = anim.fall;
      key = 'knockdown';
    } else if (striking && strikeAction) {
      next = strikeAction;
      key = `strike:${strikeKind}:${cb.combo}:${cb.sinceLastPunch < 0.05 ? 'new' : ''}`;
      // A new punch of the same kind restarts the clip.
      if (currentRole.current?.startsWith(`strike:${strikeKind}:${cb.combo}`)) key = currentRole.current;
    }

    const prevRole = currentRole.current;
    const prev = currentAction.current ?? undefined;
    if (key !== prevRole && next === prev && !striking) {
      // Different role, same clip (run ↔ sprint both use the run clip): keep playing it.
      // Cross-fading an action into itself would fade it out and drop the hero into
      // his rest pose — the "gliding with arms out" look.
      currentRole.current = key;
    } else if (key !== prevRole && next) {
      // Getting up from a knockdown blends slowly out of the lying pose.
      const fade = key === 'knockdown' ? 0.1 : prevRole === 'knockdown' ? HERO_HIT.getUp : striking ? 0.06 : prevRole?.startsWith('strike') ? 0.14 : role === 'airborne' || role === 'jumpStart' || role === 'land' ? 0.1 : 0.2;
      next.reset();
      // Keep foot phase when blending between locomotion loops.
      if (prev && prevRole && LOCOMOTION.includes(prevRole as HeroAnim) && LOCOMOTION.includes(role)) {
        syncPhase(next, prev);
      }
      next.setEffectiveWeight(1).fadeIn(fade).play();
      if (prev && prev !== next) prev.fadeOut(fade);
      currentRole.current = key;
      currentAction.current = next;
    }

    // Locomotion playback rate follows ground speed.
    const sp = def.clipSpeeds;
    const rate = (ref: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, hSpeed / ref));
    if (key === 'knockdown' && next) next.setEffectiveTimeScale(next.getClip().duration / (HERO_HIT.fall * 2.2));
    else if (striking && next) next.setEffectiveTimeScale(next.getClip().duration / (cb.strikeLength * STRIKE_TAIL));
    else if (role === 'walk') next?.setEffectiveTimeScale(rate(sp.walk, 0.5, 2.2));
    // Run and sprint: one rule. Playback follows ground speed (up to ~5.5× at 90 km/h)
    // so the feet keep pace with the ground instead of sliding.
    else if (role === 'run' || role === 'sprint') next?.setEffectiveTimeScale(rate(role === 'run' ? sp.run : sp.sprint, 0.6, 7.5));
    else next?.setEffectiveTimeScale(1);
    // Total weight of all playing clips; below 1 means the pose is blending toward the rest pose.
    runtime.heroAnimWeight = [...new Set([...Object.values(anim.actions), ...Object.values(anim.strikes)])].reduce((sum, a) => sum + (a?.isRunning() ? a.getEffectiveWeight() : 0), 0);

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
      // Hit reaction on top of the flight pitch: pivoting at the hips, so lying down also drops them to the ground.
      pitchGroup.current.rotation.x = fl.pitch + (hit?.pitch ?? 0);
      pitchGroup.current.position.y = pivotY + (role === 'hover' ? Math.sin(fl.bob * 2.2) * 0.04 : 0) - (hit ? hit.drop * (pivotY - 0.18) : 0);
    }
    // Bones were just posed by the mixer; refresh world matrices before sampling them.
    f.updateWorldMatrix(true, true);

    // The model's own cape swings back with speed and streams behind in flight.
    if (built.capeBones.available && pitchGroup.current) {
      const ct = combatTmp.current;
      pitchGroup.current.getWorldQuaternion(ct.q);
      ct.up.set(1, 0, 0).applyQuaternion(ct.q); // the body's left (model faces +Z)
      built.capeBones.update(dt, Math.hypot(hSpeed, v.y), role === 'fly', ct.up);
    }

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

    // Combat overlay: the punching arm, and where the eyes are for heat vision.
    if (pitchGroup.current) {
      const ct = combatTmp.current;
      pitchGroup.current.getWorldQuaternion(ct.q);
      ct.forward.set(0, 0, 1).applyQuaternion(ct.q);
      ct.up.set(0, 1, 0).applyQuaternion(ct.q);
      const c = runtime.combat;
      // He's a fighter: fists always clenched (a club is gripped too; open hands only under heavy things).
      const carry = runtime.carrying;
      const club = !!carry && ONE_HANDED.has(carry.type);
      const wantFists = carry && !club ? 0 : 1;
      ct.guard += (wantFists - ct.guard) * Math.min(1, dt * 10);
      if (carry && club) built.pose.applyClub(ct.forward, def.heightMeters, clubAngle(carry.swing, LIFT.swingTime));
      else if (carry) {
        // Arms rise with the object as he lifts it; a slam brings them down in front.
        const k = Math.min(1, carry.t / LIFT.liftTime);
        built.pose.applyLift(ct.forward, def.heightMeters, k * k * (3 - 2 * k));
      }
      else if (c.punching) {
        // Superman's punch: the strike in progress (the latest one thrown), whole body behind it.
        const d = c.powerPunching ? HERO_COMBAT.punch.duration : c.strikeLength;
        const st = [...c.strikes].reverse().find((x) => c.punchTime >= x.at) ?? c.strikes[0];
        if (st) built.pose.applySuperPunch(ct.forward, def.heightMeters, st.side, (c.punchTime - st.at) / d, st.heavy ? 1 : 0);
      }
      built.pose.makeFists(ct.guard);
      runtime.heroHandValid = built.pose.handPosition('right', runtime.heroHand);
      runtime.heroEyesValid = built.pose.eyes(runtime.heroEyes, ct.forward, ct.up, def.heightMeters);
    }

    // Afterimages copy the final pose (after combat overlays), every few frames while Speed Force runs.
    built.model.updateWorldMatrix(true, true);
    ghostsRef.current.update(dt, runtime.speedForce && Math.hypot(v.x, v.y, v.z) > 2 && !useApp.getState().paused);

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
              position={[-built.centerX * built.scale, -(built.minY + anim.soleOffset) * built.scale, 0]}
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
