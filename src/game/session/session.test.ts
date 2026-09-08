import { describe, expect, it } from 'vitest';
import {
  INTERMISSION_MS,
  WINNING_SCORE,
  abandonSession,
  applyRoundResult,
  backToTitle,
  createSession,
  endRound,
  intermissionProgress,
  leaderIndex,
  openLineup,
  rematch,
  skipIntermission,
  startRound,
  tickIntermission,
  type SessionState,
} from './session';
import { PHASE_SCENES, SCENE_KEYS, sceneAfterLab, sceneForPhase } from './navigation';

/** Drives one round to completion the way the screens do, and lands on whatever comes next. */
function playRound(state: SessionState, winner: number): SessionState {
  return endRound(startRound(state), winner);
}

/** Skips the between-rounds hold by letting its clock run out, as it does with nobody touching it. */
function waitOutIntermission(state: SessionState): SessionState {
  return tickIntermission(state, INTERMISSION_MS);
}

describe('session flow', () => {
  it('starts on the title screen with nothing scored', () => {
    const state = createSession();
    expect(state.phase).toBe('title');
    expect(state.scores).toEqual([0, 0]);
    expect(state.roundNumber).toBe(0);
    expect(state.target).toBe(WINNING_SCORE);
  });

  it('walks title to lineup to the first round', () => {
    const state = startRound(openLineup(createSession()));
    expect(state.phase).toBe('round');
    expect(state.roundNumber).toBe(1);
  });

  it('goes to the scoreboard between rounds and counts the round up', () => {
    const state = playRound(openLineup(createSession()), 1);
    expect(state.phase).toBe('intermission');
    expect(state.scores).toEqual([0, 1]);
    expect(state.lastRoundWinner).toBe(1);
    expect(state.roundNumber).toBe(1);
  });

  it('ends the session when a player reaches ten', () => {
    let state = openLineup(createSession());
    for (let round = 0; round < WINNING_SCORE; round += 1) {
      state = playRound(state, 0);
      if (state.phase === 'intermission') state = waitOutIntermission(state);
    }
    expect(state.phase).toBe('champion');
    expect(state.championIndex).toBe(0);
    expect(state.scores).toEqual([WINNING_SCORE, 0]);
    expect(state.roundNumber).toBe(WINNING_SCORE);
  });

  it('does not end early on the ninth round', () => {
    let state = openLineup(createSession());
    for (let round = 0; round < WINNING_SCORE - 1; round += 1) {
      state = waitOutIntermission(playRound(state, 0));
    }
    expect(state.phase).toBe('round');
    expect(state.championIndex).toBeNull();
  });

  it('ends on a short target too, so the rule is the target and not the number ten', () => {
    let state = openLineup(createSession({ target: 2 }));
    state = waitOutIntermission(playRound(state, 1));
    state = playRound(state, 1);
    expect(state.phase).toBe('champion');
    expect(state.championIndex).toBe(1);
  });
});

describe('the restart budget', () => {
  it('starts the next round on its own once the hold expires', () => {
    const scoreboard = playRound(openLineup(createSession()), 0);
    const state = tickIntermission(scoreboard, INTERMISSION_MS);
    expect(state.phase).toBe('round');
    expect(state.roundNumber).toBe(2);
  });

  it('holds for less than the two-second restart budget', () => {
    expect(INTERMISSION_MS).toBeLessThan(2000);
  });

  it('stays on the scoreboard until the hold is actually spent', () => {
    const scoreboard = playRound(openLineup(createSession()), 0);
    const state = tickIntermission(scoreboard, INTERMISSION_MS / 2);
    expect(state.phase).toBe('intermission');
    expect(intermissionProgress(state)).toBeCloseTo(0.5);
  });

  it('lets a player cut the hold short but never extend it', () => {
    const scoreboard = playRound(openLineup(createSession()), 0);
    expect(skipIntermission(scoreboard).phase).toBe('round');
    expect(skipIntermission(scoreboard).roundNumber).toBe(2);
  });

  it('reports full progress off the scoreboard so a wipe is never left half drawn', () => {
    expect(intermissionProgress(createSession())).toBe(1);
  });
});

describe('rematch and quitting', () => {
  it('puts a rematch straight back on the track with the scores cleared', () => {
    let state = openLineup(createSession({ target: 1 }));
    state = playRound(state, 1);
    expect(state.phase).toBe('champion');

    const again = rematch(state);
    expect(again.phase).toBe('round');
    expect(again.roundNumber).toBe(1);
    expect(again.scores).toEqual([0, 0]);
    expect(again.championIndex).toBeNull();
  });

  it('drops back to a clean title screen', () => {
    const state = backToTitle(playRound(openLineup(createSession()), 0));
    expect(state.phase).toBe('title');
    expect(state.scores).toEqual([0, 0]);
  });

  it('will not abandon a round that is still being driven', () => {
    const racing = startRound(openLineup(createSession()));
    expect(backToTitle(racing)).toBe(racing);
  });

  it('does abandon a round when the player explicitly quits out of it', () => {
    const racing = startRound(openLineup(createSession()));
    const state = abandonSession(racing);
    expect(state.phase).toBe('title');
    expect(state.roundNumber).toBe(0);
  });
});

describe('transitions asked for from the wrong screen', () => {
  it('ignores a second start, so a held key cannot double-start a round', () => {
    const racing = startRound(openLineup(createSession()));
    expect(startRound(racing)).toBe(racing);
  });

  it('ignores a round result when no round is being driven', () => {
    const title = createSession();
    expect(endRound(title, 0)).toBe(title);
  });

  it('ignores the scoreboard clock everywhere but the scoreboard', () => {
    const title = createSession();
    expect(tickIntermission(title, 5000)).toBe(title);
    expect(skipIntermission(title)).toBe(title);
  });

  it('ignores a rematch that is not asked for from the winner screen', () => {
    const title = createSession();
    expect(rematch(title)).toBe(title);
  });
});

describe('scoring', () => {
  it('accepts an explicit delta per player, including a losing one', () => {
    let state = startRound(openLineup(createSession()));
    state = applyRoundResult(state, [2, -1], 0);
    expect(state.scores).toEqual([2, -1]);
    expect(state.phase).toBe('intermission');
  });

  it('rejects a result that does not name every player', () => {
    const racing = startRound(openLineup(createSession()));
    expect(() => applyRoundResult(racing, [1], 0)).toThrow(RangeError);
  });

  it('names the player in front', () => {
    const state = playRound(openLineup(createSession()), 1);
    expect(leaderIndex(state)).toBe(1);
  });

  it('refuses a session that nobody can win or that nobody can play', () => {
    expect(() => createSession({ target: 0 })).toThrow(RangeError);
    expect(() => createSession({ playerCount: 1 })).toThrow(RangeError);
  });
});

describe('navigation', () => {
  it('has a screen for every phase a session can be in', () => {
    let state = openLineup(createSession({ target: 1 }));
    const seen = new Set<string>([
      sceneForPhase(createSession().phase),
      sceneForPhase(state.phase),
    ]);
    state = startRound(state);
    seen.add(sceneForPhase(state.phase));

    const scoreboard = applyRoundResult(state, [0, 0], 0);
    seen.add(sceneForPhase(scoreboard.phase));
    seen.add(sceneForPhase(endRound(state, 0).phase));

    expect(seen.size).toBe(Object.keys(PHASE_SCENES).length);
    expect([...seen].every((key) => key.length > 0)).toBe(true);
  });

  it('leaves the handling lab back onto the screen the session is still on', () => {
    const title = createSession();
    expect(sceneAfterLab(title.phase)).toBe(SCENE_KEYS.title);

    // Opened from the round stand-in, which is where a player following the menus meets it.
    const racing = startRound(openLineup(title));
    expect(sceneAfterLab(racing.phase)).toBe(SCENE_KEYS.round);
  });

  it('never shows the handling lab as a phase, because it is a workshop and not a mode', () => {
    expect(Object.values(PHASE_SCENES)).not.toContain(SCENE_KEYS.feelLab);
  });
});
