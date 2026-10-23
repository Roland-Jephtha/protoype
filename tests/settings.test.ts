import { describe, expect, it } from 'vitest';
import { defaultSettings, loadSettings, sanitizeSettings, SETTINGS_STORAGE_KEY } from '../src/state/settings';

const storage = (value: string | null) => ({ getItem: (k: string) => (k === SETTINGS_STORAGE_KEY ? value : null) });

describe('settings persistence', () => {
  it('falls back to defaults on corrupt JSON', () => {
    expect(loadSettings(storage('{not json'))).toEqual(defaultSettings());
  });

  it('falls back to defaults when nothing is stored', () => {
    expect(loadSettings(storage(null))).toEqual(defaultSettings());
  });

  it('falls back to defaults when storage throws (blocked / private mode)', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(loadSettings(throwing)).toEqual(defaultSettings());
  });

  it('keeps valid fields, clamps out-of-range numbers, rejects wrong types and unknown keys', () => {
    const s = sanitizeSettings({
      cameraSensitivity: 99,
      invertY: true,
      stickDeadZone: 'big',
      graphicsQuality: 'ultra',
      touchControls: 'on',
      hacked: 1,
    });
    expect(s.cameraSensitivity).toBe(3);
    expect(s.invertY).toBe(true);
    expect(s.stickDeadZone).toBe(defaultSettings().stickDeadZone);
    expect(s.graphicsQuality).toBe('medium');
    expect(s.touchControls).toBe('on');
    expect('hacked' in s).toBe(false);
  });

  it('rejects NaN', () => {
    expect(sanitizeSettings({ touchControlScale: Number.NaN }).touchControlScale).toBe(1);
  });
});
