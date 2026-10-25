import type { DronePatrol } from '../config/combat';
import type { RegionId } from '../config/regions';
import type { VillainId } from '../config/villains';

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
  | { id: string; type: 'interact'; text: string; targets: MissionTarget[]; radius: number; prompt: string; doneMessage?: string }
  /** Beat a villain. `target` marks where it waits. */
  | { id: string; type: 'defeat'; text: string; villain: VillainId; target: MissionTarget }
  /** Destroy `count` drones (counted from when the objective starts). */
  | { id: string; type: 'destroy'; text: string; count: number; target: MissionTarget };

/** In-engine intro: the camera sweeps over `focus` then comes down behind the hero; lines play as subtitles. */
export interface MissionIntro {
  focus: { x: number; z: number };
  lines: string[];
}

export interface MissionDef {
  id: string;
  chapter: string;
  title: string;
  /** Briefing shown before the mission starts. */
  briefing: string[];
  startRegion: RegionId;
  /** Where the hero starts (else the region's spawn). */
  startAt?: { x: number; z: number; facing: number };
  /** Villains present in this mission (story mode spawns only these). */
  villains?: VillainId[];
  /** Drone patrols for this mission (story mode replaces the free-roam patrols). */
  drones?: DronePatrol[];
  intro: MissionIntro;
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
  /** Destroy objectives: the drone count when the objective started. */
  baseline?: number;
}

export interface MissionContext {
  region: RegionId;
  x: number;
  z: number;
  interactPressed: boolean;
  /** Villains beaten so far in this mission. */
  defeated?: readonly string[];
  /** Total drones destroyed (any running counter; compared with the objective's baseline). */
  dronesDestroyed?: number;
}

export type MissionEvent =
  | { type: 'targetDone'; objectiveId: string; index: number; message?: string }
  | { type: 'objectiveComplete'; objectiveId: string }
  | { type: 'missionComplete' };
