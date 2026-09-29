/**
 * client/ui/hud.js
 * Responsibility: Ville (Assets, Audio, Controls & In-Game UI)
 *
 * Retro racing HUD:
 * - Lap counter and Race position in the top center
 * - Player name and perk slot placeholder in the top right
 * - Round timer and FPS counter on the left
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';
import { getActiveTrack, getTrackSvgPath } from '../engine/track.js';

export class HudUI extends BaseModule {
  constructor() {
    super('HudUI');
    this.hudContainer = null;
    this.timerElement = null;
    this.lapElement = null;
    this.placeElement = null;
    this.playerBadgeElement = null;
    this.perkSlotElement = null;
    this.gameOverElement = null;
    this.lastTimerText = '';
    this.localPlayerId = 'player-1';

    this.minimapBlipsContainer = null;
    this.minimapBlips = new Map();
    this.currentTrack = null;
  }

  setTrack(track) {
    this.currentTrack = track;
    const svg = document.getElementById('minimap-svg');
    const bgPath = document.getElementById('minimap-track-bg');
    const linePath = document.getElementById('minimap-track-line');
    const pathD = track.svgPath || getTrackSvgPath(track.waypoints);

    if (svg) {
      svg.setAttribute('viewBox', `0 0 ${track.width} ${track.height}`);
    }
    if (bgPath) bgPath.setAttribute('d', pathD);
    if (linePath) linePath.setAttribute('d', pathD);

    if (this.minimapBlipsContainer) {
      this.minimapBlipsContainer.innerHTML = '';
      this.minimapBlips.clear();
    }
  }

  init(context) {
    super.init(context);
    this.hudContainer = document.getElementById('hud-container');
    this.timerElement = document.getElementById('hud-timer');
    this.lapElement = document.getElementById('hud-lap');
    this.placeElement = document.getElementById('hud-place');
    this.playerBadgeElement = document.getElementById('hud-player-badge');
    this.perkSlotElement = document.getElementById('hud-perk-slot');
    this.gameOverElement = document.getElementById('game-over-modal');
    this.leaderboardContainer = document.getElementById('hud-leaderboard');
    this.leaderboardList = document.getElementById('leaderboard-list');

    // Initialize track line on the minimap
    const activeTrack = getActiveTrack();
    const svg = document.getElementById('minimap-svg');
    const pathD = activeTrack.svgPath || getTrackSvgPath(activeTrack.waypoints);
    const bgPath = document.getElementById('minimap-track-bg');
    const linePath = document.getElementById('minimap-track-line');
    if (svg) svg.setAttribute('viewBox', `0 0 ${activeTrack.width} ${activeTrack.height}`);
    if (bgPath) bgPath.setAttribute('d', pathD);
    if (linePath) linePath.setAttribute('d', pathD);
    this.minimapBlipsContainer = document.getElementById('minimap-blips');

    // Subscribe to race standing updates (lap, position)
    this.subscribe(EventType.RACE_POSITION_UPDATED, (standings) => {
      this.updateRaceInfo(standings);
    });
    this.subscribe(EventType.LOCAL_PLAYER_CHANGED, (playerId) => {
      this.localPlayerId = playerId;
    });

    // Subscribe to game state changes to toggle leaderboard visibility
    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      if (this.leaderboardContainer) {
        this.leaderboardContainer.style.display = (status === 'LOBBY' || status === 'GAME_OVER') ? 'none' : 'block';
      }
    });

    // Subscribe to perk collection
    this.subscribe(EventType.ITEM_COLLECTED, (data) => {
      this.updatePerkDisplay(data.perk);
    });

    // Subscribe to timer ticks (throttled to 1Hz)
    this.subscribe(EventType.TIMER_TICK, (secondsElapsed) => {
      this.updateTimer(secondsElapsed);
    });

    // Subscribe to match finish
    this.subscribe(EventType.MATCH_ENDED, (result) => {
      this.showGameOver(result);
    });
  }

  update(deltaTime, snapshot) {
    // Only render minimap during onRender (deltaTime === 0) to avoid duplicate work during fixedUpdate
    if (deltaTime === 0 && snapshot && snapshot.players) {
      this.updateMinimap(snapshot.players);
    }
  }

  updateMinimap(players) {
    if (!this.minimapBlipsContainer) {
      this.minimapBlipsContainer = document.getElementById('minimap-blips');
    }
    if (!this.minimapBlipsContainer || !players) return;

    // Support both Map (from getRenderView()) and Array (from getSnapshot())
    const playerList = players instanceof Map ? Array.from(players.values()) : (Array.isArray(players) ? players : Object.values(players));

    const activeIds = new Set();
    for (const car of playerList) {
      if (!car || !car.id) continue;
      activeIds.add(car.id);
      let record = this.minimapBlips.get(car.id);
      const isLocal = car.id === this.localPlayerId;
      const color = car.color || (isLocal ? '#dc2626' : '#3b82f6');

      if (!record) {
        const blip = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        this.minimapBlipsContainer.appendChild(blip);
        record = {
          el: blip,
          isLocal,
          color,
          lastX: -9999,
          lastY: -9999
        };
        this.minimapBlips.set(car.id, record);

        if (isLocal) {
          blip.setAttribute('r', '36');
          blip.setAttribute('fill', color);
          blip.setAttribute('stroke', '#ffffff');
          blip.setAttribute('stroke-width', '8');
        } else {
          blip.setAttribute('r', '28');
          blip.setAttribute('fill', color);
          blip.setAttribute('stroke', '#0f172a');
          blip.setAttribute('stroke-width', '6');
        }
      } else if (record.isLocal !== isLocal || record.color !== color) {
        record.isLocal = isLocal;
        record.color = color;
        if (isLocal) {
          record.el.setAttribute('r', '36');
          record.el.setAttribute('fill', color);
          record.el.setAttribute('stroke', '#ffffff');
          record.el.setAttribute('stroke-width', '8');
        } else {
          record.el.setAttribute('r', '28');
          record.el.setAttribute('fill', color);
          record.el.setAttribute('stroke', '#0f172a');
          record.el.setAttribute('stroke-width', '6');
        }
      }

      if (typeof car.x === 'number' && typeof car.y === 'number') {
        if (Math.abs(car.x - record.lastX) > 0.4 || Math.abs(car.y - record.lastY) > 0.4) {
          record.lastX = car.x;
          record.lastY = car.y;
          record.el.setAttribute('cx', car.x.toFixed(1));
          record.el.setAttribute('cy', car.y.toFixed(1));
        }
      }
    }

    for (const [id, record] of this.minimapBlips.entries()) {
      if (!activeIds.has(id)) {
        if (record.el && record.el.parentNode) {
          record.el.parentNode.removeChild(record.el);
        }
        this.minimapBlips.delete(id);
      }
    }
  }

  updateTimer(seconds) {
    if (!this.timerElement) return;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formatted = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    if (this.lastTimerText !== formatted) {
      this.lastTimerText = formatted;
      this.timerElement.textContent = formatted;
    }
  }

  updateRaceInfo(standings) {
    if (!Array.isArray(standings) || standings.length === 0) return;

    const playerStanding = standings.find((s) => s.id === this.localPlayerId) || standings[0];

    // Update Top Center: Place & Lap
    if (this.placeElement && this.placeElement.textContent !== playerStanding.position) {
      this.placeElement.textContent = playerStanding.position;
    }

    if (this.lapElement) {
      const lapText = `Lap ${playerStanding.lap}/${playerStanding.totalLaps}`;
      if (this.lapElement.textContent !== lapText) {
        this.lapElement.textContent = lapText;
      }
    }

    // Update Top Right: Player Name
    if (this.playerBadgeElement && this.playerBadgeElement.textContent !== playerStanding.nickname) {
      this.playerBadgeElement.textContent = playerStanding.nickname;
    }

    // Update Perk slot placeholder
    if (playerStanding.perk !== undefined) {
      this.updatePerkDisplay(playerStanding.perk);
    }

    // Update Live Leaderboard (All Opponents Standings & Laps in Real-Time)
    if (this.leaderboardList) {
      this.leaderboardList.innerHTML = '';
      for (const s of standings) {
        const row = document.createElement('li');
        row.className = s.id === this.localPlayerId ? 'leaderboard-row local-player' : 'leaderboard-row';
        row.innerHTML = `
          <span class="leaderboard-pos">${s.position}</span>
          <span class="leaderboard-name">${s.nickname}</span>
          <span class="leaderboard-lap">L${s.lap}/${s.totalLaps}</span>
        `;
        this.leaderboardList.appendChild(row);
      }
    }
  }

  updatePerkDisplay(perk) {
    if (!this.perkSlotElement) return;
    if (!perk) {
      this.perkSlotElement.textContent = 'Item: [ Empty ]';
      this.perkSlotElement.className = 'hud-perk-badge empty';
    } else if (perk === 'UFO') {
      this.perkSlotElement.textContent = 'Item: [ UFO BEAM ] - Space';
      this.perkSlotElement.className = 'hud-perk-badge active ufo';
    } else {
      const label = perk.toUpperCase();
      this.perkSlotElement.textContent = `Item: [ ${label} ] - Space`;
      this.perkSlotElement.className = `hud-perk-badge active perk-${perk}`;
    }
  }

  showGameOver(result) {
    if (this.gameOverElement) {
      const winnerEl = document.getElementById('game-over-winner');
      if (winnerEl) {
        winnerEl.textContent = result && result.winner ? `Winner: ${result.winner}!` : 'Race Finished!';
      }
      this.gameOverElement.style.display = 'flex';
    }
  }

  destroy() {
    super.destroy();
    for (const blip of this.minimapBlips.values()) {
      blip.remove();
    }
    this.minimapBlips.clear();
  }
}
