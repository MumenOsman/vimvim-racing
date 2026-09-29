/**
 * client/core/events.js
 * Responsibility: Mumen (Core Engine Architecture)
 *
 * Central EventBus and standardized Event Types for decoupled inter-module communication.
 */

export const EventType = {
  // Input Events (Ville -> Engine / Network)
  INPUT_CHANGED: 'INPUT_CHANGED',

  // Network Events (Rene -> Engine / UI)
  NETWORK_CONNECTED: 'NETWORK_CONNECTED',
  NETWORK_DISCONNECTED: 'NETWORK_DISCONNECTED',
  ROOM_JOINED: 'ROOM_JOINED',
  ROOM_UPDATED: 'ROOM_UPDATED',
  ROOM_LEFT: 'ROOM_LEFT',
  ROOM_CREATE_REQUESTED: 'ROOM_CREATE_REQUESTED',
  ROOM_JOIN_REQUESTED: 'ROOM_JOIN_REQUESTED',
  ROOM_START_REQUESTED: 'ROOM_START_REQUESTED',
  ROOM_CLOSED: 'ROOM_CLOSED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  GAME_STARTED: 'GAME_STARTED',
  GAME_PAUSED: 'GAME_PAUSED',
  GAME_RESUMED: 'GAME_RESUMED',
  PLAYER_INPUT_RECEIVED: 'PLAYER_INPUT_RECEIVED',
  LOCAL_PLAYER_CHANGED: 'LOCAL_PLAYER_CHANGED',
  GAME_PERMISSIONS_CHANGED: 'GAME_PERMISSIONS_CHANGED',
  STATE_SYNC_RECEIVED: 'STATE_SYNC_RECEIVED',
  CHAT_MESSAGE_RECEIVED: 'CHAT_MESSAGE_RECEIVED',
  CHAT_SEND_REQUESTED: 'CHAT_SEND_REQUESTED',
  PLAYER_CUSTOMIZATION_UPDATED: 'PLAYER_CUSTOMIZATION_UPDATED',
  PLAYER_READY_TOGGLED: 'PLAYER_READY_TOGGLED',
  ROOM_SETTINGS_UPDATED: 'ROOM_SETTINGS_UPDATED',
  RESTART_VOTE_REQUESTED: 'RESTART_VOTE_REQUESTED',
  RESTART_VOTE_INITIATED: 'RESTART_VOTE_INITIATED',
  RESTART_VOTE_CAST: 'RESTART_VOTE_CAST',
  RESTART_VOTE_STATUS: 'RESTART_VOTE_STATUS',
  RETURN_TO_ROOM_REQUESTED: 'RETURN_TO_ROOM_REQUESTED',
  HOME_REQUESTED: 'HOME_REQUESTED',

  // Match Lifecycle & State Machine (Mumen)
  GAME_STATE_CHANGED: 'GAME_STATE_CHANGED', // 'LOBBY', 'COUNTDOWN', 'PLAYING', 'PAUSED', 'GAME_OVER'
  GAME_START_REQUESTED: 'GAME_START_REQUESTED',
  GAME_RESTART_REQUESTED: 'GAME_RESTART_REQUESTED',
  TRACK_PREVIEW_CHANGED: 'TRACK_PREVIEW_CHANGED',
  COUNTDOWN_TICK: 'COUNTDOWN_TICK',
  COUNTDOWN_COMPLETED: 'COUNTDOWN_COMPLETED',

  // In-Game Menu & Overlays (Ville / Rene)
  PAUSE_REQUESTED: 'PAUSE_REQUESTED',
  RESUME_REQUESTED: 'RESUME_REQUESTED',
  QUIT_REQUESTED: 'QUIT_REQUESTED',
  PLAYER_ACTION_BROADCAST: 'PLAYER_ACTION_BROADCAST', // e.g. "Player paused the game"

  // Racing Mechanics (Mumen -> Ville HUD / Sound)
  TIMER_TICK: 'TIMER_TICK',
  LAP_COMPLETED: 'LAP_COMPLETED',
  RACE_POSITION_UPDATED: 'RACE_POSITION_UPDATED',
  ITEM_COLLECTED: 'ITEM_COLLECTED',
  HAZARD_SPAWNED: 'HAZARD_SPAWNED',
  PROJECTILE_SPAWNED: 'PROJECTILE_SPAWNED',
  CAR_SPUN_OUT: 'CAR_SPUN_OUT',
  CAR_COLLISION: 'CAR_COLLISION',
  CHECKPOINT_MISSED: 'CHECKPOINT_MISSED',
  UFO_ABDUCTION_STARTED: 'UFO_ABDUCTION_STARTED',
  UFO_ABDUCTION_COMPLETED: 'UFO_ABDUCTION_COMPLETED',
  MATCH_ENDED: 'MATCH_ENDED',

  // Sound Manager triggers (Ville)
  PLAY_SFX: 'PLAY_SFX',
  SFX_VOLUME_CHANGED: 'SFX_VOLUME_CHANGED',
  MUSIC_VOLUME_CHANGED: 'MUSIC_VOLUME_CHANGED'
};

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /**
   * Subscribe a callback to an event type
   * @param {string} eventType
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);

    return () => this.off(eventType, callback);
  }

  /**
   * Unsubscribe a callback from an event type
   * @param {string} eventType
   * @param {Function} callback
   */
  off(eventType, callback) {
    const set = this.listeners.get(eventType);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * Emit an event to all registered subscribers
   * @param {string} eventType
   * @param {any} payload
   */
  emit(eventType, payload) {
    const set = this.listeners.get(eventType);
    if (set) {
      set.forEach((callback) => {
        try {
          callback(payload);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Clear all registered listeners
   */
  clear() {
    this.listeners.clear();
  }
}
