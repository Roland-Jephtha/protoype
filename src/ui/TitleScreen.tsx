import { useState } from 'react';
import { loadCompletedMissions } from '../missions/storyProgress';
import { useApp, type GameMode } from '../state/appStore';
import { tryLockLandscape } from './orientation';
import { ControlsReference } from './ControlsReference';
import { CreditsPanel } from './CreditsPanel';
import { SettingsPanel } from './SettingsPanel';

type View = 'main' | 'settings' | 'controls' | 'credits';

/**
 * Phase 1 title screen. Only lists options that work today; Continue / Load /
 * New Game / Cinematics / Credits arrive with saves (Phase 7) and the story
 * slice (Phase 8).
 */
export function TitleScreen() {
  const [view, setView] = useState<View>('main');
  const startGame = useApp((s) => s.startGame);
  const touchDetected = useApp((s) => s.touchDetected);

  const prologueDone = loadCompletedMissions().includes('prologue');
  const play = (mode: GameMode) => {
    // Phones: fullscreen + landscape lock where supported (must run in the tap gesture).
    if (touchDetected || window.matchMedia('(pointer: coarse)').matches) void tryLockLandscape();
    startGame(mode);
  };

  return (
    <div className="title-screen">
      <div className="title-skyline" aria-hidden="true" />
      <div className="title-vignette" aria-hidden="true" />
      {view === 'main' && (
        <div className="title-content">
          <p className="title-kicker">Project Krypton</p>
          <h1 className="title-logo">
            Shadow over <span>Metropolis</span>
          </h1>
          <p className="title-build">Prototype · city, desert, forest · story mode prologue</p>
          <nav className="menu-list title-menu">
            <button type="button" className="menu-btn primary" onClick={() => play('story')} autoFocus>
              Story mode
              <span className="menu-sub">{prologueDone ? 'Prologue complete ✓ — replay' : 'Prologue: The Night the Lights Went Out'}</span>
            </button>
            <button type="button" className="menu-btn" onClick={() => play('free')}>
              Free roam
              <span className="menu-sub">City, desert and forest — no objectives</span>
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('settings')}>
              Settings
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('controls')}>
              Controls
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('credits')}>
              Credits
            </button>
          </nav>
          <p className="title-legal">Non-commercial fan prototype. Not affiliated with or endorsed by DC or Warner Bros.</p>
        </div>
      )}
      {view === 'settings' && (
        <div className="title-panel-wrap">
          <SettingsPanel onBack={() => setView('main')} />
        </div>
      )}
      {view === 'credits' && (
        <div className="title-panel-wrap">
          <CreditsPanel onBack={() => setView('main')} />
        </div>
      )}
      {view === 'controls' && (
        <div className="title-panel-wrap">
          <ControlsReference onBack={() => setView('main')} />
        </div>
      )}
    </div>
  );
}
