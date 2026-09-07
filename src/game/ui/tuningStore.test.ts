import { describe, expect, it } from 'vitest';
import { DEFAULT_HANDLING } from '../sim/handling';
import { loadHandling, saveHandling, toTypeScriptSource } from './tuningStore';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('tuningStore', () => {
  it('round-trips a tuned set', () => {
    const storage = new MemoryStorage();
    saveHandling({ ...DEFAULT_HANDLING, lateralGrip: 3.5 }, storage);
    expect(loadHandling(storage).lateralGrip).toBe(3.5);
  });

  it('falls back to the defaults when nothing is saved', () => {
    expect(loadHandling(new MemoryStorage())).toEqual(DEFAULT_HANDLING);
  });

  it('ignores unknown and malformed values rather than trusting them', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      'shunt.handling.v1',
      JSON.stringify({ lateralGrip: 4, engineForce: 'fast', removedDial: 12 }),
    );
    const loaded = loadHandling(storage);
    expect(loaded.lateralGrip).toBe(4);
    expect(loaded.engineForce).toBe(DEFAULT_HANDLING.engineForce);
    expect('removedDial' in loaded).toBe(false);
  });

  it('survives corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('shunt.handling.v1', '{not json');
    expect(loadHandling(storage)).toEqual(DEFAULT_HANDLING);
  });

  it('emits source that names every constant', () => {
    const source = toTypeScriptSource(DEFAULT_HANDLING);
    for (const key of Object.keys(DEFAULT_HANDLING)) {
      expect(source).toContain(`${key}:`);
    }
    expect(source).toContain('DEFAULT_HANDLING');
  });
});
