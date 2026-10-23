import { useEffect, useState } from 'react';

const portraitQuery = '(orientation: portrait)';

/**
 * Gameplay is designed for landscape. In portrait we ask the player to rotate,
 * but let them continue anyway (the layout still works, just cramped).
 */
export function OrientationPrompt() {
  const [portrait, setPortrait] = useState(() => window.matchMedia(portraitQuery).matches);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(portraitQuery);
    const onChange = () => setPortrait(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!portrait || dismissed) return null;
  return (
    <div className="overlay orientation-overlay" role="dialog" aria-label="Rotate device">
      <div className="rotate-icon" aria-hidden="true" />
      <p>Rotate your device to landscape for the best experience.</p>
      <button type="button" className="menu-btn secondary" onClick={() => setDismissed(true)}>
        Continue in portrait
      </button>
    </div>
  );
}
