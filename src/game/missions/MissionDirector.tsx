import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { AdditiveBlending, DoubleSide, type MeshBasicMaterial } from 'three';
import type { RegionId } from '../../config/regions';
import { input } from '../../input/InputManager';
import { MISSIONS } from '../../missions/missions';
import { activeTargets, availableInteraction, currentObjective, stepMission } from '../../missions/runner';
import type { MissionTarget } from '../../missions/types';
import { useApp } from '../../state/appStore';
import { Civilian } from '../characters/Civilian';
import { runtime } from '../runtime';

/**
 * In-world side of story mode: advances the active mission from the hero's
 * position and Interact presses, marks targets with light beams, and places
 * mission actors (the prologue survivors). Renders nothing in free roam.
 */
export function MissionDirector({ regionId, ground }: { regionId: RegionId; ground: (x: number, z: number) => number }) {
  const mode = useApp((s) => s.mode);
  const mission = useApp((s) => s.mission);
  const phase = useApp((s) => s.missionPhase);
  const def = mission ? MISSIONS[mission.missionId] : null;

  // Advance the mission ~20×/s.
  const tick = useRef(0);
  useFrame((_, dt) => {
    tick.current += dt;
    if (tick.current < 0.05) return;
    tick.current = 0;
    const app = useApp.getState();
    if (app.mode !== 'story' || app.missionPhase !== 'active' || !app.mission || app.paused || !app.regionReady) return;
    const d = MISSIONS[app.mission.missionId];
    const p = runtime.playerPosition;
    const ctx = { region: regionId, x: p.x, z: p.z };
    const near = availableInteraction(d, app.mission, ctx);
    const o = currentObjective(d, app.mission);
    app.setInteractPrompt(near && o?.type === 'interact' ? `${o.prompt} · ${near.target.label}` : null);
    const { state, events } = stepMission(d, app.mission, { ...ctx, interactPressed: input.consumePressed('interact') });
    if (state !== app.mission) app.setMission(state);
    for (const e of events) {
      if (e.type === 'targetDone' && e.message) app.showToast(e.message);
      if (e.type === 'objectiveComplete' && !state.complete) app.showToast('Objective complete');
      if (e.type === 'missionComplete') app.completeMission();
    }
  });

  if (mode !== 'story' || !def || !mission || phase === 'complete') return null;
  const targets = activeTargets(def, mission, regionId);
  return (
    <group>
      {targets.map((t, i) => (
        <Beacon key={`${t.label}-${t.x}-${t.z}-${i}`} target={t} y={ground(t.x, t.z)} />
      ))}
      {def.id === 'prologue' && regionId === 'forest' && <PrologueSurvivors ground={ground} />}
    </group>
  );
}

/** A tall, soft column of light that marks a mission target from far away. */
function Beacon({ target, y }: { target: MissionTarget; y: number }) {
  const material = useRef<MeshBasicMaterial>(null);
  const pulse = useRef(0);
  useFrame((_, dt) => {
    pulse.current += dt;
    if (material.current) material.current.opacity = 0.25 + Math.sin(pulse.current * 3) * 0.1;
  });
  const props = { color: '#ffd166', transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false } as const;
  return (
    <group position={[target.x, y, target.z]}>
      <mesh position-y={60}>
        <cylinderGeometry args={[1.6, 2.6, 120, 16, 1, true]} />
        <meshBasicMaterial ref={material} {...props} />
      </mesh>
      <mesh position-y={0.1} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[2.5, 3.4, 32]} />
        <meshBasicMaterial {...props} />
      </mesh>
    </group>
  );
}

/** Survivors crouched around the wreck until the hero helps them up. */
function PrologueSurvivors({ ground }: { ground: (x: number, z: number) => number }) {
  const mission = useApp((s) => s.mission);
  const def = MISSIONS.prologue;
  const rescueIndex = def.objectives.findIndex((o) => o.id === 'rescue');
  const rescue = def.objectives[rescueIndex];
  if (!mission || rescue.type !== 'interact') return null;
  const rescuedAll = mission.objectiveIndex > rescueIndex;
  return (
    <>
      {rescue.targets.map((t, i) => {
        const safe = rescuedAll || (mission.objectiveIndex === rescueIndex && mission.done[i]);
        return (
          <Civilian
            key={i}
            seed={101 + i * 17}
            position={[t.x, ground(t.x, t.z), t.z]}
            rotationY={i * 2.1}
            clip={safe ? 'Idle_Loop' : 'Crouch_Idle_Loop'}
          />
        );
      })}
    </>
  );
}
