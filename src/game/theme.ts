/**
 * SHUNT's visual identity: hazard tape on wet asphalt.
 *
 * The load-bearing decision is that the four player colours ARE the palette. Four cars share one
 * screen at low zoom, so telling players apart is a hard functional requirement rather than
 * styling, and the brand is built out of the thing the game already has to solve. Red belongs to
 * the eliminator alone and is never a player colour.
 */

export const PALETTE = {
  asphalt: 0x0a0b0d,
  panel: 0x131519,
  line: 0x2c313a,
  text: 0xe9ebee,
  dim: 0x98a0ab,

  /** The eliminator. Never used for a car. */
  danger: 0xff3b1f,

  player1: 0xffd200,
  player2: 0x00d9ff,
  player3: 0xff2d78,
  player4: 0x8cff36,
} as const;

export const PLAYER_COLOURS = [
  PALETTE.player1,
  PALETTE.player2,
  PALETTE.player3,
  PALETTE.player4,
] as const;

export const CSS = {
  asphalt: '#0a0b0d',
  panel: '#131519',
  panelRaised: '#1a1d22',
  line: '#2c313a',
  lineBright: '#3a414c',
  text: '#e9ebee',
  dim: '#98a0ab',
  dimmer: '#6a727d',
  hazard: '#ffd200',
  hazardDim: '#8a7300',
  danger: '#ff3b1f',
  ok: '#8cff36',
  displayFont: '"Arial Narrow", "Helvetica Neue", system-ui, sans-serif',
  monoFont: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;
