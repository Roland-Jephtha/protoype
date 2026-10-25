import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { REGIONS, type RegionId } from '../../config/regions';
import { MISSIONS } from '../../missions/missions';
import { useApp } from '../../state/appStore';
import { runtime } from '../runtime';
import { buildIntro, introLength, sampleIntro, type V3 } from './intro';

/**
 * Plays the mission intro: drives the camera along the intro shots while the
 * mission is in its intro phase (the world is frozen), then starts the
 * mission. Runs after the gameplay camera so it overrides it.
 */
export function CinematicCamera({ regionId, ground }: { regionId: RegionId; ground: (x: number, z: number) => number }) {
  const mission = useApp((s) => s.mission);
  const phase = useApp((s) => s.missionPhase);
  const shots = useMemo(() => {
    if (!mission) return null;
    const def = MISSIONS[mission.missionId];
    if (def.startRegion !== regionId) return null;
    return buildIntro(def.intro.focus, def.startAt ?? REGIONS[regionId].spawn, ground);
  }, [mission, regionId, ground]);
  const tmp = useRef({ pos: { x: 0, y: 0, z: 0 } as V3, look: { x: 0, y: 0, z: 0 } as V3 });

  useFrame(({ camera }, dt) => {
    const c = runtime.cinematic;
    if (phase !== 'intro' || !shots || !useApp.getState().regionReady) {
      c.active = false;
      return;
    }
    if (useApp.getState().paused) return;
    c.active = true;
    c.length = introLength(shots);
    c.t += Math.min(dt, 0.05);
    const { pos, look } = tmp.current;
    sampleIntro(shots, c.t, pos, look);
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(look.x, look.y, look.z);
    if (c.t >= c.length) {
      c.active = false;
      useApp.getState().beginMission();
    }
  }, -29);

  return null;
}
