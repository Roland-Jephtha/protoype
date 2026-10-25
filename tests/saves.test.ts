import { describe, expect, it } from 'vitest';
import { emptySave, migrateSave, SAVE_VERSION, withCheckpoint, withCompleted } from '../src/save/saveData';

describe('save data', () => {
  it('migrates old, partial or corrupt records to the current schema', () => {
    expect(migrateSave(null, 1)).toEqual(emptySave(1));
    expect(migrateSave('garbage', 2)).toEqual(emptySave(2));
    const legacy = migrateSave({ completed: ['prologue', 'prologue', 42] }, 0);
    expect(legacy.completed).toEqual(['prologue']);
    expect(legacy.version).toBe(SAVE_VERSION);
    expect(migrateSave({ current: { missionId: 'zod', checkpoint: '2' } }, 0).current).toEqual({ missionId: 'zod', checkpoint: 2 });
  });

  it('records completions and checkpoints', () => {
    let s = withCheckpoint(emptySave(0), 'prologue', 2, 100);
    expect(s.current).toEqual({ missionId: 'prologue', checkpoint: 2 });
    s = withCompleted(s, 'prologue', 200);
    expect(s.completed).toEqual(['prologue']);
    expect(s.current).toBeNull();
    expect(withCompleted(s, 'prologue', 300).completed).toEqual(['prologue']);
  });
});
