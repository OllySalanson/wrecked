/**
 * Which screen shows which phase.
 *
 * Kept as data, and kept away from Phaser, so the mapping is total by construction and testable
 * without a browser. Scenes look their own key up here rather than each knowing the next one, which
 * is what stops the flow turning into a web of hard-coded `scene.start` calls.
 */

import type { Phase } from './session';

export const SCENE_KEYS = {
  title: 'Title',
  lineup: 'Lineup',
  round: 'Round',
  intermission: 'Scoreboard',
  champion: 'Champion',
  feelLab: 'FeelLab',
} as const;

export const PHASE_SCENES: Record<Phase, string> = {
  title: SCENE_KEYS.title,
  lineup: SCENE_KEYS.lineup,
  round: SCENE_KEYS.round,
  intermission: SCENE_KEYS.intermission,
  champion: SCENE_KEYS.champion,
};

export function sceneForPhase(phase: Phase): string {
  return PHASE_SCENES[phase];
}
