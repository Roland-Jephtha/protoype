import { useFrame, useLoader } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AnimationMixer, Box3, BufferAttribute, Color, LoopRepeat, MeshStandardMaterial, Vector3, type AnimationAction, type BufferGeometry, type Group, type Material, type Mesh, type SkinnedMesh } from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { runtime } from '../runtime';

export type AnimalKind = 'wolf' | 'coyote' | 'dog' | 'cat' | 'eagle' | 'piranha';

interface AnimalSpec {
  url: string;
  /** Longest horizontal size after scaling (m). */
  length: number;
  /** Rotation that turns the model to face +Z (checked visually per model; the pack isn't consistent). */
  yaw: number;
  move: string;
  idle: string;
  /** Speed (m/s) at which the move clip plays at normal rate. */
  clipSpeed: number;
  /** Colour per FBX material name (the pack ships untextured white materials). */
  colors: Record<string, string>;
}

const BASE = `${import.meta.env.BASE_URL}models/animals/`;

/** Quaternius Animated Animals (CC0). */
const ANIMALS: Record<AnimalKind, AnimalSpec> = {
  wolf: { url: `${BASE}wolf.fbx`, length: 1.5, yaw: -Math.PI / 2, move: 'Walking', idle: 'Idle', clipSpeed: 1.6, colors: { Wolf: '#5f5a55' } },
  coyote: { url: `${BASE}wolf.fbx`, length: 1.15, yaw: -Math.PI / 2, move: 'Walking', idle: 'Idle', clipSpeed: 1.3, colors: { Wolf: '#a8845a' } },
  dog: { url: `${BASE}dog.fbx`, length: 0.95, yaw: -Math.PI / 2, move: 'Walking', idle: 'Idle', clipSpeed: 1.1, colors: { Dog: '#8a5a32' } },
  cat: { url: `${BASE}cat.fbx`, length: 0.55, yaw: -Math.PI / 2, move: 'Walking', idle: 'Idle', clipSpeed: 0.7, colors: { Grey: '#77777b', White: '#ecebe6', Pink: '#e3a0a6' } },
  eagle: { url: `${BASE}eagle.fbx`, length: 2.1, yaw: Math.PI, move: 'Flying', idle: 'EagleArmature|Idle', clipSpeed: 14, colors: { Wings: '#4a3524', Beak: '#e0b03a', Head: '#f1efe8', Claws: '#e0b03a' } },
  piranha: { url: `${BASE}piranha.fbx`, length: 0.6, yaw: 0, move: 'Swimming', idle: 'Swimming', clipSpeed: 1.5, colors: { Brown: '#6b5a48', LightYellow: '#c9a24a', Black: '#141414', White: '#e8e8e8' } },
};

/**
 * Rewrites a geometry's index so each material's triangles are contiguous,
 * collapsing many small draw groups into one per material.
 */
function consolidateGroups(geo: BufferGeometry) {
  if (geo.groups.length <= 1) return;
  const count = geo.index ? geo.index.count : geo.attributes.position.count;
  const source = geo.index ? (i: number) => geo.index!.getX(i) : (i: number) => i;
  const byMaterial = new Map<number, number[]>();
  for (const g of geo.groups) {
    const list = byMaterial.get(g.materialIndex ?? 0) ?? [];
    for (let i = g.start; i < Math.min(count, g.start + g.count); i++) list.push(source(i));
    byMaterial.set(g.materialIndex ?? 0, list);
  }
  const total = [...byMaterial.values()].reduce((a, l) => a + l.length, 0);
  const index = new Uint32Array(total);
  geo.clearGroups();
  let offset = 0;
  for (const [material, list] of [...byMaterial.entries()].sort((a, b) => a[0] - b[0])) {
    index.set(list, offset);
    geo.addGroup(offset, list.length, material);
    offset += list.length;
  }
  geo.setIndex(new BufferAttribute(index, 1));
}

const prepared = new WeakMap<Group, { raw: number; centre: Vector3; minY: number }>();

/**
 * Measures a model once, posed by its move clip: the bind pose of these rigs is
 * not the animated size (the armatures carry their own scale), so measuring it
 * gives wrong sizes and offsets. Returns the scale and offset that make the
 * model `length` m long, centred, with its lowest point at y = 0.
 */
function prepare(source: Group, length: number, moveClip: string) {
  let info = prepared.get(source);
  if (!info) {
    source.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) consolidateGroups(mesh.geometry);
    });
    const clip = source.animations.find((c) => c.name === moveClip || c.name.endsWith(`|${moveClip}`));
    const mixer = new AnimationMixer(source);
    if (clip) {
      mixer.clipAction(clip).play();
      mixer.update(0);
    }
    source.updateMatrixWorld(true);
    const box = new Box3().setFromObject(source, true);
    mixer.stopAllAction();
    const size = box.getSize(new Vector3());
    info = { raw: Math.max(size.x, size.z) || 1, centre: box.getCenter(new Vector3()), minY: box.min.y };
    prepared.set(source, info);
  }
  const scale = length / info.raw;
  return { scale, offset: [-info.centre.x * scale, -info.minY * scale, -info.centre.z * scale] as [number, number, number] };
}

export interface AnimalHandle {
  /** Move/rotate this (feet at y = 0, facing +Z). */
  root: Group | null;
  /** Current speed (m/s): picks the move or idle clip and its playback rate. */
  setSpeed: (speed: number) => void;
}

/** One animated animal from the CC0 pack, recoloured, facing +Z with its feet at the origin. */
export const Animal = forwardRef<AnimalHandle, { kind: AnimalKind; seed: number; tint?: string; animateWithin?: number; visibleWithin?: number }>(function Animal(
  { kind, seed, tint, animateWithin = 110, visibleWithin = 500 },
  ref,
) {
  const spec = ANIMALS[kind];
  const source = useLoader(FBXLoader, spec.url);

  const built = useMemo(() => {
    const fit = prepare(source, spec.length, spec.move);
    const model = cloneSkinned(source) as Group;
    const materials: Material[] = [];
    const recolour = (m: Material) => {
      const hex = (tint && Object.keys(spec.colors).length === 1 ? tint : spec.colors[m.name]) ?? '#888888';
      const mat = new MeshStandardMaterial({ color: new Color(hex), roughness: 0.85, flatShading: true });
      materials.push(mat);
      return mat;
    };
    model.traverse((o) => {
      const mesh = o as SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolour) : recolour(mesh.material);
      // Birds fly high; their 25k-triangle mesh isn't worth a shadow pass.
      mesh.castShadow = kind !== 'eagle';
      mesh.frustumCulled = false;
    });
    return { model, materials, ...fit };
  }, [source, spec, tint, kind]);
  useEffect(() => () => built.materials.forEach((m) => m.dispose()), [built]);

  const anim = useMemo(() => {
    const mixer = new AnimationMixer(built.model);
    const find = (name: string) => source.animations.find((c) => c.name === name) ?? source.animations.find((c) => c.name.endsWith(`|${name}`));
    const move = find(spec.move);
    const idle = find(spec.idle) ?? move;
    const actions = { move: move ? mixer.clipAction(move) : null, idle: idle ? mixer.clipAction(idle) : null };
    for (const a of [actions.move, actions.idle]) a?.setLoop(LoopRepeat, Infinity);
    const start = actions.idle ?? actions.move;
    start?.play();
    mixer.setTime((seed % 89) / 31);
    return { mixer, actions, start };
  }, [built, source, spec, seed]);
  useEffect(
    () => () => {
      anim.mixer.stopAllAction();
    },
    [anim],
  );

  const root = useRef<Group>(null);
  const current = useRef<AnimationAction | null>(null);
  const setSpeed = (speed: number) => {
    const { actions } = anim;
    const moving = speed > 0.15 || actions.idle === actions.move;
    const next = moving ? actions.move : actions.idle;
    if (!next) return;
    if (moving) next.setEffectiveTimeScale(Math.min(2.5, Math.max(0.5, speed / spec.clipSpeed)));
    const playing = current.current ?? anim.start;
    if (next === playing) return;
    next.reset().fadeIn(0.25).play();
    playing?.fadeOut(0.25);
    current.current = next;
  };
  useImperativeHandle(ref, () => ({ root: root.current, setSpeed }));

  useEffect(() => {
    runtime.animalsMounted++;
    return () => {
      runtime.animalsMounted--;
    };
  }, []);

  const tmp = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, dt) => {
    const r = root.current;
    if (!r) return;
    r.getWorldPosition(tmp);
    const d = tmp.distanceTo(camera.position);
    r.visible = d < visibleWithin;
    if (d < animateWithin) anim.mixer.update(Math.min(dt, 0.05));
  });

  return (
    <group ref={root}>
      <group rotation-y={spec.yaw}>
        <group scale={built.scale} position={built.offset}>
          <primitive object={built.model} />
        </group>
      </group>
    </group>
  );
});
