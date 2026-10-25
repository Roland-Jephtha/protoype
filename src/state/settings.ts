import { create } from 'zustand';
import { TOUCH } from '../config/controls';
import type { GraphicsQuality } from '../config/gameConfig';

/**
 * Lightweight player preferences, persisted in localStorage.
 * (Structured save games will use IndexedDB in Phase 7 — not this store.)
 */
export interface Settings {
  cameraSensitivity: number;
  touchLookSensitivity: number;
  invertY: boolean;
  stickDeadZone: number;
  touchControls: 'auto' | 'on' | 'off';
  touchControlOpacity: number;
  touchControlScale: number;
  /** Phones: always present the game horizontally (rotate if held upright). */
  forceLandscape: boolean;
  graphicsQuality: GraphicsQuality;
  reducedMotion: boolean;
  showDebug: boolean;
}

export const SETTINGS_STORAGE_KEY = 'krypton.settings.v1';

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSettings(): Settings {
  return {
    cameraSensitivity: 1,
    touchLookSensitivity: 1,
    invertY: false,
    stickDeadZone: TOUCH.defaultDeadZone,
    touchControls: 'auto',
    touchControlOpacity: 0.75,
    touchControlScale: 1,
    forceLandscape: true,
    // Phones start on Low (they can raise it in Settings); desktops on Medium.
    graphicsQuality: typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches ? 'low' : 'medium',
    reducedMotion: typeof window !== 'undefined' && prefersReducedMotion(),
    showDebug: false,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Validates untrusted stored data field by field. Unknown keys are dropped,
 * wrong types fall back to defaults, and numbers are clamped, so a corrupt or
 * outdated settings blob can never break the game.
 */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof Settings, lo: number, hi: number) =>
    typeof r[k] === 'number' && Number.isFinite(r[k]) ? clamp(r[k] as number, lo, hi) : (d[k] as number);
  const bool = (k: keyof Settings) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (d[k] as boolean));
  const oneOf = <T extends string>(k: keyof Settings, options: readonly T[]) =>
    options.includes(r[k] as T) ? (r[k] as T) : (d[k] as T);

  return {
    cameraSensitivity: num('cameraSensitivity', 0.2, 3),
    touchLookSensitivity: num('touchLookSensitivity', 0.2, 3),
    invertY: bool('invertY'),
    stickDeadZone: num('stickDeadZone', 0, 0.5),
    touchControls: oneOf('touchControls', ['auto', 'on', 'off'] as const),
    touchControlOpacity: num('touchControlOpacity', 0.2, 1),
    touchControlScale: num('touchControlScale', 0.75, 1.4),
    forceLandscape: bool('forceLandscape'),
    graphicsQuality: oneOf('graphicsQuality', ['low', 'medium', 'high'] as const),
    reducedMotion: bool('reducedMotion'),
    showDebug: bool('showDebug'),
  };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | undefined = safeLocalStorage()): Settings {
  try {
    const text = storage?.getItem(SETTINGS_STORAGE_KEY);
    return text ? sanitizeSettings(JSON.parse(text)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

function safeLocalStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}

function persist(s: Settings) {
  try {
    safeLocalStorage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked (private mode): settings still apply for this session.
  }
}

interface SettingsStore extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...loadSettings(),
  set: (key, value) => {
    set({ [key]: value } as Partial<Settings>);
    persist(sanitizeSettings(get()));
  },
  reset: () => {
    const d = defaultSettings();
    set(d);
    persist(d);
  },
}));
