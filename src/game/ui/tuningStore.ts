/**
 * Persistence for tuned handling values.
 *
 * Values you found at midnight must still be there in the morning, otherwise the lab is a toy.
 * Unknown or malformed keys are ignored rather than trusted, so an older saved set still loads
 * after the constants change.
 */

import { DEFAULT_HANDLING, type HandlingConstants } from '../sim/handling';

const STORAGE_KEY = 'shunt.handling.v1';

export function loadHandling(storage: Storage = localStorage): HandlingConstants {
  const merged: HandlingConstants = { ...DEFAULT_HANDLING };
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return merged;
  }
  if (!raw) return merged;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return merged;
  }
  if (typeof parsed !== 'object' || parsed === null) return merged;

  const saved = parsed as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_HANDLING) as (keyof HandlingConstants)[]) {
    const value = saved[key];
    if (typeof value === 'number' && Number.isFinite(value)) merged[key] = value;
  }
  return merged;
}

export function saveHandling(values: HandlingConstants, storage: Storage = localStorage): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // A blocked or full localStorage must never stop you driving.
  }
}

export function clearHandling(storage: Storage = localStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Same.
  }
}

/**
 * The tuned set, formatted so it can be pasted straight back over DEFAULT_HANDLING in
 * src/game/sim/handling.ts. This is how a good session becomes the new baseline.
 */
export function toTypeScriptSource(values: HandlingConstants): string {
  const lines = (Object.keys(DEFAULT_HANDLING) as (keyof HandlingConstants)[]).map((key) => {
    const value = values[key];
    const rounded = Math.round(value * 1000) / 1000;
    return `  ${key}: ${rounded},`;
  });
  return `export const DEFAULT_HANDLING: HandlingConstants = {\n${lines.join('\n')}\n};\n`;
}
