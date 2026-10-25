import { useState } from 'react';
import { CAMPAIGN } from '../missions/missions';
import { loadCompletedMissions } from '../missions/storyProgress';
import { nextMission, useApp, type GameMode } from '../state/appStore';
import { tryLockLandscape } from './orientation';
import { ControlsReference } from './ControlsReference';
import { CreditsPanel } from './CreditsPanel';
import { SettingsPanel } from './SettingsPanel';
import { promptInstall, useInstallState } from './install';
import { useSaves } from '../save/saveStore';

type View = 'main' | 'settings' | 'controls' | 'credits' | 'chapters' | 'saves';

/**
 * Phase 1 title screen. Only lists options that work today; Continue / Load /
 * New Game / Cinematics / Credits arrive with saves (Phase 7) and the story
 * slice (Phase 8).
 */
export function TitleScreen() {
  const [view, setView] = useState<View>('main');
  const startGame = useApp((s) => s.startGame);
  const touchDetected = useApp((s) => s.touchDetected);
  const install = useInstallState();
  // Re-render when the save slots finish loading or change.
  const save = useSaves((s) => s.slots[s.active]);
  const slots = useSaves((s) => s.slots);
  const activeSlot = useSaves((s) => s.active);
  const saves = useSaves.getState();
  const [confirmSlot, setConfirmSlot] = useState<number | null>(null);

  const completed = loadCompletedMissions();
  const next = nextMission();
  const allDone = CAMPAIGN.every((m) => completed.includes(m.id));
  const play = (mode: GameMode, missionId?: string) => {
    // Phones: fullscreen + landscape lock where supported (must run in the tap gesture).
    if (touchDetected || window.matchMedia('(pointer: coarse)').matches) void tryLockLandscape();
    startGame(mode, missionId);
  };

  return (
    <div className="title-screen">
      <div className="title-skyline" aria-hidden="true" />
      <div className="title-vignette" aria-hidden="true" />
      {view === 'main' && (
        <div className="title-content">
          <div className="title-head">
            <p className="title-kicker">Project Krypton</p>
            <h1 className="title-logo">
              Shadow over <span>Metropolis</span>
            </h1>
            <p className="title-build">Campaign · {CAMPAIGN.length} missions · Doomsday, Zod, Darkseid and more</p>
            <p className="title-legal">Non-commercial fan prototype. Not affiliated with or endorsed by DC or Warner Bros.</p>
          </div>
          <div className="title-side">
          <nav className="menu-list title-menu">
            <button type="button" className="menu-btn primary" onClick={() => play('story')} autoFocus>
              {completed.length || save.current ? 'Continue' : 'Play'}
              <span className="menu-sub">
                {allDone ? 'Campaign complete ✓ — replay the finale' : `${next.chapter}: ${next.title}`}
                {save.current?.missionId === next.id && save.current.checkpoint > 0 ? ' · from checkpoint' : ''}
              </span>
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('chapters')}>
              Chapters
              <span className="menu-sub">
                {completed.filter((id) => CAMPAIGN.some((m) => m.id === id)).length}/{CAMPAIGN.length} complete
              </span>
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('saves')}>
              Saves
              <span className="menu-sub">Slot {activeSlot + 1} · 3 slots</span>
            </button>
            <button type="button" className="menu-btn" onClick={() => play('free')}>
              Free roam
              <span className="menu-sub">Explore the city, desert and forest — fight villains at their lairs</span>
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
          {install === 'available' && (
            <button type="button" className="install-btn" onClick={() => void promptInstall()}>
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
              <span>
                Install the game
                <small>Play full screen from your home screen</small>
              </span>
            </button>
          )}
          {install === 'ios' && (
            <p className="install-hint">
              <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
              Install: tap Share, then Add to Home Screen
            </p>
          )}
          </div>
        </div>
      )}
      {view === 'chapters' && (
        <div className="title-panel-wrap">
          <div className="panel">
            <h2 className="panel-title">Chapters</h2>
            <nav className="menu-list">
              {CAMPAIGN.map((m, i) => {
                const unlocked = i === 0 || completed.includes(CAMPAIGN[i - 1].id) || completed.includes(m.id);
                return (
                  <button key={m.id} type="button" className="menu-btn" disabled={!unlocked} onClick={() => play('story', m.id)}>
                    {m.chapter}: {m.title}
                    <span className="menu-sub">{completed.includes(m.id) ? 'Complete ✓' : unlocked ? 'Ready' : 'Locked — finish the previous chapter'}</span>
                  </button>
                );
              })}
            </nav>
            <div className="panel-actions">
              <button type="button" className="menu-btn" onClick={() => setView('main')}>
                Back
              </button>
            </div>
          </div>
        </div>
      )}
      {view === 'saves' && (
        <div className="title-panel-wrap">
          <div className="panel">
            <h2 className="panel-title">Saves</h2>
            <div className="menu-list">
              {slots.map((s, i) => {
                const done = s.completed.filter((id) => CAMPAIGN.some((m) => m.id === id)).length;
                const empty = s.updatedAt === 0;
                return (
                  <div key={i} className={`save-slot ${i === activeSlot ? 'active' : ''}`}>
                    <div className="save-slot-info">
                      <strong>Slot {i + 1}{i === activeSlot ? ' · in use' : ''}</strong>
                      <span>{empty ? 'Empty' : `${done}/${CAMPAIGN.length} missions · ${new Date(s.updatedAt).toLocaleString()}`}</span>
                    </div>
                    <div className="save-slot-actions">
                      {!empty && i !== activeSlot && (
                        <button type="button" className="menu-btn" onClick={() => saves.select(i)}>
                          Load
                        </button>
                      )}
                      {confirmSlot === i ? (
                        <button
                          type="button"
                          className="menu-btn primary"
                          onClick={() => {
                            saves.newGame(i);
                            setConfirmSlot(null);
                          }}
                        >
                          {empty ? 'Start here' : 'Erase & start'}
                        </button>
                      ) : (
                        <button type="button" className="menu-btn" onClick={() => setConfirmSlot(i)}>
                          New game
                        </button>
                      )}
                      {!empty && (
                        <button type="button" className="menu-btn" onClick={() => saves.deleteSlot(i)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="panel-actions">
              <button
                type="button"
                className="menu-btn"
                onClick={() => {
                  setConfirmSlot(null);
                  setView('main');
                }}
              >
                Back
              </button>
            </div>
          </div>
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
