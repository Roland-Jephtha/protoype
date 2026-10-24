import { create } from 'zustand';
import { input } from '../input/InputManager';

export type Screen = 'title' | 'game';
export type PauseView = 'main' | 'settings' | 'controls' | 'confirmQuit';

/**
 * Low-frequency application state (screens, pause, menus).
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

  startGame: () => void;
  returnToTitle: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  setPauseView: (v: PauseView) => void;
  restartCheckpoint: () => void;
  setTouchDetected: () => void;
  setPointerLocked: (v: boolean) => void;
  setFlying: (v: boolean) => void;
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'title',
  paused: false,
  pauseView: 'main',
  touchDetected: false,
  pointerLocked: false,
  respawnToken: 0,
  flying: false,

  startGame: () => {
    input.releaseAll();
    set({ screen: 'game', paused: false, pauseView: 'main' });
  },
  returnToTitle: () => {
    input.releaseAll();
    set({ screen: 'title', paused: false, pauseView: 'main' });
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
}));
