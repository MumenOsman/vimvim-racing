/**
 * client/network/client.js
 * Responsibility: Rene (Multiplayer Networking & Lobby)
 *
 * WebSocket network client wrapper for room joining, synchronization, and event transport.
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';

export class NetworkClient extends BaseModule {
  constructor(serverUrl) {
    super('NetworkClient');
    this.serverUrl = serverUrl || `ws://${window.location.host}`;
    this.socket = null;
    this.isConnected = false;
    this.playerId = null;
    this.roomId = null;
    this.pendingMessages = [];
  }

  init(context) {
    super.init(context);

    // Listen for input changes from InputManager to broadcast
    this.subscribe(EventType.INPUT_CHANGED, (inputVector) => {
      if (this.roomId) this.send('INPUT_DELTA', inputVector);
    });

    // Listen for pause/resume/quit requests to broadcast to server
    this.subscribe(EventType.PAUSE_REQUESTED, () => {
      this.send('PAUSE_REQUEST', {});
    });

    this.subscribe(EventType.RESUME_REQUESTED, () => {
      this.send('RESUME_REQUEST', {});
    });
    this.subscribe(EventType.QUIT_REQUESTED, () => {
      if (this.roomId) this.send('LEAVE_ROOM', {});
    });

    this.subscribe(EventType.ROOM_CREATE_REQUESTED, (payload) => {
      this.request('ROOM_CREATE', payload);
    });
    this.subscribe(EventType.ROOM_JOIN_REQUESTED, (payload) => {
      this.request('ROOM_JOIN', payload);
    });
    this.subscribe(EventType.ROOM_START_REQUESTED, () => {
      this.send('GAME_START', {});
    });
    this.subscribe(EventType.CHAT_SEND_REQUESTED, (payload) => {
      if (this.roomId) this.send('CHAT_MESSAGE', payload);
    });
    this.subscribe(EventType.PLAYER_CUSTOMIZATION_UPDATED, (payload) => {
      if (this.roomId) this.send('PLAYER_CUSTOMIZE', payload);
    });
    this.subscribe(EventType.PLAYER_READY_TOGGLED, (payload) => {
      if (this.roomId) this.send('TOGGLE_READY', payload);
    });
    this.subscribe(EventType.ROOM_SETTINGS_UPDATED, (payload) => {
      if (this.roomId) this.send('UPDATE_SETTINGS', payload);
    });
    this.subscribe(EventType.RETURN_TO_ROOM_REQUESTED, () => {
      if (this.roomId) this.send('RETURN_TO_ROOM', {});
    });
    this.subscribe(EventType.RESTART_VOTE_REQUESTED, () => {
      if (this.roomId) this.send('RESTART_VOTE_START', {});
    });
    this.subscribe(EventType.RESTART_VOTE_CAST, (payload) => {
      if (this.roomId) this.send('RESTART_VOTE_CAST', payload);
    });
  }

  /**
   * Connect to WebSocket server
   */
  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.socket = new WebSocket(this.serverUrl);
    this.socket.addEventListener('open', () => {
      this.isConnected = true;
      this.eventBus.emit(EventType.NETWORK_CONNECTED, {});
      for (const message of this.pendingMessages.splice(0)) this.send(message.type, message.payload);
    });
    this.socket.addEventListener('message', (event) => {
      this.handleMessage(event.data);
    });
    this.socket.addEventListener('close', () => {
      this.isConnected = false;
      this.roomId = null;
      this.playerId = null;
      this.eventBus.emit(EventType.NETWORK_DISCONNECTED, {});
    });
    this.socket.addEventListener('error', () => {
      this.eventBus.emit(EventType.NETWORK_ERROR, { message: 'Could not connect to the game server.' });
    });
  }

  request(type, payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.send(type, payload);
      return;
    }

    this.pendingMessages.push({ type, payload });
    this.connect();
  }

  handleMessage(rawMessage) {
    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      this.eventBus.emit(EventType.NETWORK_ERROR, { message: 'The server sent an unreadable response.' });
      return;
    }

    const { type, payload } = message;
    if (type === 'ROOM_JOINED') {
      this.playerId = payload.playerId;
      this.roomId = payload.room.id;
      this.eventBus.emit(EventType.LOCAL_PLAYER_CHANGED, payload.playerId);
      this.eventBus.emit(EventType.ROOM_JOINED, payload);
    } else if (type === 'ROOM_UPDATED') {
      this.eventBus.emit(EventType.ROOM_UPDATED, payload);
    } else if (type === 'GAME_STARTED') {
      this.eventBus.emit(EventType.GAME_STARTED, payload);
    } else if (type === 'GAME_PAUSED') {
      this.eventBus.emit(EventType.GAME_PAUSED, payload);
    } else if (type === 'GAME_RESUMED') {
      this.eventBus.emit(EventType.GAME_RESUMED, payload);
    } else if (type === 'PLAYER_INPUT') {
      this.eventBus.emit(EventType.PLAYER_INPUT_RECEIVED, payload);
    } else if (type === 'STATE_SNAPSHOT') {
      this.eventBus.emit(EventType.STATE_SYNC_RECEIVED, payload);
    } else if (type === 'CHAT_MESSAGE') {
      this.eventBus.emit(EventType.CHAT_MESSAGE_RECEIVED, payload);
    } else if (type === 'ROOM_CLOSED') {
      this.roomId = null;
      this.playerId = null;
      this.eventBus.emit(EventType.ROOM_CLOSED, payload);
    } else if (type === 'ROOM_LEFT') {
      this.roomId = null;
      this.playerId = null;
      this.eventBus.emit(EventType.ROOM_LEFT, payload);
    } else if (type === 'RETURN_TO_ROOM') {
      this.eventBus.emit(EventType.ROOM_UPDATED, payload);
      this.eventBus.emit(EventType.GAME_STATE_CHANGED, 'LOBBY');
    } else if (type === 'RESTART_VOTE_INITIATED') {
      this.eventBus.emit(EventType.RESTART_VOTE_INITIATED, payload);
    } else if (type === 'RESTART_VOTE_UPDATE') {
      this.eventBus.emit(EventType.RESTART_VOTE_STATUS, payload);
    } else if (type === 'RESTART_VOTE_FAILED') {
      this.eventBus.emit(EventType.RESTART_VOTE_STATUS, { failed: true, reason: payload.reason });
    } else if (type === 'MATCH_RESTARTED') {
      this.eventBus.emit(EventType.GAME_RESTART_REQUESTED, payload);
    } else if (type === 'PLAYER_RETIRED') {
      this.eventBus.emit(EventType.PLAYER_ACTION_BROADCAST, 'A racer returned to the room.');
    } else if (type === 'ERROR') {
      this.eventBus.emit(EventType.NETWORK_ERROR, payload);
    }
  }

  /**
   * Send a JSON-serialized packet to the server
   * @param {string} type
   * @param {object} payload
   */
  send(type, payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type, payload }));
    }
  }

  destroy() {
    super.destroy();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.pendingMessages = [];
  }
}
