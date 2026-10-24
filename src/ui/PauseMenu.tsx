import { useApp } from '../state/appStore';
import { ControlsReference } from './ControlsReference';
import { SettingsPanel } from './SettingsPanel';
import { TravelPanel } from './TravelPanel';

/** `onResume` runs inside the click gesture so the game can re-capture the mouse. */
export function PauseMenu({ onResume }: { onResume: () => void }) {
  const view = useApp((s) => s.pauseView);
  const setView = useApp((s) => s.setPauseView);
  const restart = useApp((s) => s.restartCheckpoint);
  const mode = useApp((s) => s.mode);
  const restartMission = useApp((s) => s.restartMission);
  const toTitle = useApp((s) => s.returnToTitle);

  return (
    <div className="overlay pause-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      {view === 'main' && (
        <div className="panel menu-panel">
          <h2 className="panel-title">Paused</h2>
          <nav className="menu-list">
            <button type="button" className="menu-btn" onClick={onResume} autoFocus>
              Resume
            </button>
            <button type="button" className="menu-btn" onClick={restart}>
              Restart checkpoint
            </button>
            {mode === 'story' && (
              <button type="button" className="menu-btn" onClick={restartMission}>
                Restart mission
              </button>
            )}
            <button type="button" className="menu-btn" onClick={() => setView('travel')}>
              Travel
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('settings')}>
              Settings
            </button>
            <button type="button" className="menu-btn" onClick={() => setView('controls')}>
              Controls
            </button>
            <button type="button" className="menu-btn secondary" onClick={() => setView('confirmQuit')}>
              Return to title
            </button>
          </nav>
        </div>
      )}
      {view === 'settings' && <SettingsPanel onBack={() => setView('main')} />}
      {view === 'controls' && <ControlsReference onBack={() => setView('main')} />}
      {view === 'travel' && <TravelPanel onBack={() => setView('main')} />}
      {view === 'confirmQuit' && (
        <div className="panel menu-panel">
          <h2 className="panel-title">Return to title?</h2>
          <p className="panel-text">Free roam has no saved progress yet — your position will be reset.</p>
          <nav className="menu-list">
            <button type="button" className="menu-btn" onClick={() => setView('main')} autoFocus>
              Cancel
            </button>
            <button type="button" className="menu-btn danger" onClick={toTitle}>
              Return to title
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
