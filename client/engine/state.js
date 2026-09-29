/**
 * client/engine/state.js
 * Responsibility: Mumen (Core Game Engine)
 *
 * Racing match state machine, car snapshots, checkpoints, perks, and hazards.
 */

export const MatchState = {
  LOBBY: 'LOBBY',
  READY: 'READY', // Waiting for player to press K to rev up / start countdown
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER'
};

export class GameState {
  constructor() {
    this.status = MatchState.LOBBY;
    this.countdownTimer = 2.70; // Pre-race countdown matching arcade audio track (2.7s to GO)
    this.roundTimer = 0; // Elapsed match time in seconds
    this.totalLaps = 3;
    this.players = new Map(); // id -> car object
    this.itemBoxes = []; // mystery boxes
    this.hazards = []; // dropped oil slicks
    this.projectiles = []; // active fired missiles
    this.pausedBy = null;
    this.winner = null;
  }

  setStatus(newStatus) {
    this.status = newStatus;
  }

  /**
   * Produce an immutable/isolated snapshot of current racing state
   */
  getSnapshot() {
    return {
      status: this.status,
      countdownTimer: this.countdownTimer,
      roundTimer: this.roundTimer,
      totalLaps: this.totalLaps,
      pausedBy: this.pausedBy,
      winner: this.winner,
      players: Array.from(this.players.values()).map((p) => ({ ...p })),
      itemBoxes: this.itemBoxes.map((b) => ({ ...b })),
      hazards: this.hazards.map((h) => ({ ...h })),
      projectiles: this.projectiles.map((m) => ({ ...m }))
    };
  }

  /**
   * Produce a zero-allocation view of current racing state for local 60 FPS rendering
   */
  getRenderView() {
    return {
      status: this.status,
      countdownTimer: this.countdownTimer,
      roundTimer: this.roundTimer,
      totalLaps: this.totalLaps,
      pausedBy: this.pausedBy,
      winner: this.winner,
      players: this.players,
      itemBoxes: this.itemBoxes,
      hazards: this.hazards,
      projectiles: this.projectiles
    };
  }

  /**
   * Reset game state for a new race
   */
  reset() {
    this.status = MatchState.LOBBY;
    this.countdownTimer = 2.70;
    this.roundTimer = 0;
    this.pausedBy = null;
    this.winner = null;
    this.hazards = [];
    this.projectiles = [];
  }
}
