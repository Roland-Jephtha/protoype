import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { LIFE } from '../../config/world';
import { useApp } from '../../state/appStore';
import { useSettings } from '../../state/settings';
import { Civilian, type CivilianHandle } from '../characters/Civilian';
import { runtime } from '../runtime';
import { generateCityLayout, mulberry32 } from '../world/cityLayout';
import { samplePath, type PathSampler } from '../vehicles/traffic';
import { Animal, type AnimalHandle, type AnimalKind } from './Animal';
import { stepPathWalker, walkerPose, type PathWalker, type PathWalkerOptions } from './behaviour';
import { LifeBoundary } from './Wildlife';


/**
 * Sidewalk loop around a block, `inset` m inside the kerb, swinging out at the
 * corners to pass outside the lamp posts (which stand 1 m in from each corner).
 */
function blockLoop(x: number, z: number, size: number, inset: number): PathSampler {
  const e = size / 2 - inset;
  const c = size / 2 - 0.35;
  const pts: [number, number][] = [
    [x - e, z - c + 1.2],
    [x - e, z + c - 1.2],
    [x - c, z + c],
    [x - c + 1.2, z + e],
    [x + c - 1.2, z + e],
    [x + c, z + c],
    [x + e, z + c - 1.2],
    [x + e, z - c + 1.2],
    [x + c, z - c],
    [x + c - 1.2, z - e],
    [x - c + 1.2, z - e],
    [x - c, z - c],
    [x - e, z - c + 1.2],
  ];
  return samplePath(pts);
}

interface Walker {
  path: PathSampler;
  w: PathWalker;
  opts: PathWalkerOptions;
}

/** City life: pedestrians walking the blocks, plus dogs and cats out and about. */
export function CityLife() {
  const quality = useSettings((s) => s.graphicsQuality);
  const layout = useMemo(() => generateCityLayout(), []);
  const sh = layout.sidewalkHeight;

  const sim = useMemo(() => {
    const rand = mulberry32(2024);
    const blocks = layout.blocks.filter((b) => b.kind !== 'plaza');
    const loops = blocks.map((b) => [blockLoop(b.x, b.z, b.size, 0.55), blockLoop(b.x, b.z, b.size, 0.95)]);
    const make = (count: number, cruise: () => number, opts: Omit<PathWalkerOptions, 'rand' | 'closed'>): Walker[] =>
      Array.from({ length: count }, () => {
        const pair = loops[Math.floor(rand() * loops.length)];
        const dir: 1 | -1 = rand() < 0.5 ? 1 : -1;
        // Keep right: each direction has its own line.
        const path = dir > 0 ? pair[0] : pair[1];
        return { path, w: { s: rand() * path.length, dir, speed: 0, cruise: cruise(), pause: 0, walkFor: 4 + rand() * 10 }, opts: { ...opts, closed: true, rand } };
      });
    const people = make(LIFE.pedestrians[quality], () => 1.1 + rand() * 0.5, { walkTime: 40, pauseTime: 4 });
    const pets: (Walker & { kind: AnimalKind; tint?: string })[] = [
      ...make(LIFE.pets[quality], () => 1.2 + rand() * 0.6, { walkTime: 10, pauseTime: 5, personalSpace: 2.2 }).map((w, i) => ({ ...w, kind: 'dog' as const, tint: ['#8a5a32', '#2b2623', '#d9c4a0', '#6e6a64'][i % 4] })),
      ...make(LIFE.pets[quality], () => 0.6 + rand() * 0.3, { walkTime: 5, pauseTime: 14, personalSpace: 2.5 }).map((w) => ({ ...w, kind: 'cat' as const })),
    ];
    return { people, pets };
  }, [layout, quality]);

  useEffect(
    () => () => {
      runtime.pedestriansWalking = 0;
    },
    [],
  );
  const people = useRef<(CivilianHandle | null)[]>([]);
  const pets = useRef<(AnimalHandle | null)[]>([]);
  useFrame((_, rawDt) => {
    if (useApp.getState().paused) return;
    const dt = Math.min(rawDt, 0.05);
    runtime.pedestriansWalking = sim.people.filter((p, i) => people.current[i]?.root && p.w.speed > 0.2).length;
    sim.people.forEach((p, i) => {
      stepPathWalker(p.w, p.path, dt, runtime.playerPosition, p.opts, sh);
      const h = people.current[i];
      if (!h?.root) return;
      const pose = walkerPose(p.w, p.path);
      h.root.position.set(pose.x, sh, pose.z);
      h.root.rotation.y = pose.angle;
      if (p.w.speed > 0.2) h.play('Walk_Loop', p.w.speed / 1.35);
      else h.play('Idle_Loop');
    });
    sim.pets.forEach((p, i) => {
      stepPathWalker(p.w, p.path, dt, runtime.playerPosition, p.opts, sh);
      const h = pets.current[i];
      if (!h?.root) return;
      const pose = walkerPose(p.w, p.path);
      h.root.position.set(pose.x, sh, pose.z);
      h.root.rotation.y = pose.angle;
      h.setSpeed(p.w.speed);
    });
  });

  return (
    <LifeBoundary>
      {sim.people.map((_, i) => (
        <Civilian key={i} seed={300 + i * 11} height={1.6 + ((i * 37) % 30) / 100} animateWithin={45} visibleWithin={140} castShadow={false} ref={(h) => void (people.current[i] = h)} />
      ))}
      {sim.pets.map((p, i) => (
        <Animal key={i} kind={p.kind} tint={p.tint} seed={i * 17} animateWithin={70} visibleWithin={250} ref={(h) => void (pets.current[i] = h)} />
      ))}
    </LifeBoundary>
  );
}

