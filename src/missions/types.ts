import type { RegionId } from '../config/regions';

/** A place in the world a mission points at. */
export interface MissionTarget {
  region: RegionId;
  x: number;
  z: number;
  /** Shown next to the distance on the HUD / interaction prompt. */
  label: string;
}

export type ObjectiveDef =
  /** Travel to a region (e.g. "Fly north to Blackwood Forest"). `hint` marks the way in the current region. */
  | { id: string; type: 'reachRegion'; text: string; region: RegionId; hint?: MissionTarget }
  /** Get within `radius` metres of a spot. */
  | { id: string; type: 'reach'; text: string; target: MissionTarget; radius: number }
  /** Press Interact near each target (in any order). */
  | { id: string; type: 'interact'; text: string; targets: MissionTarget[]; radius: number; prompt: string; doneMessage?: string };

export interface MissionDef {
  id: string;
  chapter: string;
  title: string;
  /** Briefing shown before the mission starts. */
  briefing: string[];
  startRegion: RegionId;
  objectives: ObjectiveDef[];
  /** Shown on the mission-complete screen. */
  outro: string;
}

export interface MissionState {
  missionId: string;
  objectiveIndex: number;
  /** Interact objectives: which targets are done (by index). */
  done: boolean[];
  complete: boolean;
}

export interface MissionContext {
  region: RegionId;
  x: number;
  z: number;
  interactPressed: boolean;
}

export type MissionEvent =
  | { type: 'targetDone'; objectiveId: string; index: number; message?: string }
  | { type: 'objectiveComplete'; objectiveId: string }
  | { type: 'missionComplete' };
