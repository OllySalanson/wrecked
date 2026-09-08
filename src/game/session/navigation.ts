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

/**
 * The key that opens the handling lab, wherever it is offered.
 *
 * One key on every screen that offers it. The lab is a workshop rather than a mode, so it is never
 * a menu entry - which makes a single, consistent keypress the whole of what a player has to learn.
 */
export const LAB_KEY = 'KeyF';

/**
 * Where leaving the handling lab lands.
 *
 * Opening the lab does not touch the session, so leaving it is a return to whatever screen the
 * session is still on: the title if that is where it was opened from, the round stand-in if it was
 * opened from there. The lab has a scene key but never a phase, so it is somewhere the menus can
 * step into and never somewhere the session can be.
 */
export function sceneAfterLab(phase: Phase): string {
  return sceneForPhase(phase);
}
