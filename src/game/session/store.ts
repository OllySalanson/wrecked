/**
 * Where the live session lives, and how a screen hands over to the next one.
 *
 * The state itself is plain data in `session.ts`; this is the thin Phaser-facing layer that keeps
 * one copy of it in the game registry and starts whichever scene the new phase belongs on. Screens
 * therefore never name each other - they name a transition, and the phase decides the screen. That
 * is what stops the flow becoming a web of hard-coded `scene.start` calls.
 */

import type Phaser from 'phaser';
import { createSession, type SessionState } from './session';
import { sceneForPhase } from './navigation';

const REGISTRY_KEY = 'shunt.session';

export function readSession(scene: Phaser.Scene): SessionState {
  const existing = scene.registry.get(REGISTRY_KEY) as SessionState | undefined;
  if (existing) return existing;
  const fresh = createSession();
  scene.registry.set(REGISTRY_KEY, fresh);
  return fresh;
}

export function writeSession(scene: Phaser.Scene, state: SessionState): void {
  scene.registry.set(REGISTRY_KEY, state);
}

/**
 * Records a transition and, if it moved the session to a different phase, starts that phase's
 * screen. Passing a state that did not change - which every rejected transition returns - does
 * nothing at all, so a held key cannot walk through two screens.
 */
export function transition(scene: Phaser.Scene, next: SessionState): void {
  const current = readSession(scene);
  if (next === current) return;
  writeSession(scene, next);
  if (next.phase !== current.phase) scene.scene.start(sceneForPhase(next.phase));
}
