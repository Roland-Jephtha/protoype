import { RigidBody } from '@react-three/rapier';

/**
 * Movement test course in the spawn plaza: graded crates (auto-step, jump
 * heights), stairs, a ramp and a tall platform for hard-landing tests.
 * Every mesh gets an automatic cuboid collider from its geometry.
 */
export function TrainingPlaza({ sidewalkHeight: sh }: { sidewalkHeight: number }) {
  const steps = Array.from({ length: 8 }, (_, i) => i);
  return (
    <RigidBody type="fixed" colliders="cuboid">
      {/* Graded crates: 0.4 m (auto-step), 1 m, 2 m, 3.5 m (needs a full jump). */}
      {[0.4, 1, 2, 3.5].map((h, i) => (
        <mesh key={h} position={[9, sh + h / 2, 6 - i * 4]} castShadow receiveShadow>
          <boxGeometry args={[2.5, h, 2.5]} />
          <meshStandardMaterial color={i % 2 ? 0x9a6b3c : 0xb27d45} roughness={0.85} />
        </mesh>
      ))}

      {/* Stairs (0.4 m rise) up to a 3.2 m platform. */}
      {steps.map((i) => (
        <mesh key={i} position={[-11, sh + 0.2 * (i + 1), 8 - i * 0.7]} castShadow receiveShadow>
          <boxGeometry args={[4, 0.4 * (i + 1), 0.7]} />
          <meshStandardMaterial color={0x6f747b} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[-11, sh + 1.6, -0.25]} castShadow receiveShadow>
        <boxGeometry args={[6, 3.2, 6]} />
        <meshStandardMaterial color={0x5c6168} roughness={0.9} />
      </mesh>

      {/* Ramp: ~17° incline. */}
      <mesh position={[0, sh + 1.1, -12]} rotation={[0.3, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[5, 0.4, 14]} />
        <meshStandardMaterial color={0x7c8189} roughness={0.9} />
      </mesh>

      {/* Tall pillar: jump-off point for hard landings. */}
      <mesh position={[-11, sh + 6, -9]} castShadow receiveShadow>
        <boxGeometry args={[3, 12, 3]} />
        <meshStandardMaterial color={0x4a5059} roughness={0.9} />
      </mesh>
      {/* Stepping blocks from the platform to the pillar. */}
      {[4.6, 6.4, 8.2, 10].map((h, i) => (
        <mesh key={h} position={[-7.5 + (i % 2) * 1.5, sh + h / 2, -4.5 - i * 1.4]} castShadow receiveShadow>
          <boxGeometry args={[1.6, h, 1.4]} />
          <meshStandardMaterial color={0x8c6a4a} roughness={0.85} />
        </mesh>
      ))}
    </RigidBody>
  );
}
