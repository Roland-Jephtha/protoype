import { useEffect, useRef, useState } from 'react';
import { CAMPAIGN, MISSIONS } from '../missions/missions';
import { activeTargets, objectiveText } from '../missions/runner';
import { runtime } from '../game/runtime';
import { useApp } from '../state/appStore';

/** Mission failed: retry from the last checkpoint, restart, or quit. */
export function MissionFailed() {
  const mission = useApp((s) => s.mission);
  const reason = useApp((s) => s.failReason);
  const retry = useApp((s) => s.retryFromCheckpoint);
  const restart = useApp((s) => s.restartMission);
  const toTitle = useApp((s) => s.returnToTitle);
  if (!mission) return null;
  const def = MISSIONS[mission.missionId];
  return (
    <div className="overlay mission-overlay" role="dialog" aria-modal="true" aria-label="Mission failed">
      <div className="panel mission-panel">
        <p className="title-kicker">{def.chapter} · Mission failed</p>
        <h2 className="mission-title">{def.title}</h2>
        <p className="panel-text">{reason}</p>
        <div className="panel-actions">
          <button type="button" className="menu-btn secondary" onClick={toTitle}>
            Quit
          </button>
          <button type="button" className="menu-btn secondary" onClick={restart}>
            Restart mission
          </button>
          <button type="button" className="menu-btn primary" onClick={retry} autoFocus>
            {mission.checkpoint > 0 ? 'Retry from checkpoint' : 'Retry'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mission-complete screen with what to do next. */
export function MissionComplete() {
  const mission = useApp((s) => s.mission);
  const toFree = useApp((s) => s.continueInFreeRoam);
  const replay = useApp((s) => s.restartMission);
  const toTitle = useApp((s) => s.returnToTitle);
  const playMission = useApp((s) => s.playMission);
  if (!mission) return null;
  const def = MISSIONS[mission.missionId];
  const next = CAMPAIGN[CAMPAIGN.findIndex((m) => m.id === def.id) + 1];
  return (
    <div className="overlay mission-overlay" role="dialog" aria-modal="true" aria-label="Mission complete">
      <div className="panel mission-panel">
        <p className="title-kicker">{def.chapter} · Mission complete</p>
        <h2 className="mission-title">{def.title}</h2>
        <p className="panel-text">{def.outro}</p>
        <p className="settings-note">{next ? `Next: ${next.chapter} — ${next.title}. ` : 'Campaign complete! '}Your progress is saved in this browser.</p>
        <div className="panel-actions">
          <button type="button" className="menu-btn secondary" onClick={toTitle}>
            Title
          </button>
          <button type="button" className="menu-btn secondary" onClick={replay}>
            Replay
          </button>
          <button type="button" className={`menu-btn ${next ? 'secondary' : 'primary'}`} onClick={toFree} autoFocus={!next}>
            Free roam
          </button>
          {next && (
            <button type="button" className="menu-btn primary" onClick={() => playMission(next.id)} autoFocus>
              Next mission
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Story-mode HUD block: current objective with progress, distance to the
 * nearest marked target, the interaction prompt and short messages.
 */
export function MissionHud({ touchUi }: { touchUi: boolean }) {
  const mission = useApp((s) => s.mission);
  const prompt = useApp((s) => s.interactPrompt);
  const toast = useApp((s) => s.toast);
  const distRef = useRef<HTMLSpanElement>(null);
  // Each message shows for ~3 s; we only remember which one has expired.
  const [expiredToast, setExpiredToast] = useState<number | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setExpiredToast(toast.id), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const visibleToast = toast && toast.id !== expiredToast ? toast.text : null;

  // Distance to the nearest marked target in this region (10 Hz).
  useEffect(() => {
    const id = window.setInterval(() => {
      const app = useApp.getState();
      if (!distRef.current || !app.mission) return;
      const def = MISSIONS[app.mission.missionId];
      const p = runtime.playerPosition;
      const targets = activeTargets(def, app.mission, runtime.regionId);
      if (!targets.length) {
        distRef.current.textContent = '';
        return;
      }
      const nearest = targets.reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      distRef.current.textContent = `${nearest.label} · ${Math.round(Math.hypot(nearest.x - p.x, nearest.z - p.z))} m`;
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  if (!mission) return null;
  const def = MISSIONS[mission.missionId];
  const progress = runtime.dronesDestroyed;
  return (
    <>
      <div className="hud-objective">
        <span className="hud-kicker">
          {def.chapter} · {def.title}
        </span>
        <span className="hud-objective-text">{objectiveText(def, mission, progress)}</span>
        <span ref={distRef} className="hud-objective-dist" />
      </div>
      {prompt && <div className="hud-interact">{touchUi ? prompt : `E · ${prompt}`}</div>}
      {visibleToast && <div className="hud-toast">{visibleToast}</div>}
    </>
  );
}
