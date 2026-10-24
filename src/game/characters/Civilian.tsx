import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { AnimationMixer, Box3, LoopRepeat, Vector3, type AnimationAction, type Group, type Mesh } from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { HERO_MODELS } from '../../config/assets';
import { createOutfitMaterial, prepareOutfitSlots, randomPalette, type Palette } from './outfit';

// Pedestrians and survivors share one model: fetch it once at startup.
useGLTF.preload(HERO_MODELS.ual.url);

export interface CivilianHandle {
  /** The root you move/rotate (feet at y = 0, facing +Z). */
  root: Group | null;
  /** Cross-fade to a clip by exact name (e.g. 'Walk_Loop'); speed scales playback. */
  play: (clip: string, speed?: number) => void;
}

/**
 * A civilian built from the shared CC0 mannequin with their own outfit colours.
 * Position it via props (static people) or through the ref's `root` (walkers).
 */
export const Civilian = forwardRef<
  CivilianHandle,
  {
    seed: number;
    palette?: Palette;
    clip?: string;
    clipSpeed?: number;
    position?: [number, number, number];
    rotationY?: number;
    height?: number;
    /** Stop animating when farther than this from the camera (cheap crowds). */
    animateWithin?: number;
    /** Hide entirely beyond this distance. */
    visibleWithin?: number;
    castShadow?: boolean;
  }
>(function Civilian({ seed, palette, clip = 'Idle_Loop', clipSpeed = 1, position = [0, 0, 0], rotationY = 0, height = 1.75, animateWithin = 120, visibleWithin = Infinity, castShadow = true }, ref) {
  const gltf = useGLTF(HERO_MODELS.ual.url);
  const root = useRef<Group>(null);

  const built = useMemo(() => {
    const model = cloneSkinned(gltf.scene);
    prepareOutfitSlots(model);
    const material = createOutfitMaterial(palette ?? randomPalette(seed));
    model.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        mesh.material = material;
        // Crowds: no shadows (a big saving with many skinned meshes).
        mesh.castShadow = castShadow;
        mesh.frustumCulled = false;
      }
    });
    const box = new Box3().setFromObject(model, true);
    const size = box.getSize(new Vector3());
    const scale = height / (size.y || 1);
    return { model, material, scale, offsetY: -box.min.y * scale };
  }, [gltf, palette, seed, height, castShadow]);
  useEffect(() => () => built.material.dispose(), [built]);

  const anim = useMemo(() => {
    const mixer = new AnimationMixer(built.model);
    const actions = new Map<string, AnimationAction>();
    for (const c of gltf.animations) actions.set(c.name, mixer.clipAction(c));
    return { mixer, actions, current: null as AnimationAction | null };
  }, [built, gltf]);
  useEffect(
    () => () => {
      anim.mixer.stopAllAction();
    },
    [anim],
  );

  const animRef = useRef(anim);
  useEffect(() => {
    animRef.current = anim;
  }, [anim]);

  const play = (name: string, speed = 1) => {
    const a = animRef.current;
    const next = a.actions.get(name) ?? a.actions.get('Idle_Loop');
    if (!next) return;
    next.setEffectiveTimeScale(speed);
    if (next === a.current) return;
    next.reset().setLoop(LoopRepeat, Infinity).fadeIn(0.25).play();
    a.current?.fadeOut(0.25);
    a.current = next;
  };

  useImperativeHandle(ref, () => ({ root: root.current, play }));

  useEffect(() => {
    play(clip, clipSpeed);
    // Different start phase per person so crowds don't move in lockstep.
    animRef.current.mixer.setTime((seed % 97) / 37);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, clipSpeed, anim]);

  const tmp = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, dt) => {
    if (!root.current) return;
    root.current.getWorldPosition(tmp);
    const d = tmp.distanceTo(camera.position);
    root.current.visible = d < visibleWithin;
    // Hidden: skip its whole skeleton in the per-frame matrix update.
    root.current.matrixWorldAutoUpdate = root.current.visible;
    if (d < animateWithin) animRef.current.mixer.update(Math.min(dt, 0.05));
  });

  return (
    <group ref={root} position={position} rotation-y={rotationY}>
      <group scale={built.scale} position-y={built.offsetY}>
        <primitive object={built.model} />
      </group>
    </group>
  );
});
