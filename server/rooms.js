/**
 * server/rooms.js
 * Responsibility: Rene (Multiplayer Networking & Lobby)
 *
 * Room and session state management for 2 to 4 player matches.
 */

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.playerRooms = new Map();
  }

  /**
   * Create a new room with a unique room ID
   * @param {string} hostSocketId - ID of the creating player (lead/host)
   * @returns {object} Created room metadata
   */
  createRoom(hostSocketId, nickname, trackId = 'grandprix', carModel = 1, color = '#dc2626', totalLaps = 3) {
    let roomId;
    do {
      roomId = Math.random().toString(36).slice(2, 7).toUpperCase();
    } while (this.rooms.has(roomId));

    const parsedLaps = Number(totalLaps);
    const validLaps = Number.isFinite(parsedLaps) ? Math.max(1, Math.min(10, parsedLaps)) : 3;

    const room = {
      id: roomId,
      hostId: hostSocketId,
      trackId: trackId || 'grandprix',
      npcCount: 0,
      totalLaps: validLaps,
      players: new Map(),
      status: 'LOBBY',
      maxPlayers: 4,
      pausedBy: null,
      restartVote: null
    };

    room.players.set(hostSocketId, {
      id: hostSocketId,
      nickname: this.cleanNickname(nickname) || 'Host',
      carModel: Math.min(3, Math.max(1, Number(carModel) || 1)),
      color: color || '#dc2626',
      isReady: true,
      inMatch: false
    });

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostSocketId, roomId);
    return this.toPublicRoom(room);
  }

  /**
   * Join an existing room
   * @param {string} roomId
   * @param {string} socketId
   * @param {string} nickname
   * @returns {object} Join result { success: boolean, error?: string, room?: object }
   */
  joinRoom(roomId, socketId, nickname, carModel = 2, color = '#2563eb') {
    const targetRoomId = String(roomId || '').trim().toUpperCase();
    const room = this.rooms.get(targetRoomId);
    if (!room) return { success: false, error: 'Room not found.' };
    if (room.status !== 'LOBBY') return { success: false, error: 'This race has already started.' };
    if (room.players.size >= room.maxPlayers) return { success: false, error: 'This room is full.' };

    const colors = ['#2563eb', '#15803d', '#eab308', '#9333ea', '#dc2626'];
    const assignedColor = color || colors[(room.players.size) % colors.length];

    let assignedNick = this.cleanNickname(nickname) || `Racer ${room.players.size + 1}`;
    const existingNicks = new Set([...room.players.values()].map((p) => p.nickname.toLowerCase()));
    if (existingNicks.has(assignedNick.toLowerCase())) {
      let counter = 2;
      let candidate = `${assignedNick} ${counter}`;
      while (existingNicks.has(candidate.toLowerCase())) {
        counter++;
        candidate = `${assignedNick} ${counter}`;
      }
      assignedNick = candidate;
    }

    room.players.set(socketId, {
      id: socketId,
      nickname: assignedNick,
      carModel: Math.min(3, Math.max(1, Number(carModel) || 2)),
      color: assignedColor,
      isReady: false,
      inMatch: false
    });

    // Adjust NPC count if total would exceed 4
    if (room.players.size + room.npcCount > 4) {
      room.npcCount = Math.max(0, 4 - room.players.size);
    }

    this.playerRooms.set(socketId, room.id);
    return { success: true, room: this.toPublicRoom(room) };
  }

  /**
   * Update a player's customization (nickname, car model, color) or ready flag
   */
  updatePlayer(socketId, updates = {}) {
    const roomId = this.playerRooms.get(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const player = room.players.get(socketId);
    if (!player) return null;

    if (updates.nickname !== undefined) {
      player.nickname = this.cleanNickname(updates.nickname) || player.nickname;
    }
    if (updates.carModel !== undefined) {
      player.carModel = Math.min(3, Math.max(1, Number(updates.carModel) || 1));
    }
    if (updates.color !== undefined && typeof updates.color === 'string') {
      player.color = updates.color;
    }
    if (updates.isReady !== undefined) {
      player.isReady = Boolean(updates.isReady);
    }

    return this.toPublicRoom(room);
  }

  /**
   * Update room settings (track, NPC count) - Host only
   */
  updateSettings(socketId, { trackId, npcCount, totalLaps }) {
    const roomId = this.playerRooms.get(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.hostId !== socketId) return null;

    if (trackId !== undefined) {
      room.trackId = trackId;
    }
    if (npcCount !== undefined) {
      const maxNpc = Math.max(0, 4 - room.players.size);
      room.npcCount = Math.max(0, Math.min(maxNpc, Number(npcCount) || 0));
    }
    if (totalLaps !== undefined) {
      const parsed = Number(totalLaps);
      room.totalLaps = Number.isFinite(parsed) ? Math.max(1, Math.min(10, parsed)) : 3;
    }

    return this.toPublicRoom(room);
  }

  /**
   * Remove a player from their room
   * @param {string} socketId
   * @returns {object|null} Updated room or null if room dissolved
   */
  leaveRoom(socketId) {
    const roomId = this.playerRooms.get(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const player = room.players.get(socketId);
    const resumed = room.status === 'PAUSED' && room.pausedBy === socketId;
    room.players.delete(socketId);
    this.playerRooms.delete(socketId);

    if (resumed) {
      room.status = 'PLAYING';
      room.pausedBy = null;
    }

    if (room.players.size === 0) {
      this.rooms.delete(roomId);
      return { roomId, player, room: null, closed: true, resumed, hostChanged: false };
    }

    const wasHost = room.hostId === socketId;
    if (wasHost) {
      room.hostId = room.players.keys().next().value;
      const newHost = room.players.get(room.hostId);
      if (newHost) newHost.isReady = true;
    }

    // If host left or if no remaining players are in match, reset room to LOBBY
    const anyInMatch = [...room.players.values()].some((p) => p.inMatch);
    if (wasHost || !anyInMatch) {
      room.status = 'LOBBY';
      room.pausedBy = null;
      room.restartVote = null;
      for (const p of room.players.values()) {
        p.inMatch = false;
        if (p.id === room.hostId) p.isReady = true;
      }
    }

    // If only 1 real player remains and npcCount is 0, default to 1 NPC so race can start
    if (room.players.size === 1 && (!room.npcCount || room.npcCount === 0)) {
      room.npcCount = 1;
    }

    return { roomId, player, room: this.toPublicRoom(room), closed: false, resumed, hostChanged: wasHost };
  }

  /**
   * Get room by ID
   * @param {string} roomId
   */
  getRoom(roomId) {
    return this.rooms.get(String(roomId || '').toUpperCase()) || null;
  }

  startRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found.' };
    if (room.hostId !== socketId) return { success: false, error: 'Only the room creator can start the race.' };
    if (room.status !== 'LOBBY') return { success: false, error: 'The race has already started.' };

    const pub = this.toPublicRoom(room);
    if (pub.hasDuplicateNames) {
      return { success: false, error: 'Each driver must have a unique name before starting.' };
    }

    for (const player of room.players.values()) {
      if (!player.isReady) {
        return { success: false, error: `${player.nickname} is not ready yet.` };
      }
    }

    if (room.players.size === 1 && (!room.npcCount || room.npcCount === 0)) {
      room.npcCount = 1;
    }

    const totalCars = room.players.size + room.npcCount;
    if (totalCars < 2) {
      return { success: false, error: 'At least two cars (players or NPCs) are needed to start.' };
    }

    room.status = 'PLAYING';
    for (const player of room.players.values()) {
      player.inMatch = true;
    }

    return { success: true, room: this.toPublicRoom(room) };
  }

  pauseRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room || room.status !== 'PLAYING') return { success: false, error: 'The race is not running.' };
    if (room.pausedBy) return { success: false, error: 'The race is already paused.' };

    room.status = 'PAUSED';
    room.pausedBy = socketId;
    return { success: true, room: this.toPublicRoom(room) };
  }

  resumeRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room || room.status !== 'PAUSED') return { success: false, error: 'The race is not paused.' };
    if (room.pausedBy !== socketId) return { success: false, error: 'Only the player who paused can resume.' };

    room.status = 'PLAYING';
    room.pausedBy = null;
    return { success: true, room: this.toPublicRoom(room) };
  }

  returnToRoom(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found.' };

    if (room.hostId === socketId) {
      // Host returns everyone to room
      room.status = 'LOBBY';
      room.pausedBy = null;
      room.restartVote = null;
      for (const player of room.players.values()) {
        player.inMatch = false;
        player.isReady = player.id === room.hostId;
      }
      if (room.players.size === 1 && (!room.npcCount || room.npcCount === 0)) {
        room.npcCount = 1;
      }
      return { success: true, hostReturn: true, room: this.toPublicRoom(room) };
    } else {
      // Non-host player leaves match and waits in room
      const player = room.players.get(socketId);
      if (player) {
        player.inMatch = false;
        player.isReady = false;
      }
      const anyInMatch = [...room.players.values()].some((p) => p.inMatch);
      if (!anyInMatch) {
        room.status = 'LOBBY';
        room.pausedBy = null;
        room.restartVote = null;
        const hostPlayer = room.players.get(room.hostId);
        if (hostPlayer) hostPlayer.isReady = true;
      }
      if (room.players.size === 1 && (!room.npcCount || room.npcCount === 0)) {
        room.npcCount = 1;
      }
      return { success: true, hostReturn: !anyInMatch, room: this.toPublicRoom(room), retiredPlayerId: socketId };
    }
  }

  initiateRestartVote(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return { success: false, error: 'Room not found.' };
    const initiator = room.players.get(socketId);
    if (!initiator) return { success: false, error: 'Player not found.' };

    if (room.players.size <= 1) {
      return { success: false, error: 'Cannot initiate a restart vote with only one player.' };
    }

    if (room.restartVote && room.restartVote.expiresAt > Date.now()) {
      return { success: false, error: 'A restart vote is already in progress.', vote: room.restartVote };
    }

    const votes = {};
    votes[socketId] = true;

    room.restartVote = {
      initiatorId: socketId,
      initiatorName: initiator.nickname,
      votes,
      totalPlayers: room.players.size,
      expiresAt: Date.now() + 15000
    };

    return { success: true, vote: room.restartVote };
  }

  castRestartVote(roomId, socketId, vote) {
    const room = this.getRoom(roomId);
    if (!room || !room.restartVote) return { success: false, error: 'No active restart vote.' };

    room.restartVote.votes[socketId] = Boolean(vote);
    const votesList = Object.values(room.restartVote.votes);
    const yesCount = votesList.filter((v) => v === true).length;
    const noCount = votesList.filter((v) => v === false).length;
    const total = room.players.size;
    const needed = Math.floor(total / 2) + 1; // Strict majority (> 50%)

    if (yesCount >= needed) {
      room.restartVote = null;
      room.status = 'PLAYING';
      room.pausedBy = null;
      return { resolved: true, passed: true, room: this.toPublicRoom(room) };
    }

    if (noCount > total - needed || votesList.length === total) {
      room.restartVote = null;
      return { resolved: true, passed: false, room: this.toPublicRoom(room) };
    }

    return { resolved: false, vote: room.restartVote };
  }

  getPlayerRoom(socketId) {
    return this.playerRooms.get(socketId) || null;
  }

  cleanNickname(nickname) {
    const cleaned = String(nickname || '').trim().replace(/[<>]/g, '').slice(0, 15);
    return cleaned;
  }

  toPublicRoom(room) {
    const playersList = [...room.players.values()].map((p) => ({ ...p }));
    const nameCounts = new Map();
    for (const p of playersList) {
      const lower = p.nickname.toLowerCase();
      nameCounts.set(lower, (nameCounts.get(lower) || 0) + 1);
    }

    const duplicateNames = [];
    for (const [name, count] of nameCounts.entries()) {
      if (count > 1) duplicateNames.push(name);
    }

    return {
      id: room.id,
      hostId: room.hostId,
      trackId: room.trackId || 'grandprix',
      npcCount: room.npcCount || 0,
      totalLaps: room.totalLaps || 3,
      players: playersList,
      hasDuplicateNames: duplicateNames.length > 0,
      duplicateNames,
      status: room.status,
      maxPlayers: room.maxPlayers,
      pausedBy: room.pausedBy,
      restartVote: room.restartVote ? {
        initiatorId: room.restartVote.initiatorId,
        initiatorName: room.restartVote.initiatorName,
        expiresAt: room.restartVote.expiresAt,
        yesCount: Object.values(room.restartVote.votes).filter((v) => v === true).length,
        totalPlayers: room.players.size
      } : null
    };
  }
}
