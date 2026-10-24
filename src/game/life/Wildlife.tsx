import { useFrame } from '@react-three/fiber';
import { Component, useMemo, useRef, type ReactNode } from 'react';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { mulberry32 } from '../world/cityLayout';
import { samplePath, offsetPath } from '../vehicles/traffic';
import { Animal, type AnimalHandle, type AnimalKind } from './Animal';
import { circlerPose, stepPathWalker, stepWanderer, walkerPose, type Circler, type PathWalker, type Wanderer } from './behaviour';

/**
 * Ambient life and villains must never take the region down: a failed model
 * just isn't shown. No Suspense of its own, on purpose: loading models hold
 * the region's loading screen, so the world doesn't stutter right after it.
 */
export class LifeBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[life] animal/people models failed to load:', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface HerdDef {
  kind: AnimalKind;
  count: number;
  home: { x: number; z: number; radius: number };
  walkSpeed: number;
  runSpeed: number;
  fleeRadius: number;
}

/** A pack/herd wandering around a home area, scattering when the hero lands nearby. */
export function Herd({ def, seed, ground, walkable }: { def: HerdDef; seed: number; ground: (x: number, z: number) => number; walkable: (x: number, z: number) => boolean }) {
  const refs = useRef<(AnimalHandle | null)[]>([]);
  const sim = useMemo(() => {
    const rand = mulberry32(seed);
    const animals: Wanderer[] = [];
    for (let i = 0; i < def.count; i++) {
      let x = def.home.x;
      let z = def.home.z;
      for (let k = 0; k < 20; k++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * def.home.radius * 0.6;
        if (walkable(def.home.x + Math.sin(a) * r, def.home.z + Math.cos(a) * r)) {
          x = def.home.x + Math.sin(a) * r;
          z = def.home.z + Math.cos(a) * r;
          break;
        }
      }
      animals.push({ x, z, heading: rand() * 6.28, speed: 0, state: 'idle', timer: rand() * 4, tx: x, tz: z, home: def.home });
    }
    return { animals, opts: { walkSpeed: def.walkSpeed, runSpeed: def.runSpeed, fleeRadius: def.fleeRadius, walkable, groundY: ground, rand } };
  }, [def, seed, ground, walkable]);

  useFrame((_, rawDt) => {
    if (useApp.getState().paused) return;
    const dt = Math.min(rawDt, 0.05);
    sim.animals.forEach((a, i) => {
      stepWanderer(a, dt, runtime.playerPosition, sim.opts);
      const h = refs.current[i];
      if (!h?.root) return;
      h.root.position.set(a.x, ground(a.x, a.z), a.z);
      h.root.rotation.y = a.heading;
      h.setSpeed(a.speed);
    });
  });

  return (
    <>
      {sim.animals.map((_, i) => (
        <Animal key={i} kind={def.kind} seed={seed + i * 13} ref={(h) => void (refs.current[i] = h)} />
      ))}
    </>
  );
}

/** Birds of prey circling over a spot. */
export function Circlers({ birds, ground }: { birds: Circler[]; ground: (x: number, z: number) => number }) {
  const refs = useRef<(AnimalHandle | null)[]>([]);
  const clock = useRef(0);
  const groundAt = useMemo(() => birds.map((b) => ground(b.cx, b.cz)), [birds, ground]);
  useFrame((_, dt) => {
    if (useApp.getState().paused) return;
    clock.current += Math.min(dt, 0.05);
    birds.forEach((b, i) => {
      const h = refs.current[i];
      if (!h?.root) return;
      const p = circlerPose(b, clock.current);
      h.root.position.set(p.x, groundAt[i] + p.altitude, p.z);
      h.root.rotation.set(0, p.angle, p.bank, 'YXZ');
      h.setSpeed(Math.abs(b.rate) * b.radius);
    });
  });
  return (
    <>
      {birds.map((_, i) => (
        <Animal key={i} kind="eagle" seed={i * 7 + 3} visibleWithin={900} animateWithin={300} ref={(h) => void (refs.current[i] = h)} />
      ))}
    </>
  );
}

/** Fish patrolling a river, leaping clear of the water every few seconds. */
export function RiverFish({ river, count, waterY, seed }: { river: [number, number][]; count: number; waterY: (x: number, z: number) => number; seed: number }) {
  const refs = useRef<(AnimalHandle | null)[]>([]);
  const sim = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => {
      const path = samplePath(offsetPath(river, (rand() - 0.5) * 16));
      const walker: PathWalker = { s: rand() * path.length, dir: rand() < 0.5 ? 1 : -1, speed: 0, cruise: 1.5 + rand() * 2, pause: 0, walkFor: Infinity };
      return { path, walker, leap: rand() * 8, period: 5 + rand() * 6 };
    });
  }, [river, count, seed]);
  const rand = useMemo(() => mulberry32(seed + 1), [seed]);
  const away = useMemo(() => ({ x: 1e6, y: 0, z: 1e6 }), []);
  useFrame((_, rawDt) => {
    if (useApp.getState().paused) return;
    const dt = Math.min(rawDt, 0.05);
    sim.forEach((f, i) => {
      stepPathWalker(f.walker, f.path, dt, away, { closed: false, rand });
      f.leap = (f.leap + dt) % f.period;
      const h = refs.current[i];
      if (!h?.root) return;
      const p = walkerPose(f.walker, f.path);
      // 1.1 s leap arc up to 1.8 m above the surface; otherwise just under it.
      const k = f.leap / 1.1;
      const lift = k < 1 ? Math.sin(k * Math.PI) * 2.4 : 0;
      h.root.position.set(p.x, waterY(p.x, p.z) - 0.6 + lift, p.z);
      h.root.rotation.set(k < 1 ? -Math.cos(k * Math.PI) * 0.8 : 0, p.angle, 0, 'YXZ');
      h.setSpeed(f.walker.speed);
    });
  });
  return (
    <>
      {sim.map((_, i) => (
        <Animal key={i} kind="piranha" seed={i * 5 + 1} animateWithin={70} visibleWithin={160} ref={(h) => void (refs.current[i] = h)} />
      ))}
    </>
  );
}
