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
  /** Height (m above y = 0) for targets off the ground, e.g. on a rooftop. */
  y?: number;
}

/** Where the hero restarts from at a checkpoint. */
export interface Checkpoint {
  region: RegionId;
  x: number;
  z: number;
  facing: number;
}

/**
 * Any objective may be a checkpoint (reaching it saves progress and moves the
 * respawn point) and may have a time limit (seconds; the mission fails when it runs out).
 */
type WithCheckpoint<T> = T & { checkpoint?: Checkpoint; timeLimit?: number };

export type ObjectiveDef = WithCheckpoint<ObjectiveBase>;

type ObjectiveBase =
  /** Travel to a region (e.g. "Fly north to Blackwood Forest"). `hint` marks the way in the current region. */
  | { id: string; type: 'reachRegion'; text: string; region: RegionId; hint?: MissionTarget }
  /** Get within `radius` metres of a spot. */
  | { id: string; type: 'reach'; text: string; target: MissionTarget; radius: number }
  /** Press Interact near each target (in any order). */
  | { id: string; type: 'interact'; text: string; targets: MissionTarget[]; radius: number; prompt: string; doneMessage?: string }
  /** Beat a villain. `target` marks where it waits. */
  | { id: string; type: 'defeat'; text: string; villain: VillainId; target: MissionTarget }
  /** Destroy `count` drones (counted from when the objective starts). */
  | { id: string; type: 'destroy'; text: string; count: number; target: MissionTarget }
  /** Done when a world actor raises `flag` (e.g. the runaway bus is stopped). */
  | { id: string; type: 'flag'; text: string; flag: string; actor: MissionActor; target: MissionTarget }
  /** Pick each person up (Interact) and bring them to `dropZone`. */
  | { id: string; type: 'deliver'; text: string; pickups: MissionTarget[]; dropZone: MissionTarget; radius: number; dropRadius: number; prompt: string; doneMessage?: string }
  /** Put out every fire (super or freeze breath). */
  | { id: string; type: 'extinguish'; text: string; fires: (MissionTarget & { y: number })[] };

/** Scripted world actors a `flag` objective can use. */
export type MissionActor = { kind: 'runawayBus'; route: [number, number][]; speed: number };

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
  /** Objective index of the last checkpoint reached (0 = mission start). */
  checkpoint: number;
  /** Seconds spent on the current objective (time limits). */
  objectiveTime?: number;
  /** Deliver objectives: the pickup being carried. */
  carrying?: number;
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
  /** Hero feet height (rooftop pickups). */
  y?: number;
  /** Seconds since the last step (time limits). */
  dt?: number;
  /** Flags raised by mission actors. */
  flags?: ReadonlySet<string>;
  /** Fires of the current extinguish objective that are out. */
  firesOut?: number;
}

export type MissionEvent =
  | { type: 'targetDone'; objectiveId: string; index: number; message?: string }
  | { type: 'objectiveComplete'; objectiveId: string }
  | { type: 'checkpoint'; index: number }
  | { type: 'pickedUp'; objectiveId: string; index: number }
  | { type: 'failed'; reason: string }
  | { type: 'missionComplete' };
