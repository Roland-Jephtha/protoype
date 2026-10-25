import { create } from 'zustand';
import type { RegionId, Side } from '../config/regions';
import { CAMPAIGN, MISSIONS } from '../missions/missions';
import type { MissionDef } from '../missions/types';
import { runtime } from '../game/runtime';
import { startMission } from '../missions/runner';
import { loadCompletedMissions, markMissionComplete } from '../missions/storyProgress';
import type { MissionState } from '../missions/types';
import { input } from '../input/InputManager';

export type Screen = 'title' | 'game';
export type GameMode = 'free' | 'story';
export type MissionPhase = 'intro' | 'active' | 'complete';
export type PauseView = 'main' | 'settings' | 'controls' | 'travel' | 'confirmQuit';

/** How the hero arrives in a region. */
export interface Arrival {
  /** Edge of the new region arrived through (uses its entry point); omitted = region spawn. */
  side?: Side;
  /** Arrive in flight (crossed the edge while flying). */
  flying?: boolean;
  /** Exact arrival point (mission starts, tests); overrides `side`. */
  at?: { x: number; z: number; facing: number };
}

/** The first campaign mission not completed yet (or the last one once all are done). */
export function nextMission(): MissionDef {
  const done = new Set(loadCompletedMissions());
  return CAMPAIGN.find((m) => !done.has(m.id)) ?? CAMPAIGN[CAMPAIGN.length - 1];
}

function resetMissionRuntime() {
  runtime.cinematic.t = 0;
  runtime.cinematic.active = false;
  runtime.defeatedVillains.length = 0;
}

/**
 * Low-frequency application state (screens, pause, menus, region travel).
 * Never written per frame — per-frame data lives in game/runtime.ts.
 */
interface AppState {
  screen: Screen;
  paused: boolean;
  pauseView: PauseView;
  /** True once any touch input has been seen (used by touchControls: 'auto'). */
  touchDetected: boolean;
  pointerLocked: boolean;
  /** Incremented to ask the player to respawn at the current checkpoint. */
  respawnToken: number;
  /** Hero is in flight mode (changes the touch buttons). Set only on transitions. */
  flying: boolean;

  /** Region currently loaded. */
  regionId: RegionId;
  /** Region being travelled to (loading overlay shows its name), or null. */
  pendingRegion: RegionId | null;
  /** False from the start of a load/travel until the region's world has mounted. */
  regionReady: boolean;
  arrival: Arrival | null;
  /** Bumped on every travel, so travelling within the current region still remounts it. */
  travelCount: number;

  mode: GameMode;
  mission: MissionState | null;
  missionPhase: MissionPhase | null;
  /** Context prompt when an interaction is in range (e.g. "Help Survivor"), else null. */
  interactPrompt: string | null;
  /** Lift / drop prompt near a car or while carrying one ("Lift car · E"). */
  liftPrompt: string | null;
  /** Short on-screen message (objective complete, survivor safe…). */
  toast: { id: number; text: string } | null;

  /** Start from the title screen. Story mode begins at the first incomplete mission's briefing. */
  /** Story mode plays `missionId`, or the next unfinished mission of the campaign. */
  startGame: (mode?: GameMode, missionId?: string) => void;
  /** From the mission-complete screen: go straight into another mission. */
  playMission: (missionId: string) => void;
  beginMission: () => void;
  setMission: (m: MissionState) => void;
  completeMission: () => void;
  restartMission: () => void;
  continueInFreeRoam: () => void;
  setInteractPrompt: (p: string | null) => void;
  setLiftPrompt: (p: string | null) => void;
  showToast: (text: string) => void;
  returnToTitle: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  setPauseView: (v: PauseView) => void;
  restartCheckpoint: () => void;
  setTouchDetected: () => void;
  setPointerLocked: (v: boolean) => void;
  setFlying: (v: boolean) => void;
  travelTo: (id: RegionId, arrival?: Arrival) => void;
  setRegionReady: () => void;
}

/** Delay before the new region mounts, so the loading overlay paints before terrain generation blocks. */
const TRAVEL_PAINT_DELAY_MS = 60;

export const useApp = create<AppState>((set, get) => ({
  screen: 'title',
  paused: false,
  pauseView: 'main',
  touchDetected: false,
  pointerLocked: false,
  respawnToken: 0,
  flying: false,
  regionId: 'metropolis',
  pendingRegion: null,
  regionReady: false,
  arrival: null,
  travelCount: 0,
  mode: 'free',
  mission: null,
  missionPhase: null,
  interactPrompt: null,
  liftPrompt: null,
  toast: null,

  startGame: (mode = 'free', missionId) => {
    input.releaseAll();
    if (mode === 'story') {
      const def = missionId ? MISSIONS[missionId] : nextMission();
      resetMissionRuntime();
      set({
        screen: 'game',
        mode,
        regionId: def.startRegion,
        mission: startMission(def),
        missionPhase: 'intro',
        paused: false,
        pauseView: 'main',
        regionReady: false,
        arrival: def.startAt ? { at: def.startAt } : null,
        travelCount: get().travelCount + 1,
        interactPrompt: null,
        toast: null,
      });
    } else {
      set({ screen: 'game', mode, mission: null, missionPhase: null, paused: false, pauseView: 'main', regionReady: false, arrival: null, interactPrompt: null, toast: null });
    }
  },
  beginMission: () => {
    input.releaseAll();
    runtime.cinematic.active = false;
    if (get().missionPhase === 'intro') set({ missionPhase: 'active' });
  },
  setMission: (mission) => set({ mission }),
  completeMission: () => {
    const m = get().mission;
    if (m) markMissionComplete(m.missionId);
    input.releaseAll();
    set({ missionPhase: 'complete', interactPrompt: null });
  },
  restartMission: () => {
    const m = get().mission;
    get().playMission(m ? m.missionId : CAMPAIGN[0].id);
  },
  playMission: (missionId) => {
    const def = MISSIONS[missionId];
    input.releaseAll();
    resetMissionRuntime();
    set({ mode: 'story', mission: startMission(def), missionPhase: 'intro', paused: false, pauseView: 'main', interactPrompt: null, toast: null, pendingRegion: null });
    // Always reload the start region: villains and drones reset for the mission.
    get().travelTo(def.startRegion, def.startAt ? { at: def.startAt } : {});
  },
  continueInFreeRoam: () => {
    input.releaseAll();
    set({ mode: 'free', mission: null, missionPhase: null, interactPrompt: null });
  },
  setLiftPrompt: (liftPrompt) => {
    if (get().liftPrompt !== liftPrompt) set({ liftPrompt });
  },
  setInteractPrompt: (interactPrompt) => {
    if (get().interactPrompt !== interactPrompt) set({ interactPrompt });
  },
  showToast: (text) => set((s) => ({ toast: { id: (s.toast?.id ?? 0) + 1, text } })),
  returnToTitle: () => {
    input.releaseAll();
    set({ screen: 'title', paused: false, pauseView: 'main', flying: false });
  },
  pause: () => {
    if (get().screen !== 'game' || get().paused) return;
    input.releaseAll();
    set({ paused: true, pauseView: 'main' });
  },
  resume: () => {
    input.releaseAll();
    set({ paused: false, pauseView: 'main' });
  },
  togglePause: () => (get().paused ? get().resume() : get().pause()),
  setPauseView: (pauseView) => set({ pauseView }),
  restartCheckpoint: () => {
    input.releaseAll();
    set((s) => ({ respawnToken: s.respawnToken + 1, paused: false, pauseView: 'main' }));
  },
  setTouchDetected: () => {
    if (!get().touchDetected) set({ touchDetected: true });
  },
  setPointerLocked: (pointerLocked) => set({ pointerLocked }),
  setFlying: (flying) => {
    if (get().flying !== flying) set({ flying });
  },
  travelTo: (id, arrival = {}) => {
    if (get().pendingRegion) return; // already travelling
    input.releaseAll();
    set({ pendingRegion: id, regionReady: false, paused: false, pauseView: 'main' });
    setTimeout(() => set((s) => ({ regionId: id, pendingRegion: null, arrival, flying: false, travelCount: s.travelCount + 1 })), TRAVEL_PAINT_DELAY_MS);
  },
  setRegionReady: () => {
    if (!get().regionReady && !get().pendingRegion) set({ regionReady: true });
  },
}));
