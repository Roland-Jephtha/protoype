import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, MeshStandardMaterial, type Group } from 'three';
import { createCapeGeometry } from './cape';
import type { GroundMotor } from './groundMovement';

/**
 * Temporary, original placeholder hero built from primitives with procedural
 * animation (walk/run cycle, jump/fall poses, landing squash, cape flow).
 *
 * It is deliberately generic (no licensed logo) and lives behind the same
 * props a GLB character will use, so swapping in a rigged model later only
 * touches this file + the asset manifest. Built facing +Z, feet at y = 0.
 */
export function PlaceholderHero({ motor }: { motor: GroundMotor }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const armL = useRef<Group>(null);
  const armR = useRef<Group>(null);
  const legL = useRef<Group>(null);
  const legR = useRef<Group>(null);
  const cape = useRef<Group>(null);
  const anim = useRef({ phase: 0, squash: 0, cape: 0.1, lean: 0 });

  const mats = useMemo(
    () => ({
      suit: new MeshStandardMaterial({ color: 0x1f4fb8, roughness: 0.45, metalness: 0.15 }),
      accent: new MeshStandardMaterial({ color: 0xc21f2b, roughness: 0.55 }),
      gold: new MeshStandardMaterial({ color: 0xe8b72f, roughness: 0.35, metalness: 0.5 }),
      skin: new MeshStandardMaterial({ color: 0xe0b394, roughness: 0.7 }),
      hair: new MeshStandardMaterial({ color: 0x15171c, roughness: 0.8 }),
      cape: new MeshStandardMaterial({ color: 0xb01826, roughness: 0.75, side: DoubleSide }),
    }),
    [],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  const capeGeometry = useMemo(() => createCapeGeometry(), []);
  useEffect(() => () => capeGeometry.dispose(), [capeGeometry]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const a = anim.current;
    const v = motor.velocity;
    const hSpeed = Math.hypot(v.x, v.z);
    const state = motor.state;
    const airborne = state === 'jump' || state === 'fall';

    if (root.current) root.current.rotation.y = motor.facingYaw;

    // Stride: phase advances with distance travelled; amplitude grows with speed.
    a.phase += dt * (hSpeed / 1.4) * Math.PI;
    const amp = airborne ? 0 : Math.min(0.9, hSpeed / 9);
    const swing = Math.sin(a.phase) * amp;

    const k = 1 - Math.exp(-14 * dt);
    const lerp = (cur: number, target: number) => cur + (target - cur) * k;

    let armTargetL = -swing * 0.9;
    let armTargetR = swing * 0.9;
    let legTargetL = swing;
    let legTargetR = -swing;
    let armSpread = 0.08;

    if (state === 'jump') {
      armTargetL = armTargetR = -0.6;
      legTargetL = 0.5;
      legTargetR = -0.15;
    } else if (state === 'fall') {
      armTargetL = armTargetR = -0.25;
      armSpread = 0.7;
      legTargetL = 0.2;
      legTargetR = -0.2;
    }

    if (armL.current && armR.current && legL.current && legR.current) {
      armL.current.rotation.x = lerp(armL.current.rotation.x, armTargetL);
      armR.current.rotation.x = lerp(armR.current.rotation.x, armTargetR);
      armL.current.rotation.z = lerp(armL.current.rotation.z, armSpread);
      armR.current.rotation.z = lerp(armR.current.rotation.z, -armSpread);
      legL.current.rotation.x = lerp(legL.current.rotation.x, legTargetL);
      legR.current.rotation.x = lerp(legR.current.rotation.x, legTargetR);
    }

    // Landing squash, sprint lean, running bob.
    const squashTarget = state === 'hardLand' ? 0.28 : state === 'land' ? 0.12 : 0;
    a.squash += (squashTarget - a.squash) * (1 - Math.exp(-(squashTarget > a.squash ? 40 : 10) * dt));
    a.lean = lerp(a.lean, state === 'sprint' ? 0.32 : Math.min(0.12, hSpeed * 0.012));
    if (body.current) {
      const bob = airborne ? 0 : Math.abs(Math.sin(a.phase)) * amp * 0.06;
      body.current.scale.set(1 + a.squash * 0.3, 1 - a.squash, 1 + a.squash * 0.3);
      body.current.position.y = bob;
      body.current.rotation.x = a.lean;
    }

    // Cape lifts with speed and when falling, with a little flutter.
    const capeTarget = Math.min(1.25, 0.08 + hSpeed * 0.07 + (state === 'fall' ? 0.5 : 0) + (state === 'jump' ? -0.05 : 0));
    a.cape += (capeTarget - a.cape) * (1 - Math.exp(-6 * dt));
    if (cape.current) {
      cape.current.rotation.x = a.cape + Math.sin(a.phase * 0.7 + performance.now() * 0.006) * 0.04 * (0.3 + hSpeed * 0.1);
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        {/* Legs (pivot at hips) */}
        {[
          [legL, 0.11],
          [legR, -0.11],
        ].map(([ref, x]) => (
          <group key={x as number} ref={ref as RefObject<Group>} position={[x as number, 0.95, 0]}>
            <mesh position={[0, -0.36, 0]} material={mats.suit} castShadow>
              <capsuleGeometry args={[0.085, 0.55, 4, 10]} />
            </mesh>
            <mesh position={[0, -0.78, 0.02]} material={mats.accent} castShadow>
              <capsuleGeometry args={[0.09, 0.2, 4, 10]} />
            </mesh>
          </group>
        ))}

        {/* Belt + torso */}
        <mesh position={[0, 0.98, 0]} material={mats.gold} castShadow>
          <cylinderGeometry args={[0.17, 0.17, 0.07, 14]} />
        </mesh>
        <mesh position={[0, 1.24, 0]} material={mats.suit} castShadow>
          <capsuleGeometry args={[0.2, 0.32, 4, 12]} />
        </mesh>
        <mesh position={[0, 1.36, 0.02]} scale={[1.25, 0.9, 0.85]} material={mats.suit} castShadow>
          <sphereGeometry args={[0.2, 14, 10]} />
        </mesh>
        {/* Generic chest emblem (original placeholder shape, not a licensed logo) */}
        <mesh position={[0, 1.34, 0.19]} rotation={[0, 0, Math.PI / 4]} material={mats.gold}>
          <boxGeometry args={[0.13, 0.13, 0.02]} />
        </mesh>
        <mesh position={[0, 1.34, 0.2]} rotation={[0, 0, Math.PI / 4]} material={mats.accent}>
          <boxGeometry args={[0.08, 0.08, 0.02]} />
        </mesh>

        {/* Arms (pivot at shoulders) */}
        {[
          [armL, 0.29],
          [armR, -0.29],
        ].map(([ref, x]) => (
          <group key={x as number} ref={ref as RefObject<Group>} position={[x as number, 1.46, 0]}>
            <mesh position={[0, -0.28, 0]} material={mats.suit} castShadow>
              <capsuleGeometry args={[0.065, 0.42, 4, 10]} />
            </mesh>
            <mesh position={[0, -0.56, 0]} material={mats.skin} castShadow>
              <sphereGeometry args={[0.065, 10, 8]} />
            </mesh>
          </group>
        ))}

        {/* Neck + head */}
        <mesh position={[0, 1.56, 0]} material={mats.skin}>
          <cylinderGeometry args={[0.06, 0.07, 0.1, 10]} />
        </mesh>
        <mesh position={[0, 1.7, 0]} scale={[0.9, 1.05, 0.95]} material={mats.skin} castShadow>
          <sphereGeometry args={[0.13, 16, 12]} />
        </mesh>
        <mesh position={[0, 1.76, -0.015]} scale={[0.95, 0.75, 1]} material={mats.hair}>
          <sphereGeometry args={[0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>

        {/* Cape (pivot across the shoulders, hangs behind) */}
        <group ref={cape} position={[0, 1.5, -0.17]}>
          <mesh geometry={capeGeometry} material={mats.cape} castShadow />
        </group>
      </group>
    </group>
  );
}
