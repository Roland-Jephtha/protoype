import { create } from 'zustand';
import type { RegionId, Side } from '../config/regions';
import { MISSIONS } from '../missions/missions';
import { startMission } from '../missions/runner';
import { markMissionComplete } from '../missions/storyProgress';
import type { MissionState } from '../missions/types';
import { input } from '../input/InputManager';

export type Screen = 'title' | 'game';
export type GameMode = 'free' | 'story';
export type MissionPhase = 'briefing' | 'active' | 'complete';
export type PauseView = 'main' | 'settings' | 'controls' | 'travel' | 'confirmQuit';

/** How the hero arrives in a region. */
export interface Arrival {
  /** Edge of the new region arrived through (uses its entry point); omitted = region spawn. */
  side?: Side;
  /** Arrive in flight (crossed the edge while flying). */
  flying?: boolean;
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

  mode: GameMode;
  mission: MissionState | null;
  missionPhase: MissionPhase | null;
  /** Context prompt when an interaction is in range (e.g. "Help Survivor"), else null. */
  interactPrompt: string | null;
  /** Short on-screen message (objective complete, survivor safe…). */
  toast: { id: number; text: string } | null;

  /** Start from the title screen. Story mode begins at the first incomplete mission's briefing. */
  startGame: (mode?: GameMode) => void;
  beginMission: () => void;
  setMission: (m: MissionState) => void;
  completeMission: () => void;
  restartMission: () => void;
  continueInFreeRoam: () => void;
  setInteractPrompt: (p: string | null) => void;
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
  mode: 'free',
  mission: null,
  missionPhase: null,
  interactPrompt: null,
  toast: null,

  startGame: (mode = 'free') => {
    input.releaseAll();
    if (mode === 'story') {
      const def = MISSIONS.prologue;
      set({
        screen: 'game',
        mode,
        regionId: def.startRegion,
        mission: startMission(def),
        missionPhase: 'briefing',
        paused: false,
        pauseView: 'main',
        regionReady: false,
        arrival: null,
        interactPrompt: null,
        toast: null,
      });
    } else {
      set({ screen: 'game', mode, mission: null, missionPhase: null, paused: false, pauseView: 'main', regionReady: false, arrival: null, interactPrompt: null, toast: null });
    }
  },
  beginMission: () => {
    input.releaseAll();
    set({ missionPhase: 'active' });
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
    const def = m ? MISSIONS[m.missionId] : MISSIONS.prologue;
    input.releaseAll();
    set({ mission: startMission(def), missionPhase: 'briefing', paused: false, pauseView: 'main', interactPrompt: null, toast: null });
    if (get().regionId !== def.startRegion) get().travelTo(def.startRegion);
    else set((s) => ({ respawnToken: s.respawnToken + 1 }));
  },
  continueInFreeRoam: () => {
    input.releaseAll();
    set({ mode: 'free', mission: null, missionPhase: null, interactPrompt: null });
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
    setTimeout(() => set({ regionId: id, pendingRegion: null, arrival, flying: false }), TRAVEL_PAINT_DELAY_MS);
  },
  setRegionReady: () => {
    if (!get().regionReady && !get().pendingRegion) set({ regionReady: true });
  },
}));
