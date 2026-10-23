import { CAMERA } from '../config/gameConfig';
import { DEBUG_TOGGLE_KEY, DEFAULT_KEY_BINDINGS, MOUSE_BINDINGS, MOVE_KEYS } from '../config/controls';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';
import { input } from './InputManager';

function isTextField(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/**
 * Attaches desktop keyboard + mouse handling. `lockTarget` is the element that
 * captures the pointer for mouse-look (the game canvas container).
 * Returns a cleanup function that removes every listener.
 */
export function attachKeyboardMouse(lockTarget: HTMLElement): () => void {
  const moveKeys = new Set<string>();
  let lastLockLoss = 0;

  const playing = () => {
    const s = useApp.getState();
    return s.screen === 'game' && !s.paused;
  };

  const updateMove = () => {
    const has = (codes: readonly string[]) => codes.some((c) => moveKeys.has(c));
    const x = (has(MOVE_KEYS.right) ? 1 : 0) - (has(MOVE_KEYS.left) ? 1 : 0);
    const y = (has(MOVE_KEYS.forward) ? 1 : 0) - (has(MOVE_KEYS.back) ? 1 : 0);
    const len = Math.hypot(x, y) || 1;
    input.setMove('keyboard', x / len, y / len);
  };

  const isMoveKey = (code: string) => Object.values(MOVE_KEYS).some((codes) => (codes as readonly string[]).includes(code));

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTextField(e.target)) return;
    if (e.code === DEBUG_TOGGLE_KEY) {
      e.preventDefault();
      const s = useSettings.getState();
      s.set('showDebug', !s.showDebug);
      return;
    }
    const action = DEFAULT_KEY_BINDINGS[e.code];
    if (action === 'pause') {
      if (e.repeat || useApp.getState().screen !== 'game') return;
      // The browser exits pointer lock on Escape; that already paused us.
      if (e.code === 'Escape' && performance.now() - lastLockLoss < 400) return;
      e.preventDefault();
      const app = useApp.getState();
      // In a pause sub-page, Escape steps back to the pause menu instead of resuming.
      if (app.paused && app.pauseView !== 'main') app.setPauseView('main');
      else app.togglePause();
      return;
    }
    if (!playing()) return;
    if (isMoveKey(e.code)) {
      moveKeys.add(e.code);
      updateMove();
      e.preventDefault();
    } else if (action) {
      e.preventDefault();
      if (!e.repeat) input.setButton('keyboard', action, true);
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (isMoveKey(e.code)) {
      moveKeys.delete(e.code);
      updateMove();
    }
    const action = DEFAULT_KEY_BINDINGS[e.code];
    if (action && action !== 'pause') input.setButton('keyboard', action, false);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== lockTarget || !playing()) return;
    const k = CAMERA.mouseSensitivity * useSettings.getState().cameraSensitivity;
    input.addLook(e.movementX * k, -e.movementY * k);
  };

  const onMouseDown = (e: MouseEvent) => {
    // Touch devices use the on-screen controls; never grab the pointer there.
    if (!playing() || useApp.getState().touchDetected) return;
    if (document.pointerLockElement !== lockTarget) {
      requestLock();
      return;
    }
    const action = MOUSE_BINDINGS[e.button];
    if (action) input.setButton('mouse', action, true);
  };

  const onMouseUp = (e: MouseEvent) => {
    const action = MOUSE_BINDINGS[e.button];
    if (action) input.setButton('mouse', action, false);
  };

  const requestLock = () => {
    try {
      const p = lockTarget.requestPointerLock() as unknown as Promise<void> | undefined;
      // Browsers reject re-locking shortly after an exit; the user can just click again.
      p?.catch?.(() => {});
    } catch {
      /* pointer lock unsupported */
    }
  };

  const onLockChange = () => {
    const locked = document.pointerLockElement === lockTarget;
    useApp.getState().setPointerLocked(locked);
    if (!locked) {
      lastLockLoss = performance.now();
      input.releaseSource('mouse');
      // Losing the lock mid-game (Escape, alt-tab) pauses rather than leaving a dead camera.
      if (playing() && !useApp.getState().touchDetected) useApp.getState().pause();
    }
  };

  const releaseEverything = () => {
    moveKeys.clear();
    input.releaseAll();
  };

  const onVisibility = () => {
    if (document.hidden) {
      releaseEverything();
      useApp.getState().pause();
    }
  };

  const onContextMenu = (e: Event) => e.preventDefault();

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseEverything);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMouseMove);
  lockTarget.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  lockTarget.addEventListener('contextmenu', onContextMenu);

  // Releasing input when the app pauses/unpauses keeps keys from sticking
  // (e.g. W held while opening the menu).
  const unsub = useApp.subscribe((s, prev) => {
    if (s.paused !== prev.paused || s.screen !== prev.screen) moveKeys.clear();
    if (s.paused && !prev.paused && document.pointerLockElement === lockTarget) document.exitPointerLock();
  });

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', releaseEverything);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('mousemove', onMouseMove);
    lockTarget.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    lockTarget.removeEventListener('contextmenu', onContextMenu);
    unsub();
    if (document.pointerLockElement === lockTarget) document.exitPointerLock();
    releaseEverything();
  };
}
