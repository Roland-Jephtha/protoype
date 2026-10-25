import { create } from 'zustand';
import { emptySave, migrateSave, SLOT_COUNT, withCheckpoint, withCompleted, type SaveData } from './saveData';

/**
 * Three save slots in IndexedDB (falling back to localStorage where IndexedDB
 * is unavailable, e.g. some private windows). Kept in memory once loaded so
 * the rest of the game reads progress synchronously.
 */

const DB = 'krypton';
const STORE = 'saves';
const ACTIVE_KEY = 'krypton.activeSlot';
const LEGACY_KEY = 'krypton.story.v1';
const FALLBACK_KEY = (slot: number) => `krypton.save.${slot}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readAll(): Promise<unknown[]> {
  try {
    const db = await openDb();
    return await Promise.all(
      Array.from(
        { length: SLOT_COUNT },
        (_, slot) =>
          new Promise<unknown>((resolve) => {
            const req = db.transaction(STORE).objectStore(STORE).get(slot);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          }),
      ),
    );
  } catch {
    return Array.from({ length: SLOT_COUNT }, (_, slot) => {
      try {
        return JSON.parse(localStorage.getItem(FALLBACK_KEY(slot)) ?? 'null');
      } catch {
        return null;
      }
    });
  }
}

async function write(data: SaveData) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, data.slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY(data.slot), JSON.stringify(data));
    } catch {
      // Storage blocked: progress lasts for this session only.
    }
  }
}

interface SaveState {
  ready: boolean;
  slots: SaveData[];
  active: number;
  init: () => Promise<void>;
  select: (slot: number) => void;
  /** Wipes a slot and makes it active (New Game). */
  newGame: (slot: number) => void;
  deleteSlot: (slot: number) => void;
  markComplete: (missionId: string) => void;
  setCheckpoint: (missionId: string, checkpoint: number) => void;
}

const readActive = () => {
  try {
    const n = Number(localStorage.getItem(ACTIVE_KEY));
    return Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : 0;
  } catch {
    return 0;
  }
};

export const useSaves = create<SaveState>((set, get) => {
  const update = (slot: number, data: SaveData) => {
    const slots = get().slots.slice();
    slots[slot] = data;
    set({ slots });
    void write(data);
  };
  return {
    ready: false,
    slots: Array.from({ length: SLOT_COUNT }, (_, i) => emptySave(i)),
    active: 0,
    init: async () => {
      const raw = await readAll();
      const slots = raw.map((r, i) => migrateSave(r, i));
      // First run with saves: bring the old single-progress record into slot 1.
      if (slots.every((s) => s.updatedAt === 0)) {
        try {
          const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null') as { completed?: unknown } | null;
          if (legacy && Array.isArray(legacy.completed) && legacy.completed.length) {
            slots[0] = { ...migrateSave(legacy, 0), updatedAt: Date.now() };
            void write(slots[0]);
          }
        } catch {
          // No legacy progress.
        }
      }
      set({ slots, active: readActive(), ready: true });
    },
    select: (slot) => {
      set({ active: slot });
      try {
        localStorage.setItem(ACTIVE_KEY, String(slot));
      } catch {
        // Not remembered between sessions.
      }
    },
    newGame: (slot) => {
      get().select(slot);
      update(slot, { ...emptySave(slot), updatedAt: Date.now() });
    },
    deleteSlot: (slot) => update(slot, emptySave(slot)),
    markComplete: (missionId) => {
      const { active, slots } = get();
      update(active, withCompleted(slots[active], missionId, Date.now()));
    },
    setCheckpoint: (missionId, checkpoint) => {
      const { active, slots } = get();
      update(active, withCheckpoint(slots[active], missionId, checkpoint, Date.now()));
    },
  };
});

/** The active slot's data. */
export const activeSave = () => {
  const s = useSaves.getState();
  return s.slots[s.active];
};
