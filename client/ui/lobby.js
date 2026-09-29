/**
 * client/ui/lobby.js
 * Responsibility: Rene (Multiplayer Networking & Lobby) & Ville (UI Design)
 *
 * Full Lifecycle Lobby Manager:
 * - Home Menu: VimVim Race Track (Solo, Multiplayer, Settings)
 * - Solo Race Setup: Car carousel, 5 colors, track carousel, NPC count selector
 * - Multiplayer Entry: Driver Nickname, Create Room, Join with Room Code
 * - Multiplayer In-Room Lobby: Vehicle customization, live player roster, duplicate name blocker, ready toggle, host start
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';
import { TRACK_CATALOG, TRACK_LIST } from '../engine/track.js';

export function getCarSpriteUrl(carModel = 1, color = '#dc2626') {
  const modelNum = Math.min(3, Math.max(1, Number(carModel) || 1));
  const cleanHex = String(color || '').replace('#', '').toLowerCase();
  const validHexes = ['dc2626', '2563eb', '15803d', 'eab308', '9333ea'];
  const finalHex = validHexes.includes(cleanHex) ? cleanHex : 'dc2626';
  return `assets/cars/car_${modelNum}_${finalHex}.png`;
}

export const CAR_MODELS = [
  { id: 1, name: 'Formula Speed' },
  { id: 2, name: 'GT Cruiser' },
  { id: 3, name: 'Hypercar' }
];

export const CAR_COLORS = ['#dc2626', '#2563eb', '#15803d', '#eab308', '#9333ea'];

export class LobbyUI extends BaseModule {
  constructor() {
    super('LobbyUI');

    // Screen containers
    this.homeMenu = null;
    this.soloMenu = null;
    this.mpMenu = null;
    this.mpRoom = null;
    this.chatContainer = null;

    // Solo selections
    this.soloCarIndex = 0;
    this.soloColor = CAR_COLORS[0];
    this.soloTrackIndex = 0;
    this.soloNpcCount = 3;
    this.soloLaps = 3;

    // Multiplayer selections
    this.mpCarIndex = 0;
    this.mpColor = CAR_COLORS[0];
    this.mpTrackIndex = 0;
    this.mpNpcCount = 0;
    this.mpLaps = 3;

    // Network / Room state
    this.currentRoom = null;
    this.localPlayerId = null;
  }

  init(context) {
    super.init(context);

    // Cache elements
    this.homeMenu = document.getElementById('home-menu');
    this.modeSelectCard = document.getElementById('mode-select-card');
    this.homeCard = document.getElementById('home-card');
    this.terminalCard = document.getElementById('terminal-card');
    this.soloMenu = document.getElementById('solo-menu');
    this.mpMenu = document.getElementById('multiplayer-menu');
    this.mpRoom = document.getElementById('multiplayer-room');
    this.chatContainer = document.getElementById('chat-container');
    this.lastInterfaceMode = 'mode_select';

    // Subscribe to network & room events
    this.subscribe(EventType.LOCAL_PLAYER_CHANGED, (id) => {
      if (id && id !== 'player-1') {
        this.localPlayerId = id;
      }
    });

    this.subscribe(EventType.ROOM_JOINED, (data) => {
      this.localPlayerId = data.playerId;
      this.currentRoom = data.room;
      this.showRoomLobby(data.room);
    });

    this.subscribe(EventType.ROOM_UPDATED, (room) => {
      this.currentRoom = room;
      this.renderRoomLobby(room);
    });

    this.subscribe(EventType.ROOM_CLOSED, (data) => {
      this.currentRoom = null;
      this.showHomeMenu();
      const statusEl = document.getElementById('mp-entry-status');
      if (statusEl) statusEl.textContent = data.reason || 'Room closed.';
    });

    this.subscribe(EventType.ROOM_LEFT, () => {
      this.currentRoom = null;
      this.showHomeMenu();
    });

    this.subscribe(EventType.NETWORK_ERROR, (err) => {
      const statusEl = document.getElementById('mp-entry-status');
      if (statusEl) statusEl.textContent = err.message || 'Network error.';
    });

    // Match state changes
    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      if (status === 'READY' || status === 'COUNTDOWN' || status === 'PLAYING') {
        this.hideAllMenus();
        if (this.chatContainer) {
          // In solo, hide chat completely; in MP, collapse chat
          if (!this.currentRoom) {
            this.chatContainer.style.display = 'none';
          } else {
            this.chatContainer.style.display = 'flex';
            this.chatContainer.classList.add('chat-collapsed');
          }
        }
      } else if (status === 'LOBBY') {
        if (this.currentRoom) {
          this.showRoomLobby(this.currentRoom);
        } else {
          this.showHomeMenu();
        }
      }
    });

    this.subscribe(EventType.HOME_REQUESTED, () => {
      this.currentRoom = null;
      this.showHomeMenu();
    });

    this.bindEvents();
    this.showHomeMenu();
  }

  bindEvents() {
    // 0. Mode Selection Controls (Initial Entry)
    const btnSelectMenu = document.getElementById('btn-select-menu');
    if (btnSelectMenu) {
      btnSelectMenu.addEventListener('click', () => {
        this.lastInterfaceMode = 'menu';
        this.showStartMenu();
      });
    }

    const btnSelectTerminal = document.getElementById('btn-select-terminal');
    if (btnSelectTerminal) {
      btnSelectTerminal.addEventListener('click', () => {
        this.lastInterfaceMode = 'terminal';
        this.showTerminalMode();
      });
    }

    const btnHomeBack = document.getElementById('btn-home-back');
    if (btnHomeBack) {
      btnHomeBack.addEventListener('click', () => {
        this.showModeSelect();
      });
    }

    // Terminal Mode Controls (x close button & command input only)

    const btnTermClose = document.getElementById('btn-terminal-close');
    if (btnTermClose) {
      btnTermClose.addEventListener('click', () => this.showModeSelect());
    }

    const terminalInput = document.getElementById('terminal-command-input');
    if (terminalInput) {
      terminalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const cmd = terminalInput.value;
          terminalInput.value = '';
          this.executeTerminalCommand(cmd);
        } else if (e.key === 'Escape') {
          this.executeTerminalCommand('q');
        }
      });
    }

    // Direct keyboard shortcuts when Terminal Mode is visible
    window.addEventListener('keydown', (e) => {
      if (!this.terminalCard || this.terminalCard.style.display === 'none') return;
      if (document.activeElement === terminalInput && e.key !== 'Escape') {
        return; // Allow typing into input field
      }
      if (e.key === '1') {
        this.executeTerminalCommand('solo');
      } else if (e.key === '2') {
        this.executeTerminalCommand('multi');
      } else if (e.key === '3') {
        this.executeTerminalCommand('settings');
      } else if (e.key === 'q' || e.key === 'Q' || e.key === 'Escape') {
        this.executeTerminalCommand('q');
      }
    });

    // 1. Home Menu Buttons
    const btnSolo = document.getElementById('btn-home-solo');
    if (btnSolo) {
      btnSolo.addEventListener('click', () => this.showSoloMenu());
    }

    const btnMp = document.getElementById('btn-home-multiplayer');
    if (btnMp) {
      btnMp.addEventListener('click', () => this.showMultiplayerMenu());
    }

    const btnSettings = document.getElementById('btn-home-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
      });
    }

    // 2. Solo Setup Controls
    const btnSoloCarPrev = document.getElementById('btn-solo-car-prev');
    const btnSoloCarNext = document.getElementById('btn-solo-car-next');
    if (btnSoloCarPrev) {
      btnSoloCarPrev.addEventListener('click', () => {
        this.soloCarIndex = (this.soloCarIndex - 1 + CAR_MODELS.length) % CAR_MODELS.length;
        this.updateSoloCarPreview();
      });
    }
    if (btnSoloCarNext) {
      btnSoloCarNext.addEventListener('click', () => {
        this.soloCarIndex = (this.soloCarIndex + 1) % CAR_MODELS.length;
        this.updateSoloCarPreview();
      });
    }

    const soloSwatches = document.querySelectorAll('#solo-color-picker .color-swatch');
    soloSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        soloSwatches.forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        this.soloColor = swatch.dataset.color;
        this.updateSoloCarPreview();
      });
    });

    const selectSoloNpc = document.getElementById('select-solo-npcs');
    if (selectSoloNpc) {
      selectSoloNpc.addEventListener('change', (e) => {
        this.soloNpcCount = Number(e.target.value) || 1;
      });
    }

    const selectSoloLaps = document.getElementById('select-solo-laps');
    if (selectSoloLaps) {
      selectSoloLaps.addEventListener('change', (e) => {
        this.soloLaps = Math.max(1, Math.min(10, Number(e.target.value) || 3));
      });
    }

    const btnSoloTrackPrev = document.getElementById('btn-solo-track-prev');
    const btnSoloTrackNext = document.getElementById('btn-solo-track-next');
    if (btnSoloTrackPrev) {
      btnSoloTrackPrev.addEventListener('click', () => {
        this.soloTrackIndex = (this.soloTrackIndex - 1 + TRACK_LIST.length) % TRACK_LIST.length;
        this.updateSoloTrackPreview();
      });
    }
    if (btnSoloTrackNext) {
      btnSoloTrackNext.addEventListener('click', () => {
        this.soloTrackIndex = (this.soloTrackIndex + 1) % TRACK_LIST.length;
        this.updateSoloTrackPreview();
      });
    }

    const btnSoloBack = document.getElementById('btn-solo-back');
    if (btnSoloBack) {
      btnSoloBack.addEventListener('click', () => this.showHomeMenu());
    }

    const btnSoloStart = document.getElementById('btn-solo-start');
    if (btnSoloStart) {
      btnSoloStart.addEventListener('click', () => {
        const car = CAR_MODELS[this.soloCarIndex];
        const track = TRACK_LIST[this.soloTrackIndex] || TRACK_LIST[0];
        this.eventBus.emit(EventType.GAME_START_REQUESTED, {
          nickname: 'Racer 1',
          carModel: car.id,
          color: this.soloColor,
          trackId: track.id,
          npcCount: this.soloNpcCount,
          totalLaps: this.soloLaps
        });
      });
    }

    // 3. Multiplayer Entry Controls
    const btnMpBack = document.getElementById('btn-mp-back');
    if (btnMpBack) {
      btnMpBack.addEventListener('click', () => this.showHomeMenu());
    }

    const btnMpCreate = document.getElementById('btn-mp-create');
    if (btnMpCreate) {
      btnMpCreate.addEventListener('click', () => {
        const nickname = document.getElementById('input-mp-nickname')?.value.trim() || 'Racer 1';
        const statusEl = document.getElementById('mp-entry-status');
        if (statusEl) statusEl.textContent = 'Connecting and creating room...';
        const track = TRACK_LIST[this.soloTrackIndex] || TRACK_LIST[0];
        this.eventBus.emit(EventType.ROOM_CREATE_REQUESTED, {
          nickname,
          trackId: track.id,
          carModel: CAR_MODELS[this.mpCarIndex].id,
          color: this.mpColor
        });
      });
    }

    const btnMpJoin = document.getElementById('btn-mp-join');
    if (btnMpJoin) {
      btnMpJoin.addEventListener('click', () => {
        const nickname = document.getElementById('input-mp-nickname')?.value.trim() || 'Racer 1';
        const roomId = document.getElementById('input-mp-room-code')?.value.trim();
        const statusEl = document.getElementById('mp-entry-status');
        if (!roomId) {
          if (statusEl) statusEl.textContent = 'Please enter a room code.';
          return;
        }
        if (statusEl) statusEl.textContent = 'Connecting to room...';
        this.eventBus.emit(EventType.ROOM_JOIN_REQUESTED, {
          roomId,
          nickname,
          carModel: CAR_MODELS[this.mpCarIndex].id,
          color: this.mpColor
        });
      });
    }

    // 4. Multiplayer Room Controls
    const inputRoomNick = document.getElementById('input-mp-room-nickname');
    if (inputRoomNick) {
      let nickDebounceTimer = null;
      inputRoomNick.addEventListener('input', () => {
        clearTimeout(nickDebounceTimer);
        nickDebounceTimer = setTimeout(() => {
          this.broadcastCustomization();
        }, 300);
      });
      inputRoomNick.addEventListener('change', () => {
        this.broadcastCustomization();
      });
      inputRoomNick.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          inputRoomNick.blur();
          this.broadcastCustomization();
        }
      });
    }

    const btnMpCarPrev = document.getElementById('btn-mp-car-prev');
    const btnMpCarNext = document.getElementById('btn-mp-car-next');
    if (btnMpCarPrev) {
      btnMpCarPrev.addEventListener('click', () => {
        this.mpCarIndex = (this.mpCarIndex - 1 + CAR_MODELS.length) % CAR_MODELS.length;
        this.updateMpCarPreview();
        this.broadcastCustomization();
      });
    }
    if (btnMpCarNext) {
      btnMpCarNext.addEventListener('click', () => {
        this.mpCarIndex = (this.mpCarIndex + 1) % CAR_MODELS.length;
        this.updateMpCarPreview();
        this.broadcastCustomization();
      });
    }

    const mpSwatches = document.querySelectorAll('#mp-color-picker .color-swatch');
    mpSwatches.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        mpSwatches.forEach((s) => s.classList.remove('active'));
        swatch.classList.add('active');
        this.mpColor = swatch.dataset.color;
        this.updateMpCarPreview();
        this.broadcastCustomization();
      });
    });

    const btnCopy = document.getElementById('btn-copy-room-code');
    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const code = document.getElementById('mp-room-code')?.textContent?.trim();
        if (!code) return;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(code);
          } else {
            const temp = document.createElement('textarea');
            temp.value = code;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
          }
          btnCopy.textContent = 'Copied!';
          setTimeout(() => {
            btnCopy.textContent = 'Copy Code';
          }, 2000);
        } catch (err) {
          console.error('Failed to copy room code:', err);
        }
      });
    }

    const selectMpNpc = document.getElementById('select-mp-npcs');
    if (selectMpNpc) {
      selectMpNpc.addEventListener('change', (e) => {
        const count = Number(e.target.value) || 0;
        this.eventBus.emit(EventType.ROOM_SETTINGS_UPDATED, { npcCount: count });
      });
    }

    const selectMpLaps = document.getElementById('select-mp-laps');
    if (selectMpLaps) {
      selectMpLaps.addEventListener('change', (e) => {
        const laps = Math.max(1, Math.min(10, Number(e.target.value) || 3));
        this.eventBus.emit(EventType.ROOM_SETTINGS_UPDATED, { totalLaps: laps });
      });
    }

    const btnMpTrackPrev = document.getElementById('btn-mp-track-prev');
    const btnMpTrackNext = document.getElementById('btn-mp-track-next');
    if (btnMpTrackPrev) {
      btnMpTrackPrev.addEventListener('click', () => {
        if (!this.currentRoom || this.localPlayerId !== this.currentRoom.hostId) return;
        this.mpTrackIndex = (this.mpTrackIndex - 1 + TRACK_LIST.length) % TRACK_LIST.length;
        const track = TRACK_LIST[this.mpTrackIndex];
        this.eventBus.emit(EventType.ROOM_SETTINGS_UPDATED, { trackId: track.id });
      });
    }
    if (btnMpTrackNext) {
      btnMpTrackNext.addEventListener('click', () => {
        if (!this.currentRoom || this.localPlayerId !== this.currentRoom.hostId) return;
        this.mpTrackIndex = (this.mpTrackIndex + 1) % TRACK_LIST.length;
        const track = TRACK_LIST[this.mpTrackIndex];
        this.eventBus.emit(EventType.ROOM_SETTINGS_UPDATED, { trackId: track.id });
      });
    }

    const btnMpReady = document.getElementById('btn-mp-ready-toggle');
    if (btnMpReady) {
      btnMpReady.addEventListener('click', () => {
        if (!this.currentRoom || !this.localPlayerId) return;
        const myPlayer = this.currentRoom.players.find((p) => p.id === this.localPlayerId);
        const nextReady = myPlayer ? !myPlayer.isReady : true;
        this.eventBus.emit(EventType.PLAYER_READY_TOGGLED, { isReady: nextReady });
      });
    }

    const btnMpStart = document.getElementById('btn-mp-start');
    if (btnMpStart) {
      btnMpStart.addEventListener('click', () => {
        this.eventBus.emit(EventType.ROOM_START_REQUESTED, {});
      });
    }

    const btnMpLeave = document.getElementById('btn-mp-leave');
    if (btnMpLeave) {
      btnMpLeave.addEventListener('click', () => {
        this.eventBus.emit(EventType.QUIT_REQUESTED, {});
      });
    }
  }

  showHomeMenu() {
    this.hideAllMenus();
    if (this.homeMenu) this.homeMenu.style.display = 'flex';
    if (this.chatContainer) this.chatContainer.style.display = 'none';

    if (this.lastInterfaceMode === 'terminal') {
      this.showTerminalMode();
    } else if (this.lastInterfaceMode === 'menu') {
      this.showStartMenu();
    } else {
      this.showModeSelect();
    }

    this.eventBus.emit(EventType.TRACK_PREVIEW_CHANGED, 'grandprix');
  }

  showModeSelect() {
    this.lastInterfaceMode = 'mode_select';
    this.hideAllCards();
    if (this.homeMenu) this.homeMenu.style.display = 'flex';
    if (this.modeSelectCard) this.modeSelectCard.style.display = 'flex';
  }

  showStartMenu() {
    this.lastInterfaceMode = 'menu';
    this.hideAllCards();
    if (this.homeMenu) this.homeMenu.style.display = 'flex';
    if (this.homeCard) this.homeCard.style.display = 'flex';
  }

  showTerminalMode() {
    this.lastInterfaceMode = 'terminal';
    this.hideAllCards();
    if (this.homeMenu) this.homeMenu.style.display = 'flex';
    if (this.terminalCard) this.terminalCard.style.display = 'flex';
    const statusMsg = document.getElementById('term-status-msg');
    if (statusMsg) statusMsg.innerHTML = '';
    const input = document.getElementById('terminal-command-input');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 60);
    }
  }

  hideAllCards() {
    if (this.modeSelectCard) this.modeSelectCard.style.display = 'none';
    if (this.homeCard) this.homeCard.style.display = 'none';
    if (this.terminalCard) this.terminalCard.style.display = 'none';
  }

  executeTerminalCommand(cmd) {
    if (!cmd) return;
    const clean = cmd.trim().toLowerCase().replace(/^:/, '');
    const statusMsg = document.getElementById('term-status-msg');

    if (clean === '1' || clean === 'solo' || clean === 'race') {
      if (statusMsg) statusMsg.innerHTML = '<span class="term-green">executing</span> :solo race dispatch...';
      setTimeout(() => this.showSoloMenu(), 120);
    } else if (clean === '2' || clean === 'multi' || clean === 'multiplayer' || clean === 'room') {
      if (statusMsg) statusMsg.innerHTML = '<span class="term-green">executing</span> :multiplayer room lobby...';
      setTimeout(() => this.showMultiplayerMenu(), 120);
    } else if (clean === '3' || clean === 'settings' || clean === 'set') {
      const modal = document.getElementById('settings-modal');
      if (modal) modal.style.display = 'flex';
    } else if (clean === 'q' || clean === 'quit' || clean === 'back' || clean === 'menu' || clean === 'wq') {
      this.showModeSelect();
    } else if (clean === 'help' || clean === 'h' || clean === '?') {
      if (statusMsg) {
        statusMsg.innerHTML = '<span class="term-dim">opts: 1:solo, 2:multi, 3:settings, q:back</span>';
      }
    } else {
      if (statusMsg) {
        statusMsg.innerHTML = `<span class="term-error">E492: Not an editor command: ${cmd.trim()}</span>`;
      }
    }
  }

  showSoloMenu() {
    this.hideAllMenus();
    if (this.soloMenu) this.soloMenu.style.display = 'flex';
    if (this.chatContainer) this.chatContainer.style.display = 'none';
    this.updateSoloCarPreview();
    this.updateSoloTrackPreview();
  }

  showMultiplayerMenu() {
    this.hideAllMenus();
    if (this.mpMenu) this.mpMenu.style.display = 'flex';
    if (this.chatContainer) this.chatContainer.style.display = 'none';
    const statusEl = document.getElementById('mp-entry-status');
    if (statusEl) statusEl.textContent = '';
  }

  showRoomLobby(room) {
    this.hideAllMenus();
    if (this.mpRoom) this.mpRoom.style.display = 'flex';
    if (this.chatContainer) {
      this.chatContainer.style.display = 'flex';
      this.chatContainer.classList.add('chat-collapsed');
    }
    const inputRoomNick = document.getElementById('input-mp-room-nickname');
    if (inputRoomNick) {
      const myPlayer = room.players.find((p) => p.id === this.localPlayerId);
      if (myPlayer) {
        inputRoomNick.value = myPlayer.nickname || '';
      }
    }
    this.renderRoomLobby(room);
  }

  hideAllMenus() {
    if (this.homeMenu) this.homeMenu.style.display = 'none';
    if (this.soloMenu) this.soloMenu.style.display = 'none';
    if (this.mpMenu) this.mpMenu.style.display = 'none';
    if (this.mpRoom) this.mpRoom.style.display = 'none';
  }

  updateSoloCarPreview() {
    const car = CAR_MODELS[this.soloCarIndex];
    const imgEl = document.getElementById('img-solo-car');
    const labelEl = document.getElementById('label-solo-car');
    if (imgEl) imgEl.src = getCarSpriteUrl(car.id, this.soloColor);
    if (labelEl) labelEl.textContent = car.name;
  }

  updateSoloTrackPreview() {
    const track = TRACK_LIST[this.soloTrackIndex] || TRACK_LIST[0];
    const imgEl = document.getElementById('img-solo-track');
    const labelEl = document.getElementById('label-solo-track');
    const badgeEl = document.getElementById('badge-solo-track');
    if (imgEl) imgEl.src = track.preview;
    if (labelEl) labelEl.textContent = track.name;
    if (badgeEl) {
      badgeEl.textContent = track.difficulty;
      badgeEl.className = `track-diff-badge ${track.difficulty.toLowerCase()}`;
    }
    this.eventBus.emit(EventType.TRACK_PREVIEW_CHANGED, track.id);
  }

  updateMpCarPreview() {
    const car = CAR_MODELS[this.mpCarIndex];
    const imgEl = document.getElementById('img-mp-car');
    const labelEl = document.getElementById('label-mp-car');
    if (imgEl) imgEl.src = getCarSpriteUrl(car.id, this.mpColor);
    if (labelEl) labelEl.textContent = car.name;
  }

  broadcastCustomization() {
    if (!this.currentRoom) return;
    const car = CAR_MODELS[this.mpCarIndex];
    const inputRoomNick = document.getElementById('input-mp-room-nickname');
    const customNick = inputRoomNick ? inputRoomNick.value.trim() : null;
    const payload = {
      carModel: car.id,
      color: this.mpColor
    };
    if (customNick) {
      payload.nickname = customNick;
    }
    this.eventBus.emit(EventType.PLAYER_CUSTOMIZATION_UPDATED, payload);
  }

  renderRoomLobby(room) {
    this.currentRoom = room;
    if (!this.mpRoom) return;

    // Sync room driver name input if not actively focused by user
    const inputRoomNick = document.getElementById('input-mp-room-nickname');
    if (inputRoomNick && document.activeElement !== inputRoomNick) {
      const myPlayer = room.players.find((p) => p.id === this.localPlayerId);
      if (myPlayer) {
        inputRoomNick.value = myPlayer.nickname || '';
      }
    }

    // Room Header
    const codeEl = document.getElementById('mp-room-code');
    if (codeEl) codeEl.textContent = room.id;

    const isHost = this.localPlayerId === room.hostId;
    const roleEl = document.getElementById('mp-room-role');
    if (roleEl) roleEl.textContent = isHost ? 'Room Host' : 'Challenger';

    // Host-restricted Track Info
    const labelMpTrack = document.getElementById('label-mp-track');
    const btnMpTrackPrev = document.getElementById('btn-mp-track-prev');
    const btnMpTrackNext = document.getElementById('btn-mp-track-next');
    const currentTrackConfig = TRACK_CATALOG[room.trackId] || TRACK_CATALOG.grandprix;
    const currentTrackIdx = TRACK_LIST.findIndex((t) => t.id === currentTrackConfig.id);
    if (currentTrackIdx !== -1) {
      this.mpTrackIndex = currentTrackIdx;
    }
    if (labelMpTrack) {
      const diffLabel = currentTrackConfig.difficulty ? currentTrackConfig.difficulty.charAt(0).toUpperCase() + currentTrackConfig.difficulty.slice(1) : 'Standard';
      labelMpTrack.textContent = `${currentTrackConfig.name} (${diffLabel})`;
    }
    if (btnMpTrackPrev && btnMpTrackNext) {
      btnMpTrackPrev.disabled = !isHost;
      btnMpTrackNext.disabled = !isHost;
      btnMpTrackPrev.classList.toggle('disabled', !isHost);
      btnMpTrackNext.classList.toggle('disabled', !isHost);
    }

    // Host-restricted NPC dropdown
    const selectNpc = document.getElementById('select-mp-npcs');
    if (selectNpc) {
      selectNpc.disabled = !isHost;
      selectNpc.value = String(room.npcCount || 0);

      // Dynamically configure allowed NPC count so max cars = 4
      const maxNpc = Math.max(0, 4 - room.players.length);
      selectNpc.innerHTML = '';
      for (let i = 0; i <= maxNpc; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `${i} NPC${i === 1 ? '' : 's'}`;
        if (i === (room.npcCount || 0)) opt.selected = true;
        selectNpc.appendChild(opt);
      }
    }

    // Host-restricted Lap dropdown
    const selectLaps = document.getElementById('select-mp-laps');
    if (selectLaps) {
      selectLaps.disabled = !isHost;
      selectLaps.value = String(room.totalLaps || 3);
    }

    // Render Driver Roster
    const rosterList = document.getElementById('mp-player-roster');
    if (rosterList) {
      rosterList.innerHTML = '';
      const players = Array.isArray(room?.players) ? room.players : [];
      for (const p of players) {
        if (!p) continue;
        const isLocal = p.id === this.localPlayerId;
        const item = document.createElement('li');
        item.className = 'roster-item';

        const carNum = p.carModel || 1;
        const readyBadgeClass = p.isReady ? 'ready' : 'not-ready';
        const readyText = p.isReady ? 'Ready' : 'Not Ready';
        const spriteUrl = getCarSpriteUrl(carNum, p.color);

        item.innerHTML = `
          <div class="roster-player-info">
            <div class="roster-car-badge" style="background:${p.color || '#dc2626'}">
              <img src="${spriteUrl}" class="roster-car-thumb" style="width:100%;height:100%;max-width:28px;max-height:28px;object-fit:contain;display:block;" alt="car"/>
            </div>
            <span class="roster-name">${p.nickname}</span>
            ${p.id === room.hostId ? '<span class="roster-host-tag">(Host)</span>' : ''}
            ${isLocal ? '<span class="roster-host-tag">(You)</span>' : ''}
          </div>
          <span class="roster-status-badge ${readyBadgeClass}">${readyText}</span>
        `;
        rosterList.appendChild(item);
      }
    }

    // Duplicate name warning
    const warnEl = document.getElementById('mp-duplicate-warning');
    if (warnEl) {
      warnEl.style.display = room.hasDuplicateNames ? 'block' : 'none';
      if (room.hasDuplicateNames) {
        warnEl.textContent = `Duplicate name detected: "${room.duplicateNames.join(', ')}". Every player must have a unique name before starting.`;
      }
    }

    // Ready toggle button status
    const btnReady = document.getElementById('btn-mp-ready-toggle');
    const myPlayer = room.players.find((p) => p.id === this.localPlayerId);
    if (btnReady && myPlayer) {
      btnReady.textContent = myPlayer.isReady ? 'Unready' : 'Ready';
      btnReady.className = myPlayer.isReady ? 'btn secondary' : 'btn primary';
    }

    // Host Start button state
    const btnStart = document.getElementById('btn-mp-start');
    const statusNote = document.getElementById('mp-room-status-note');
    const allReady = room.players.every((p) => p.isReady);
    const totalCars = room.players.length + (room.npcCount || 0);

    if (btnStart) {
      btnStart.style.display = isHost ? 'block' : 'none';
      const canStart = isHost && allReady && !room.hasDuplicateNames && totalCars >= 2;
      btnStart.disabled = !canStart;
    }

    if (statusNote) {
      if (room.hasDuplicateNames) {
        statusNote.textContent = 'Please resolve duplicate names to continue.';
      } else if (!allReady) {
        statusNote.textContent = 'Waiting for all drivers to ready up...';
      } else if (totalCars < 2) {
        statusNote.textContent = 'At least 2 total cars (drivers or NPCs) needed.';
      } else if (isHost) {
        statusNote.textContent = 'All drivers ready! Press Start Race to begin.';
      } else {
        statusNote.textContent = 'All ready! Waiting for the host to start the race.';
      }
    }
  }

  destroy() {
    super.destroy();
  }
}
