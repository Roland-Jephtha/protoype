import { useEffect, useState } from 'react';
import { audio } from '../game/audio/audioEngine';
import { runtime } from '../game/runtime';
import { MISSIONS } from '../missions/missions';
import { useApp } from '../state/appStore';

/** Shown for the first seconds of the intro. */
const TITLE_CARD_SECONDS = 3.6;

/**
 * Mission intro overlay: cinema bars, the chapter title card, narration
 * subtitles and Skip (button, Space or Enter). The camera is driven by
 * CinematicCamera; this only reads its clock.
 */
export function CinematicOverlay() {
  const mission = useApp((s) => s.mission);
  const begin = useApp((s) => s.beginMission);
  const [t, setT] = useState(0);

  useEffect(() => {
    audio.sting();
    const id = window.setInterval(() => setT(runtime.cinematic.t), 100);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        begin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('keydown', onKey);
    };
  }, [begin]);

  if (!mission) return null;
  const def = MISSIONS[mission.missionId];
  const lines = def.intro.lines;
  const length = runtime.cinematic.length || 12;
  // Narration starts after the title card and is spread over the rest of the intro.
  const per = (length - TITLE_CARD_SECONDS * 0.6) / lines.length;
  const index = Math.min(lines.length - 1, Math.max(0, Math.floor((t - TITLE_CARD_SECONDS * 0.6) / per)));
  const showTitle = t < TITLE_CARD_SECONDS;

  return (
    <div className="cinematic" role="dialog" aria-label="Mission intro">
      <div className="cinematic-bar top" />
      <div className="cinematic-bar bottom" />
      {showTitle && (
        <div className="cinematic-title">
          <p className="title-kicker">{def.chapter}</p>
          <h2>{def.title}</h2>
        </div>
      )}
      {t > TITLE_CARD_SECONDS * 0.6 && (
        <p key={index} className="cinematic-line">
          {lines[index]}
        </p>
      )}
      <button type="button" className="cinematic-skip" onClick={begin}>
        Skip ▸
      </button>
    </div>
  );
}
