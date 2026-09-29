/**
 * server/server.js
 * Responsibility: Rene (Multiplayer Networking & Lobby)
 *
 * Lightweight Node.js HTTP static server & WebSocket relay server.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const PORT = process.env.PORT || 8080;

const roomManager = new RoomManager();

// Simple static file HTTP server for the client directory
const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(parsedUrl.pathname);
  let filePath = path.join(CLIENT_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  const extname = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
    }
  });
});

// WebSocket Server for multiplayer communication
const wss = new WebSocketServer({ server });

function send(ws, type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function sendError(ws, message) {
  send(ws, 'ERROR', { message });
}

function broadcastRoom(roomId, type, payload) {
  for (const client of wss.clients) {
    if (client.roomId === roomId) send(client, type, payload);
  }
}

function joinRoom(ws, room) {
  ws.roomId = room.id;
  send(ws, 'ROOM_JOINED', { room, playerId: ws.playerId });
  broadcastRoom(room.id, 'ROOM_UPDATED', room);
}

function leaveCurrentRoom(ws, notifyPlayer = true) {
  const roomId = ws.roomId;
  if (!roomId) return;

  const result = roomManager.leaveRoom(ws.playerId);
  ws.roomId = null;
  if (!result) return;

  if (notifyPlayer) send(ws, 'ROOM_LEFT', { roomId });
  if (result.room) {
    if (result.player) {
      broadcastRoom(roomId, 'CHAT_MESSAGE', {
        sender: 'Race Control',
        text: `${result.player.nickname} has left the race.`,
        isSystem: true
      });
      broadcastRoom(roomId, 'PLAYER_ACTION_BROADCAST', `${result.player.nickname} has left the race.`);
    }
    if (result.resumed) broadcastRoom(roomId, 'GAME_RESUMED', {});
    if (result.hostChanged || result.room.status === 'LOBBY') {
      broadcastRoom(roomId, 'RETURN_TO_ROOM', result.room);
    } else {
      broadcastRoom(roomId, 'ROOM_UPDATED', result.room);
    }
  }
}

wss.on('connection', (ws) => {
  ws.playerId = randomUUID();
  ws.roomId = null;

  ws.on('message', (data) => {
    try {
      const { type, payload = {} } = JSON.parse(data.toString());

      if (type === 'ROOM_CREATE') {
        leaveCurrentRoom(ws);
        joinRoom(ws, roomManager.createRoom(
          ws.playerId,
          payload.nickname,
          payload.trackId,
          payload.carModel,
          payload.color,
          payload.totalLaps
        ));
        return;
      }

      if (type === 'ROOM_JOIN') {
        leaveCurrentRoom(ws);
        const result = roomManager.joinRoom(
          payload.roomId,
          ws.playerId,
          payload.nickname,
          payload.carModel,
          payload.color
        );
        if (!result.success) return sendError(ws, result.error);
        joinRoom(ws, result.room);
        return;
      }

      if (!ws.roomId || roomManager.getPlayerRoom(ws.playerId) !== ws.roomId) {
        return sendError(ws, 'Join a room first.');
      }

      if (type === 'PLAYER_CUSTOMIZE') {
        const room = roomManager.updatePlayer(ws.playerId, payload);
        if (room) broadcastRoom(ws.roomId, 'ROOM_UPDATED', room);
      } else if (type === 'TOGGLE_READY') {
        const room = roomManager.updatePlayer(ws.playerId, { isReady: payload.isReady });
        if (room) broadcastRoom(ws.roomId, 'ROOM_UPDATED', room);
      } else if (type === 'UPDATE_SETTINGS') {
        const room = roomManager.updateSettings(ws.playerId, payload);
        if (room) broadcastRoom(ws.roomId, 'ROOM_UPDATED', room);
      } else if (type === 'GAME_START') {
        const result = roomManager.startRoom(ws.roomId, ws.playerId);
        if (!result.success) return sendError(ws, result.error);
        broadcastRoom(ws.roomId, 'GAME_STARTED', result.room);
      } else if (type === 'PAUSE_REQUEST') {
        const result = roomManager.pauseRoom(ws.roomId, ws.playerId);
        if (!result.success) return sendError(ws, result.error);
        const player = result.room.players.find((p) => p.id === ws.playerId);
        const pauserNickname = player ? player.nickname : 'Another driver';
        broadcastRoom(ws.roomId, 'GAME_PAUSED', { pausedBy: ws.playerId, pauserNickname });
      } else if (type === 'RESUME_REQUEST') {
        const result = roomManager.resumeRoom(ws.roomId, ws.playerId);
        if (!result.success) return sendError(ws, result.error);
        broadcastRoom(ws.roomId, 'GAME_RESUMED', {});
      } else if (type === 'RETURN_TO_ROOM') {
        const res = roomManager.returnToRoom(ws.roomId, ws.playerId);
        if (res && res.success) {
          if (res.hostReturn) {
            broadcastRoom(ws.roomId, 'RETURN_TO_ROOM', res.room);
          } else {
            broadcastRoom(ws.roomId, 'PLAYER_RETIRED', { playerId: res.retiredPlayerId });
            broadcastRoom(ws.roomId, 'ROOM_UPDATED', res.room);
            send(ws, 'RETURN_TO_ROOM', res.room);
          }
        }
      } else if (type === 'RESTART_VOTE_START') {
        const res = roomManager.initiateRestartVote(ws.roomId, ws.playerId);
        if (res.success) {
          broadcastRoom(ws.roomId, 'RESTART_VOTE_INITIATED', res.vote);
        } else {
          sendError(ws, res.error);
        }
      } else if (type === 'RESTART_VOTE_CAST') {
        const res = roomManager.castRestartVote(ws.roomId, ws.playerId, payload.vote);
        if (res.resolved) {
          if (res.passed) {
            broadcastRoom(ws.roomId, 'MATCH_RESTARTED', res.room);
          } else {
            broadcastRoom(ws.roomId, 'RESTART_VOTE_FAILED', { reason: 'Majority rejected restart.' });
          }
        } else if (res.vote) {
          broadcastRoom(ws.roomId, 'RESTART_VOTE_UPDATE', res.vote);
        }
      } else if (type === 'QUIT_REQUEST') {
        leaveCurrentRoom(ws);
      } else if (type === 'LEAVE_ROOM') {
        leaveCurrentRoom(ws);
      } else if (type === 'INPUT_DELTA') {
        const input = {
          gas: Boolean(payload.gas),
          brake: Boolean(payload.brake),
          steer: Math.max(-1, Math.min(1, Number(payload.steer) || 0)),
          action: Boolean(payload.action)
        };
        broadcastRoom(ws.roomId, 'PLAYER_INPUT', { playerId: ws.playerId, input });
      } else if (type === 'STATE_SNAPSHOT') {
        const room = roomManager.getRoom(ws.roomId);
        if (!room || room.hostId !== ws.playerId || room.status !== 'PLAYING') return;
        broadcastRoom(ws.roomId, 'STATE_SNAPSHOT', payload);
      } else if (type === 'CHAT_MESSAGE') {
        const room = roomManager.getRoom(ws.roomId);
        if (!room) return;
        const player = room.players.get(ws.playerId);
        const text = String(payload.text || '').trim().slice(0, 240);
        if (text && player) {
          broadcastRoom(ws.roomId, 'CHAT_MESSAGE', { sender: player.nickname, text, playerId: ws.playerId });
        }
      }
    } catch (error) {
      console.error('Invalid WebSocket message received:', error);
      sendError(ws, 'The server could not read that message.');
    }
  });

  ws.on('close', () => {
    leaveCurrentRoom(ws, false);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
