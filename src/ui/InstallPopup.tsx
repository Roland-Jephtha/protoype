import { useEffect, useState } from 'react';
import { installHelp, promptInstall, useInstallState } from './install';

const DISMISS_KEY = 'krypton.installDismissed';
/** Wait this long after the title appears, so the browser's own install event has a chance to arrive (ms). */
const SHOW_AFTER = 1500;

const HELP: Record<ReturnType<typeof installHelp>, string> = {
  ios: 'Tap the Share button (the square with an arrow) at the bottom of Safari, then choose “Add to Home Screen”.',
  inapp: 'You’re in an app’s built-in browser, which can’t install games. Open this page in Chrome (or Safari on iPhone) — use the ⋮ or share menu → “Open in browser” — then install from there.',
  android: 'Open the browser menu (⋮ at the top right) and choose “Install app” or “Add to Home screen”.',
  desktop: 'Click the install icon at the right end of the address bar, or open the browser menu and choose “Install Project Krypton”.',
  other: 'Open your browser’s menu and choose “Install app” or “Add to Home screen”. Chrome, Edge and Samsung Internet support this best.',
};

/**
 * Asks to install the game as an app when the site opens: the browser's own
 * install dialog where available, otherwise step-by-step instructions for
 * this device. "Not now" hides it until the next visit.
 */
export function InstallPopup() {
  const state = useInstallState();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), SHOW_AFTER);
    return () => window.clearTimeout(id);
  }, []);

  if (!ready || dismissed || state === 'installed') return null;
  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode: just close */
    }
  };
  const canPrompt = state === 'available';
  return (
    <div className="install-popup" role="dialog" aria-modal="false" aria-label="Install the game">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
      <div className="install-popup-body">
        <strong>Install Project Krypton</strong>
        <p>{canPrompt ? 'Add the game to your home screen: it opens full screen, like an app, and starts offline.' : HELP[installHelp(state)]}</p>
        <div className="install-popup-actions">
          {canPrompt && (
            <button type="button" className="menu-btn primary" onClick={() => void promptInstall()}>
              Install
            </button>
          )}
          <button type="button" className="menu-btn" onClick={close}>
            {canPrompt ? 'Not now' : 'Got it'}
          </button>
        </div>
      </div>
    </div>
  );
}
