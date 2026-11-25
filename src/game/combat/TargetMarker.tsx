import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';
import { runtime } from '../runtime';

/**
 * Lock-on marker: a ring at the feet of the enemy the next punch will hit
 * (white), turning gold and pulsing while a punch is aimed at it.
 */
export function TargetMarker() {
  const assets = useMemo(() => {
    const geo = new RingGeometry(0.85, 1, 40).rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, side: DoubleSide, depthWrite: false, fog: false });
    return { geo, mat };
  }, []);
  useEffect(
    () => () => {
      assets.geo.dispose();
      assets.mat.dispose();
    },
    [assets],
  );
  const ring = useRef<Mesh>(null);
  const clock = useRef(0);

  useFrame((_, dt) => {
    const m = ring.current;
    if (!m) return;
    clock.current += dt;
    const locked = runtime.combatTarget;
    const t = locked ?? runtime.combatCandidate;
    m.visible = !!t && t.alive;
    if (!t || !m.visible) return;
    // At the feet: the target's centre minus most of its radius (hit spheres sit at chest height).
    m.position.set(t.position.x, t.position.y - t.radius * 1.6, t.position.z);
    const pulse = locked ? 1 + Math.sin(clock.current * 18) * 0.08 : 1;
    m.scale.setScalar(Math.max(0.8, t.radius * 1.1) * pulse);
    const mat = m.material as MeshBasicMaterial;
    mat.color.set(locked ? '#ffcc33' : '#ffffff');
    mat.opacity = locked ? 0.9 : 0.55;
  });

  return <mesh ref={ring} geometry={assets.geo} material={assets.mat} visible={false} frustumCulled={false} renderOrder={4} />;
}
