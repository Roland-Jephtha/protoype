/**
 * Save-slot data and its versioned schema. Pure (no storage), so migrations
 * and progress rules are unit-tested.
 */

export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

export interface SaveData {
  version: number;
  slot: number;
  /** Mission ids completed in this slot. */
  completed: string[];
  /** Mission in progress and the last checkpoint reached in it (objective index). */
  current: { missionId: string; checkpoint: number } | null;
  /** ms since epoch; 0 = never played. */
  updatedAt: number;
}

export function emptySave(slot: number): SaveData {
  return { version: SAVE_VERSION, slot, completed: [], current: null, updatedAt: 0 };
}

/** Brings any stored value (older version, partial, corrupt) to the current schema. */
export function migrateSave(raw: unknown, slot: number): SaveData {
  if (!raw || typeof raw !== 'object') return emptySave(slot);
  const r = raw as Partial<SaveData> & { completed?: unknown };
  const completed = Array.isArray(r.completed) ? r.completed.filter((x): x is string => typeof x === 'string') : [];
  const current =
    r.current && typeof r.current === 'object' && typeof (r.current as { missionId?: unknown }).missionId === 'string'
      ? { missionId: (r.current as { missionId: string }).missionId, checkpoint: Math.max(0, Math.floor(Number((r.current as { checkpoint?: unknown }).checkpoint) || 0)) }
      : null;
  return { version: SAVE_VERSION, slot, completed: [...new Set(completed)], current, updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0 };
}

export function withCompleted(s: SaveData, missionId: string, now: number): SaveData {
  return { ...s, completed: s.completed.includes(missionId) ? s.completed : [...s.completed, missionId], current: null, updatedAt: now };
}

export function withCheckpoint(s: SaveData, missionId: string, checkpoint: number, now: number): SaveData {
  return { ...s, current: { missionId, checkpoint }, updatedAt: now };
}
