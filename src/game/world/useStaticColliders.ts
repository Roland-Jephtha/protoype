import type RAPIER from '@dimforge/rapier3d-compat';
import { useRapier } from '@react-three/rapier';
import { useEffect, useRef } from 'react';

/**
 * Creates many static colliders imperatively on one fixed body — far cheaper
 * than thousands of <Collider> React elements (trees, rocks, terrain).
 * Removed again on unmount (region change, return to title).
 *
 * `build` receives the Rapier namespace and returns collider descriptions; it
 * re-runs only when `deps` change. Returns the colliders, in description order
 * (so a lifted prop can switch its own off).
 */
export function useStaticColliders(build: (rapier: typeof RAPIER) => RAPIER.ColliderDesc[], deps: unknown[]) {
  const { world, rapier } = useRapier();
  const colliders = useRef<RAPIER.Collider[]>([]);
  useEffect(() => {
    const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
    colliders.current = build(rapier).map((desc) => world.createCollider(desc, body));
    return () => {
      colliders.current = [];
      // When a whole region unmounts, the physics world is torn down before this
      // cleanup runs; removing a body it no longer has makes Rapier panic.
      // (Same guard @react-three/rapier uses for its own bodies.)
      if (world.getRigidBody(body.handle)) world.removeRigidBody(body); // also removes its colliders
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, rapier, ...deps]);
  return colliders;
}
