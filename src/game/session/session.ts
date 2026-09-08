/**
 * The session: a run of rounds played to a target score, and the screen it is currently on.
 *
 * This is deliberately a plain data module with no Phaser in it. The screens are a rendering of
 * this state, not the other way round, which is what lets "a session reaches ten and ends" be a
 * test rather than something you can only find out by playing.
 *
 * The one hard rule encoded here is the restart budget. The design's sub-two-second restart is a
 * requirement, so the gap between rounds is a timer that runs itself out - `INTERMISSION_MS` - and
 * a keypress can only make it shorter. Nothing between two rounds ever waits for input.
 */

/** Rounds won needed to take the session. First to ten, per the design. */
export const WINNING_SCORE = 10;

/**
 * How long the between-rounds scoreboard holds before the next round starts on its own.
 * The design's budget is two seconds from the end of a round to driving again; this leaves headroom
 * for the round's own countdown, which belongs to the round lifecycle work (MVP item 7).
 */
export const INTERMISSION_MS = 1500;

export type Phase = 'title' | 'lineup' | 'round' | 'intermission' | 'champion';

export interface SessionState {
  readonly phase: Phase;
  readonly playerCount: number;
  /** Rounds won, one entry per player, index-aligned with `SEATS`. */
  readonly scores: readonly number[];
  /** 0 before the first round, then 1-based. */
  readonly roundNumber: number;
  readonly target: number;
  /** Who took the round that has just finished, or null before any round has finished. */
  readonly lastRoundWinner: number | null;
  readonly championIndex: number | null;
  readonly intermissionRemainingMs: number;
}

export interface CreateSessionOptions {
  playerCount?: number;
  target?: number;
}

export function createSession({
  playerCount = 2,
  target = WINNING_SCORE,
}: CreateSessionOptions = {}): SessionState {
  if (playerCount < 2) throw new RangeError('a session needs at least two players');
  if (target < 1) throw new RangeError('the target score must be at least one');
  return {
    phase: 'title',
    playerCount,
    scores: new Array<number>(playerCount).fill(0),
    roundNumber: 0,
    target,
    lastRoundWinner: null,
    championIndex: null,
    intermissionRemainingMs: 0,
  };
}

/**
 * Every transition below returns the state unchanged when it is asked for from the wrong phase.
 * Menus get keys held over from the previous screen and repeat events; a no-op is the behaviour
 * that cannot double-start a round, and it is cheaper to reason about than a thrown error in a
 * keyboard handler.
 */

export function openLineup(state: SessionState): SessionState {
  if (state.phase !== 'title') return state;
  return { ...state, phase: 'lineup' };
}

/** The polite way out, from a menu. It will not throw away a round that is being driven. */
export function backToTitle(state: SessionState): SessionState {
  if (state.phase === 'round') return state;
  return abandonSession(state);
}

/** Tear the session down and go back to the title from anywhere, including mid-round. */
export function abandonSession(state: SessionState): SessionState {
  return createSession({ playerCount: state.playerCount, target: state.target });
}

export function startRound(state: SessionState): SessionState {
  if (state.phase !== 'lineup' && state.phase !== 'intermission') return state;
  return {
    ...state,
    phase: 'round',
    roundNumber: state.roundNumber + 1,
    intermissionRemainingMs: 0,
  };
}

/** A +1 delta for the player who took the round, and zero for everyone else. */
export function roundWin(playerCount: number, winner: number): readonly number[] {
  return Array.from({ length: playerCount }, (_, index) => (index === winner ? 1 : 0));
}

/**
 * Close a round with an explicit score delta per player.
 *
 * Deltas rather than "the winner gets a point" because the design keeps the original's scoring, in
 * which a round can cost you points as well as pay them. The round lifecycle work decides what the
 * numbers are; the session only has to add them up and notice when someone has arrived.
 */
export function applyRoundResult(
  state: SessionState,
  deltas: readonly number[],
  winner: number,
): SessionState {
  if (state.phase !== 'round') return state;
  if (deltas.length !== state.playerCount) {
    throw new RangeError(`expected ${state.playerCount} score deltas, got ${deltas.length}`);
  }

  const scores = state.scores.map((score, index) => score + deltas[index]);
  const champion = findChampion(scores, state.target);

  if (champion !== null) {
    return {
      ...state,
      phase: 'champion',
      scores,
      lastRoundWinner: winner,
      championIndex: champion,
      intermissionRemainingMs: 0,
    };
  }

  return {
    ...state,
    phase: 'intermission',
    scores,
    lastRoundWinner: winner,
    intermissionRemainingMs: INTERMISSION_MS,
  };
}

/** Convenience for the common case: whoever survived the round takes a point. */
export function endRound(state: SessionState, winner: number): SessionState {
  return applyRoundResult(state, roundWin(state.playerCount, winner), winner);
}

/** Runs the between-rounds clock down. When it reaches zero the next round starts by itself. */
export function tickIntermission(state: SessionState, deltaMs: number): SessionState {
  if (state.phase !== 'intermission') return state;
  const remaining = state.intermissionRemainingMs - Math.max(deltaMs, 0);
  if (remaining > 0) return { ...state, intermissionRemainingMs: remaining };
  return startRound({ ...state, intermissionRemainingMs: 0 });
}

/** A player asking for the next round early. It can only ever shorten the gap, never lengthen it. */
export function skipIntermission(state: SessionState): SessionState {
  if (state.phase !== 'intermission') return state;
  return startRound({ ...state, intermissionRemainingMs: 0 });
}

/** Same players, scores back to zero, straight back onto the track. */
export function rematch(state: SessionState): SessionState {
  if (state.phase !== 'champion') return state;
  const fresh = createSession({ playerCount: state.playerCount, target: state.target });
  return startRound({ ...fresh, phase: 'lineup' });
}

/** 0..1, how far through the between-rounds hold we are. Drives the countdown wipe. */
export function intermissionProgress(state: SessionState): number {
  if (state.phase !== 'intermission') return 1;
  return 1 - state.intermissionRemainingMs / INTERMISSION_MS;
}

export function leaderIndex(state: SessionState): number {
  let best = 0;
  for (let index = 1; index < state.scores.length; index += 1) {
    if (state.scores[index] > state.scores[best]) best = index;
  }
  return best;
}

/**
 * Whoever is first past the target. If two players cross on the same round the higher score wins;
 * a genuine tie on the same round takes the lower seat, which cannot happen while only one player
 * can win a round but is cheaper to define than to leave undefined.
 */
function findChampion(scores: readonly number[], target: number): number | null {
  let champion: number | null = null;
  for (let index = 0; index < scores.length; index += 1) {
    if (scores[index] < target) continue;
    if (champion === null || scores[index] > scores[champion]) champion = index;
  }
  return champion;
}
