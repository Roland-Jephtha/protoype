import { useCallback, useEffect, useRef } from 'react';
import { REGIONS } from '../config/regions';
import { GameCanvas } from '../game/GameCanvas';
import { runtime } from '../game/runtime';
import { input } from '../input/InputManager';
import { attachKeyboardMouse } from '../input/keyboardMouse';
import { useApp } from '../state/appStore';
import { useSettings } from '../state/settings';
import { DebugOverlay } from './DebugOverlay';
import { Hud } from './Hud';
import { OrientationPrompt } from './OrientationPrompt';
import { PauseMenu } from './PauseMenu';
import { TouchControls } from './touch/TouchControls';
import { useTouchControlsVisible } from './touch/useTouchControlsVisible';

/** In-game shell: 3D canvas + HUD + touch controls + pause menu + diagnostics. */
export function GameScreen() {
  const rootRef = useRef<HTMLDivElement>(null);
  const ready = useApp((s) => s.regionReady);
  const pendingRegion = useApp((s) => s.pendingRegion);
  const regionId = useApp((s) => s.regionId);
  const paused = useApp((s) => s.paused);
  const resume = useApp((s) => s.resume);
  const showDebug = useSettings((s) => s.showDebug);
  const touchUi = useTouchControlsVisible();
  const forceLandscape = useSettings((s) => s.forceLandscape);

  useEffect(() => {
    if (!rootRef.current) return;
    return attachKeyboardMouse(rootRef.current);
  }, []);

  // Automated smoke tests (scripts/smoke.mjs) read live state via ?test.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('test')) return;
    (window as unknown as { __krypton?: unknown }).__krypton = {
      runtime,
      input,
      app: useApp,
      get ready() {
        return useApp.getState().regionReady;
      },
    };
  }, []);

  const onResume = useCallback(() => {
    resume();
    // Still inside the click gesture, so the browser allows re-capturing the mouse.
    if (!useApp.getState().touchDetected && rootRef.current) {
      try {
        (rootRef.current.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
      } catch {
        /* unsupported */
      }
    }
  }, [resume]);

  const loadingName = REGIONS[pendingRegion ?? regionId].name;

  return (
    <div ref={rootRef} className="game-root">
      <GameCanvas />
      {!ready && (
        <div className="overlay loading-overlay">
          <div className="loading-spinner" />
          <p>{pendingRegion ? `Travelling to ${loadingName}…` : `Loading ${loadingName}…`}</p>
        </div>
      )}
      {ready && !paused && <Hud touchUi={touchUi} />}
      {ready && !paused && touchUi && <TouchControls />}
      {ready && touchUi && !forceLandscape && <OrientationPrompt />}
      {paused && <PauseMenu onResume={onResume} />}
      {showDebug && <DebugOverlay />}
    </div>
  );
}
