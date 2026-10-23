import { lazy, Suspense, useEffect } from 'react';
import { useApp } from './state/appStore';
import { useForcedLandscape } from './ui/orientation';
import { TitleScreen } from './ui/TitleScreen';

// The game chunk (three.js, Rapier WASM, world) loads only when play starts,
// so the title screen appears immediately.
const GameScreen = lazy(() => import('./ui/GameScreen').then((m) => ({ default: m.GameScreen })));

function GameLoading() {
  return (
    <div className="overlay loading-overlay">
      <div className="loading-spinner" />
      <p>Loading game engine…</p>
    </div>
  );
}

/**
 * Application shell: owns which screen is mounted. The 3D canvas only exists
 * on the game screen, so returning to the title disposes the renderer, physics
 * world and all GPU resources.
 */
export default function App() {
  const screen = useApp((s) => s.screen);
  const setTouchDetected = useApp((s) => s.setTouchDetected);
  const rotated = useForcedLandscape();

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === 'touch') setTouchDetected();
    };
    // iOS Safari pinch-zoom gestures bypass touch-action; block them in-game.
    const onGesture = (e: Event) => e.preventDefault();
    window.addEventListener('pointerdown', onPointer, { capture: true });
    document.addEventListener('gesturestart', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onPointer, { capture: true });
      document.removeEventListener('gesturestart', onGesture);
    };
  }, [setTouchDetected]);

  // On phones held upright the whole frame is rotated so the game stays horizontal.
  return (
    <div className={`app-frame${rotated ? ' rotated' : ''}`}>
      {screen === 'game' ? (
        <Suspense fallback={<GameLoading />}>
          <GameScreen />
        </Suspense>
      ) : (
        <TitleScreen />
      )}
    </div>
  );
}
