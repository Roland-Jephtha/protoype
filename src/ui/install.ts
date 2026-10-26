import { useSyncExternalStore } from 'react';

/** Chrome's install prompt event (not in the DOM typings). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'installed' | 'available' | 'ios' | 'none';

let deferred: InstallPromptEvent | null = null;
let state: InstallState = 'none';
const listeners = new Set<() => void>();
const set = (s: InstallState) => {
  state = s;
  listeners.forEach((l) => l());
};

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Starts listening for the browser's install prompt (call once at startup). */
export function watchInstall() {
  if (typeof window === 'undefined') return;
  if (standalone()) {
    state = 'installed';
    return;
  }
  // iOS Safari has no install prompt: show "Share, then Add to Home Screen" instead.
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua)) state = 'ios';
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    set('available');
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set('installed');
  });
}

/** Which manual install instructions fit this device (when the browser offers no install dialog). */
export function installHelp(s: InstallState): 'ios' | 'inapp' | 'android' | 'desktop' | 'other' {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  // In-app browsers (WhatsApp, Instagram, Facebook, TikTok...) can't install web apps.
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|TikTok|Snapchat|; wv\)/.test(ua)) return 'inapp';
  if (s === 'ios' || /iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Chrome|Edg\//.test(ua)) return 'desktop';
  return 'other';
}

/** Shows the browser's install dialog (Android Chrome, desktop Chrome / Edge). */
export async function promptInstall() {
  if (!deferred) return;
  await deferred.prompt();
  const choice = await deferred.userChoice;
  if (choice.outcome === 'accepted') {
    deferred = null;
    set('installed');
  }
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => 'none',
  );
}
