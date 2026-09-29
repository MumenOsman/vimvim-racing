/**
 * client/main.js
 * Responsibility: Mumen (Client Bootstrap & Module Coordinator)
 *
 * Coordinates 2D top-down racing simulation, 60 FPS physics loop,
 * car-to-car elastic collisions, pre-race countdown timer,
 * AI opponent, item perks/hazards, and decoupled HUD updates.
 */

import { EventBus, EventType } from './core/events.js';
import { ModuleManager } from './core/module_manager.js';
import { GameLoop } from './engine/game_loop.js';
import { DOMRenderer } from './engine/renderer.js';
import { GameState, MatchState } from './engine/state.js';
import { PhysicsEngine } from './engine/physics.js';
import { getActiveTrack, setActiveTrack } from './engine/track.js';
import { NetworkClient } from './network/client.js';
import { SoundManager } from './audio/sound.js';
import { InputManager } from './input/keyboard.js';
import { LobbyUI } from './ui/lobby.js';
import { HudUI } from './ui/hud.js';
import { MenuUI } from './ui/menu.js';
import { ChatUI } from './ui/chat.js';
import { MenuBackground } from './ui/menu_background.js';

class GameApp {
  constructor() {
    this.eventBus = new EventBus();
    this.gameState = new GameState();
    this.physics = new PhysicsEngine();
    this.renderer = new DOMRenderer();
    this.inputManager = new InputManager();
    this.soundManager = new SoundManager();
    this.hudUI = new HudUI();

    this.context = {
      eventBus: this.eventBus,
      rootElement: document.getElementById('app-root')
    };

    this.moduleManager = new ModuleManager(this.context);

    this.networkClient = new NetworkClient();
    this.menuUI = new MenuUI();
    this.lobbyUI = new LobbyUI();
    this.chatUI = new ChatUI();
    this.menuBackground = new MenuBackground();

    this.isMultiplayer = false;
    this.isRoomHost = false;
    this.roomPlayers = [];
    this.remoteInputs = new Map();
    this.lastSnapshotAt = 0;
    this.lastSoloConfig = {
      nickname: 'Racer 1',
      trackId: 'grandprix',
      carModel: 1,
      color: '#dc2626',
      npcCount: 3
    };

    this.localPlayerId = 'player-1';
    this.npcPlayerId = 'bot-npc-1';

    // Throttled timers to prevent DOM layout thrashing
    this.lastReportedSec = -1;
    this.lastReportedCountdown = -1;
    this.stateBeforePause = MatchState.PLAYING;
    this.fpsCounter = 0;
    this.fpsTimer = 0;
    this.currentFps = 60;
    this.lastFrameTime = 0;
    this.avgFrameDelta = 16.666;
    this.lastDisplayedFps = 0;
  }

  start() {
    console.log('Bootstrapping VimVim Race Track 2D racing game...');

    // 1. Register Engine & Renderer
    this.moduleManager.register(this.renderer);

    // 2. Register Input, Audio, HUD, Menu
    this.moduleManager.register(this.inputManager);
    this.moduleManager.register(this.soundManager);
    this.moduleManager.register(this.hudUI);
    this.moduleManager.register(this.menuUI);

    // 3. Register Networking, Lobby, Chat, MenuBackground
    this.moduleManager.register(this.networkClient);
    this.moduleManager.register(this.lobbyUI);
    this.moduleManager.register(this.chatUI);
    this.moduleManager.register(this.menuBackground);

    // 4. Setup event listeners & settings UI
    this.setupEventHandlers();
    this.setupSettings();

    // 5. Initialize background lobby grid preview (parked cars, no timer/countdown)
    this.setupLobbyPreview();

    // 6. Start 60 FPS Game Loop
    this.gameLoop = new GameLoop(
      (fixedDt) => this.onFixedUpdate(fixedDt),
      (alpha) => this.onRender(alpha)
    );

    this.gameLoop.start();
    console.log('Racing engine active at 60 FPS.');
  }

  setupLobbyPreview(trackId = null) {
    if (!trackId && this.gameState.status === MatchState.LOBBY && this.physics.currentTrack && this.gameState.players.size > 0) {
      return;
    }

    const track = trackId ? setActiveTrack(trackId) : getActiveTrack();
    this.physics.setTrack(track);
    this.renderer.setTrack(track);
    this.hudUI.setTrack(track);

    this.gameState.players.clear();
    this.gameState.hazards = [];
    this.gameState.projectiles = [];
    this.gameState.roundTimer = 0;
    this.gameState.countdownTimer = 2.70;
    this.gameState.pausedBy = null;
    this.gameState.winner = null;

    const slot0 = (track.startingGrid && track.startingGrid[0]) || { x: 600, y: 720, angle: 0 };
    const playerCar = {
      id: this.localPlayerId,
      nickname: 'Racer 1',
      carModel: 1,
      color: '#dc2626',
      x: slot0.x,
      y: slot0.y,
      prevX: slot0.x,
      prevY: slot0.y,
      angle: slot0.angle,
      speed: 0,
      vx: 0,
      vy: 0,
      lap: 1,
      lastCheckpoint: track.checkpoints.length - 1,
      lapProgress: 0.98,
      hasStarted: false,
      perk: null,
      boostTime: 0,
      spinTime: 0
    };

    const slot1 = (track.startingGrid && track.startingGrid[1]) || { x: 550, y: 750, angle: 0 };
    const npcCar = {
      id: this.npcPlayerId,
      nickname: 'Bot Turbo',
      carModel: 2,
      color: '#15803d',
      x: slot1.x,
      y: slot1.y,
      prevX: slot1.x,
      prevY: slot1.y,
      angle: slot1.angle,
      speed: 0,
      vx: 0,
      vy: 0,
      lap: 1,
      lastCheckpoint: track.checkpoints.length - 1,
      lapProgress: 0.96,
      hasStarted: false,
      waypointIndex: 0,
      perk: null,
      boostTime: 0,
      spinTime: 0
    };

    this.gameState.players.set(this.localPlayerId, playerCar);
    this.gameState.players.set(this.npcPlayerId, npcCar);

    const standardBoxes = (track.itemBoxes || []).map((box) => ({
      ...box,
      type: 'standard',
      active: true,
      respawnTimer: 0
    }));
    const ufoBoxes = (track.ufoSpawns || []).slice(0, 1).map((box) => ({
      ...box,
      type: 'UFO',
      active: true,
      respawnTimer: 0
    }));
    this.gameState.itemBoxes = [...standardBoxes, ...ufoBoxes];

    const prevStatus = this.gameState.status;
    this.gameState.setStatus(MatchState.LOBBY);
    if (!this.isMultiplayer) {
      this.eventBus.emit(EventType.LOCAL_PLAYER_CHANGED, this.localPlayerId);
    }
    if (prevStatus !== MatchState.LOBBY) {
      this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.LOBBY);
    }
  }

  getCountdownStep(timerVal) {
    if (timerVal <= 0) return 0;
    const elapsed = Math.max(0, 2.70 - timerVal);
    if (elapsed >= 1.814) return 1;
    if (elapsed >= 0.932) return 2;
    return 3;
  }

  initRaceGrid(playerName, trackId = 'grandprix', carModel = 1, color = '#dc2626', npcCount = 3, totalLaps = 3) {
    const parsedLaps = Number(totalLaps);
    const validLaps = Number.isFinite(parsedLaps) ? Math.max(1, Math.min(10, parsedLaps)) : 3;
    this.lastSoloConfig = {
      nickname: playerName || 'Racer 1',
      trackId: trackId || 'grandprix',
      carModel: Number(carModel) || 1,
      color: color || '#dc2626',
      npcCount: npcCount !== undefined ? Number(npcCount) : 3,
      totalLaps: validLaps
    };

    const track = setActiveTrack(trackId);
    this.physics.setTrack(track);
    this.renderer.setTrack(track);
    this.hudUI.setTrack(track);

    this.gameState.players.clear();
    this.gameState.hazards = [];
    this.gameState.projectiles = [];
    this.gameState.roundTimer = 0;
    this.gameState.countdownTimer = 2.70;
    this.gameState.totalLaps = validLaps;
    this.gameState.pausedBy = null;
    this.gameState.winner = null;
    this.lastReportedSec = -1;
    this.lastReportedCountdown = 3;

    // Player car (P1 Grid Slot)
    const slot0 = track.startingGrid[0] || { x: 500, y: 500, angle: 0 };
    const playerCar = {
      id: this.localPlayerId,
      nickname: playerName || 'Racer 1',
      carModel: Number(carModel) || 1,
      color: color || '#dc2626',
      x: slot0.x,
      y: slot0.y,
      prevX: slot0.x,
      prevY: slot0.y,
      angle: slot0.angle,
      speed: 0,
      vx: 0,
      vy: 0,
      lap: 1,
      lastCheckpoint: track.checkpoints.length - 1,
      lapProgress: 0.98,
      hasStarted: false,
      perk: null,
      boostTime: 0,
      spinTime: 0
    };
    this.gameState.players.set(this.localPlayerId, playerCar);

    // Dynamic Bot Opponents: 1 to 3 bots (ensuring 2 to 4 total cars)
    const botPresets = [
      { name: 'Bot Turbo', color: '#15803d', model: 2 },
      { name: 'Bot Apex', color: '#2563eb', model: 3 },
      { name: 'Bot Nitro', color: '#eab308', model: 1 }
    ];

    const actualNpcCount = Math.max(1, Math.min(3, Number(npcCount) || 3));
    for (let i = 0; i < actualNpcCount; i++) {
      const slot = track.startingGrid[i + 1] || track.startingGrid[1];
      const preset = botPresets[i % botPresets.length];
      const botId = `bot-npc-${i + 1}`;
      const botCar = {
        id: botId,
        nickname: preset.name,
        carModel: preset.model,
        color: preset.color,
        x: slot.x,
        y: slot.y,
        prevX: slot.x,
        prevY: slot.y,
        angle: slot.angle,
        speed: 0,
        vx: 0,
        vy: 0,
        lap: 1,
        lastCheckpoint: track.checkpoints.length - 1,
        lapProgress: 0.98 - 0.02 * (i + 1),
        hasStarted: false,
        waypointIndex: 0,
        perk: null,
        boostTime: 0,
        spinTime: 0
      };
      this.gameState.players.set(botId, botCar);
    }

    // Single green UFO box in one designated sideline area
    const standardBoxes = (track.itemBoxes || []).map((box) => ({
      ...box,
      type: 'standard',
      active: true,
      respawnTimer: 0
    }));
    const ufoBoxes = (track.ufoSpawns || []).slice(0, 1).map((box) => ({
      ...box,
      type: 'UFO',
      active: true,
      respawnTimer: 0
    }));
    this.gameState.itemBoxes = [...standardBoxes, ...ufoBoxes];

    this.gameState.setStatus(MatchState.READY);
    this.gameState.countdownTimer = 2.70;
    this.lastReportedCountdown = 3;
    this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.READY);
    this.updateRaceStandings(false);
  }

  initMultiplayerGrid(room) {
    this.lastRoom = room;
    const trackId = room.trackId || 'grandprix';
    const track = setActiveTrack(trackId);
    this.physics.setTrack(track);
    this.renderer.setTrack(track);
    this.hudUI.setTrack(track);

    this.gameState.players.clear();
    this.gameState.hazards = [];
    this.gameState.projectiles = [];
    this.gameState.roundTimer = 0;
    this.gameState.countdownTimer = 2.70;
    const parsedMpLaps = Number(room.totalLaps);
    this.gameState.totalLaps = Number.isFinite(parsedMpLaps) ? Math.max(1, Math.min(10, parsedMpLaps)) : 3;
    this.gameState.pausedBy = null;
    this.gameState.winner = null;
    this.lastReportedSec = -1;
    this.lastReportedCountdown = 3;
    this.roomPlayers = room.players;
    this.remoteInputs.clear();

    room.players.forEach((player, index) => {
      const slot = track.startingGrid[index % track.startingGrid.length];
      const car = {
        id: player.id,
        nickname: player.nickname,
        carModel: player.carModel || 1,
        color: player.color || '#dc2626',
        x: slot.x,
        y: slot.y,
        prevX: slot.x,
        prevY: slot.y,
        angle: slot.angle,
        speed: 0,
        vx: 0,
        vy: 0,
        lap: 1,
        lastCheckpoint: track.checkpoints.length - 1,
        lapProgress: 0.98 - index * 0.01,
        hasStarted: false,
        perk: null,
        boostTime: 0,
        spinTime: 0
      };
      this.gameState.players.set(car.id, car);
    });

    // Spawn host-configured NPC bots if room.npcCount > 0
    const botPresets = [
      { name: 'Bot Turbo', color: '#15803d', model: 2 },
      { name: 'Bot Apex', color: '#2563eb', model: 3 },
      { name: 'Bot Nitro', color: '#eab308', model: 1 }
    ];
    const npcCount = Math.max(0, Math.min(4 - room.players.length, Number(room.npcCount) || 0));
    for (let i = 0; i < npcCount; i++) {
      const slotIndex = room.players.length + i;
      const slot = track.startingGrid[slotIndex % track.startingGrid.length];
      const preset = botPresets[i % botPresets.length];
      const botId = `bot-npc-${i + 1}`;
      const botCar = {
        id: botId,
        nickname: preset.name,
        carModel: preset.model,
        color: preset.color,
        x: slot.x,
        y: slot.y,
        prevX: slot.x,
        prevY: slot.y,
        angle: slot.angle,
        speed: 0,
        vx: 0,
        vy: 0,
        lap: 1,
        lastCheckpoint: track.checkpoints.length - 1,
        lapProgress: 0.98 - slotIndex * 0.01,
        hasStarted: false,
        waypointIndex: 0,
        perk: null,
        boostTime: 0,
        spinTime: 0
      };
      this.gameState.players.set(botId, botCar);
    }

    // Single green UFO box in one designated sideline area
    const standardBoxes = (track.itemBoxes || []).map((box) => ({
      ...box,
      type: 'standard',
      active: true,
      respawnTimer: 0
    }));
    const ufoBoxes = (track.ufoSpawns || []).slice(0, 1).map((box) => ({
      ...box,
      type: 'UFO',
      active: true,
      respawnTimer: 0
    }));
    this.gameState.itemBoxes = [...standardBoxes, ...ufoBoxes];

    this.gameState.setStatus(MatchState.READY);
    this.gameState.countdownTimer = 2.70;
    this.lastReportedCountdown = 3;
    this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.READY);
    this.updateRaceStandings(false);
  }

  setupSettings() {
    const settingsModal = document.getElementById('settings-modal');
    const settingsCloseButton = document.getElementById('btn-settings-close');

    if (!settingsModal || !settingsCloseButton) {
      return;
    }

    // Tabs
    const tabControls = document.getElementById('btn-settings-tab-controls');
    const tabSounds = document.getElementById('btn-settings-tab-sounds');
    const panelControls = document.getElementById('settings-panel-controls');
    const panelSounds = document.getElementById('settings-panel-sounds');

    const switchTab = (tab) => {
      if (tab === 'controls') {
        if (tabControls) tabControls.classList.add('active');
        if (tabSounds) tabSounds.classList.remove('active');
        if (panelControls) panelControls.style.display = 'flex';
        if (panelSounds) panelSounds.style.display = 'none';
      } else if (tab === 'sounds') {
        if (tabSounds) tabSounds.classList.add('active');
        if (tabControls) tabControls.classList.remove('active');
        if (panelSounds) panelSounds.style.display = 'flex';
        if (panelControls) panelControls.style.display = 'none';
      }
    };

    if (tabControls) {
      tabControls.addEventListener('click', () => switchTab('controls'));
    }
    if (tabSounds) {
      tabSounds.addEventListener('click', () => switchTab('sounds'));
    }

    // Sound Sliders
    const musicSlider = document.getElementById('slider-music-volume');
    const musicBadge = document.getElementById('label-music-val');
    const sfxSlider = document.getElementById('slider-sfx-volume');
    const sfxBadge = document.getElementById('label-sfx-val');

    const updateSoundSlidersUI = () => {
      const musicVol = this.soundManager?.getMusicVolume?.() ?? 0.7;
      const sfxVol = this.soundManager?.getSfxVolume?.() ?? 0.8;
      const musicPct = Math.round(musicVol * 100);
      const sfxPct = Math.round(sfxVol * 100);

      if (musicSlider) musicSlider.value = musicPct;
      if (musicBadge) musicBadge.textContent = `${musicPct}%`;
      if (sfxSlider) sfxSlider.value = sfxPct;
      if (sfxBadge) sfxBadge.textContent = `${sfxPct}%`;
    };

    if (musicSlider) {
      musicSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (musicBadge) musicBadge.textContent = `${val}%`;
        this.soundManager?.setMusicVolume(val / 100);
      });
    }

    if (sfxSlider) {
      sfxSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (sfxBadge) sfxBadge.textContent = `${val}%`;
        this.soundManager?.setSfxVolume(val / 100);
      });
    }

    const openSettings = () => {
      settingsModal.style.display = 'flex';
      this.updateSettingsButtons();
      updateSoundSlidersUI();
    };

    const closeSettings = () => {
      settingsModal.style.display = 'none';
    };

    // Open Settings from any of the settings buttons
    const settingsButtons = [
      document.getElementById('btn-home-settings'),
      document.getElementById('btn-pause-settings'),
      document.getElementById('btn-pause-mp-settings')
    ];
    settingsButtons.forEach((btn) => {
      if (btn) {
        btn.addEventListener('click', openSettings);
      }
    });

    // Close Settings
    settingsCloseButton.addEventListener('click', closeSettings);

    // Close Settings with Escape key when open
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && settingsModal.style.display === 'flex') {
        closeSettings();
      }
    });

    // Listen for clicks on key remapping buttons
    const settingButtons = settingsModal.querySelectorAll('[data-setting-action]');
    settingButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.settingAction;
        button.textContent = 'Press key...';

        const captureKey = (event) => {
          event.preventDefault();

          if (event.code === 'Escape') {
            button.textContent = this.getKeyDisplayName(this.inputManager.getKeyBinding(action));
            window.removeEventListener('keydown', captureKey);
            return;
          }

          const existingAction = Object.keys(this.inputManager.keyBindings).find(
            (key) => key !== action && this.inputManager.keyBindings[key] === event.code
          );

          if (existingAction) {
            button.textContent = this.getKeyDisplayName(this.inputManager.getKeyBinding(action));
            window.removeEventListener('keydown', captureKey);
            return;
          }

          this.inputManager.setKeyBinding(action, event.code);
          button.textContent = this.getKeyDisplayName(event.code);
          window.removeEventListener('keydown', captureKey);
        };

        window.addEventListener('keydown', captureKey);
      });
    });
  }

  getKeyDisplayName(keyCode) {
    const keyNames = {
      Space: 'Space',
      Escape: 'Escape',
      ArrowUp: 'Up',
      ArrowDown: 'Down',
      ArrowLeft: 'Left',
      ArrowRight: 'Right'
    };

    if (keyNames[keyCode]) return keyNames[keyCode];
    if (keyCode.startsWith('Key')) return keyCode.replace('Key', '');
    if (keyCode.startsWith('Digit')) return keyCode.replace('Digit', '');
    return keyCode;
  }

  updateSettingsButtons() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) return;

    const settingButtons = settingsModal.querySelectorAll('[data-setting-action]');
    settingButtons.forEach((button) => {
      const action = button.dataset.settingAction;
      const keyCode = this.inputManager.getKeyBinding(action);
      button.textContent = this.getKeyDisplayName(keyCode);
    });
  }

  setupEventHandlers() {
    // Start audio & background music on first user gesture
    const onFirstUserAction = () => {
      this.soundManager.onFirstUserInteraction();
      window.removeEventListener('pointerdown', onFirstUserAction);
      window.removeEventListener('keydown', onFirstUserAction);
    };
    window.addEventListener('pointerdown', onFirstUserAction);
    window.addEventListener('keydown', onFirstUserAction);

    // Global button & interactive element click SFX
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, .btn, .track-card, .track-thumb-item, .car-item, .terminal-option-row, .settings-tab-btn, select, input[type="range"]');
      if (target) {
        this.soundManager.ensureAudioContext();
        this.soundManager.play('button_click');
      }
    }, true);

    this.eventBus.on(EventType.GAME_START_REQUESTED, (data) => {
      const name = data && data.nickname ? data.nickname : 'Racer 1';
      const trackId = data && data.trackId ? data.trackId : 'grandprix';
      const carModel = data && data.carModel ? data.carModel : 1;
      const color = data && data.color ? data.color : '#dc2626';
      const npcCount = data && data.npcCount !== undefined ? data.npcCount : 3;
      const totalLaps = data && data.totalLaps !== undefined ? data.totalLaps : 3;

      this.isMultiplayer = false;
      this.isRoomHost = false;
      this.localPlayerId = 'player-1';
      this.menuUI.setMultiplayer(false);
      this.eventBus.emit(EventType.LOCAL_PLAYER_CHANGED, this.localPlayerId);
      this.eventBus.emit(EventType.GAME_PERMISSIONS_CHANGED, { canResume: true, canQuit: true });
      this.initRaceGrid(name, trackId, carModel, color, npcCount, totalLaps);
    });

    this.eventBus.on(EventType.TRACK_PREVIEW_CHANGED, (trackId) => {
      if (this.gameState.status === MatchState.LOBBY) {
        this.setupLobbyPreview(trackId);
      }
    });

    this.eventBus.on(EventType.GAME_STARTED, (room) => {
      this.isMultiplayer = true;
      this.lastRoom = room;
      this.isRoomHost = room.hostId === this.networkClient.playerId;
      this.localPlayerId = this.networkClient.playerId;
      const humanCount = room && Array.isArray(room.players) ? room.players.length : 1;
      this.menuUI.setMultiplayer(true, humanCount);
      this.eventBus.emit(EventType.LOCAL_PLAYER_CHANGED, this.localPlayerId);
      this.eventBus.emit(EventType.GAME_PERMISSIONS_CHANGED, { canResume: true, canQuit: true });
      this.initMultiplayerGrid(room);
    });

    this.eventBus.on(EventType.GAME_RESTART_REQUESTED, (room) => {
      this.soundManager.stopEngine();
      if (this.isMultiplayer) {
        const targetRoom = room || this.lastRoom;
        if (targetRoom) {
          this.initMultiplayerGrid(targetRoom);
        }
      } else {
        const c = this.lastSoloConfig;
        this.initRaceGrid(c.nickname, c.trackId, c.carModel, c.color, c.npcCount, c.totalLaps);
      }
    });

    this.eventBus.on(EventType.INPUT_CHANGED, (controls) => {
      if (this.gameState.status === MatchState.READY && (controls.gas || controls.action)) {
        if (this.isMultiplayer && !this.isRoomHost) {
          return; // Only room host can start countdown in multiplayer
        }
        this.gameState.setStatus(MatchState.COUNTDOWN);
        this.gameState.countdownTimer = 2.70;
        this.lastReportedCountdown = 3;
        this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.COUNTDOWN);
        this.eventBus.emit(EventType.COUNTDOWN_TICK, 3);
        if (this.isMultiplayer && this.isRoomHost) {
          this.networkClient.send('STATE_SNAPSHOT', this.gameState.getSnapshot());
        }
      }
    });

    this.eventBus.on(EventType.PAUSE_REQUESTED, () => {
      if (!this.isMultiplayer && (this.gameState.status === MatchState.PLAYING || this.gameState.status === MatchState.COUNTDOWN || this.gameState.status === MatchState.READY)) {
        this.stateBeforePause = this.gameState.status;
        this.gameState.setStatus(MatchState.PAUSED);
        this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.PAUSED);
      }
    });

    this.eventBus.on(EventType.GAME_PAUSED, ({ pausedBy, pauserNickname }) => {
      this.stateBeforePause = this.gameState.status;
      this.gameState.pausedBy = pausedBy;
      this.gameState.setStatus(MatchState.PAUSED);
      const player = this.gameState.players.get(pausedBy);
      const name = pauserNickname || player?.nickname || 'A player';
      this.eventBus.emit(EventType.PLAYER_ACTION_BROADCAST, `${name} paused the race.`);
      this.eventBus.emit(EventType.GAME_PERMISSIONS_CHANGED, {
        canResume: pausedBy === this.localPlayerId,
        canQuit: true
      });
      this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.PAUSED);
    });

    this.eventBus.on(EventType.RESUME_REQUESTED, () => {
      if (!this.isMultiplayer && this.gameState.status === MatchState.PAUSED) {
        const targetState = this.stateBeforePause || MatchState.PLAYING;
        this.gameState.setStatus(targetState);
        this.eventBus.emit(EventType.GAME_STATE_CHANGED, targetState);
        if (targetState === MatchState.COUNTDOWN) {
          const currentSec = this.getCountdownStep(this.gameState.countdownTimer);
          this.eventBus.emit(EventType.COUNTDOWN_TICK, currentSec);
        }
      }
    });

    this.eventBus.on(EventType.GAME_RESUMED, () => {
      this.gameState.pausedBy = null;
      const targetState = this.stateBeforePause || MatchState.PLAYING;
      this.gameState.setStatus(targetState);
      this.eventBus.emit(EventType.GAME_PERMISSIONS_CHANGED, { canResume: true, canQuit: true });
      this.eventBus.emit(EventType.GAME_STATE_CHANGED, targetState);
      if (targetState === MatchState.COUNTDOWN) {
        const currentSec = this.getCountdownStep(this.gameState.countdownTimer);
        this.eventBus.emit(EventType.COUNTDOWN_TICK, currentSec);
      }
    });

    this.eventBus.on(EventType.GAME_STATE_CHANGED, (status) => {
      if ((status === MatchState.LOBBY || status === 'LOBBY') && this.gameState.status !== MatchState.LOBBY) {
        this.gameState.setStatus(MatchState.LOBBY);
        this.soundManager.stopEngine();
        this.setupLobbyPreview();
      }
    });

    this.eventBus.on(EventType.ROOM_JOINED, (data) => {
      this.isMultiplayer = true;
      this.lastRoom = data.room;
      this.localPlayerId = data.playerId;
      this.isRoomHost = data.room.hostId === data.playerId;
      this.roomPlayers = data.room.players || [];
      this.menuUI.setMultiplayer(true, this.roomPlayers.length);
    });

    this.eventBus.on(EventType.RETURN_TO_ROOM_REQUESTED, () => {
      this.soundManager.stopEngine();
      this.gameState.setStatus(MatchState.LOBBY);
      this.setupLobbyPreview();
    });

    this.eventBus.on(EventType.HOME_REQUESTED, () => {
      this.isMultiplayer = false;
      this.isRoomHost = false;
      this.soundManager.stopEngine();
      this.setupLobbyPreview();
    });

    this.eventBus.on(EventType.QUIT_REQUESTED, () => {
      if (this.isMultiplayer) {
        return;
      }
      this.soundManager.stopEngine();
      this.setupLobbyPreview();
    });

    this.eventBus.on(EventType.ROOM_CLOSED, () => {
      this.isMultiplayer = false;
      this.isRoomHost = false;
      this.soundManager.stopEngine();
      this.setupLobbyPreview();
    });

    this.eventBus.on(EventType.ROOM_LEFT, () => {
      this.isMultiplayer = false;
      this.isRoomHost = false;
      this.roomPlayers = [];
      this.remoteInputs.clear();
      this.soundManager.stopEngine();
      this.eventBus.emit(EventType.GAME_PERMISSIONS_CHANGED, { canResume: true, canQuit: true });
      this.setupLobbyPreview();
    });

    this.eventBus.on(EventType.ROOM_UPDATED, (room) => {
      if (!this.isMultiplayer) return;
      this.lastRoom = room;
      this.isRoomHost = room.hostId === (this.networkClient.playerId || this.localPlayerId);
      this.roomPlayers = room.players;
      this.eventBus.emit(EventType.GAME_PERMISSIONS_CHANGED, {
        canResume: this.gameState.status !== MatchState.PAUSED || this.gameState.pausedBy === this.localPlayerId,
        canQuit: true
      });
      if (room.status === 'LOBBY' && this.gameState.status !== MatchState.LOBBY) {
        this.gameState.setStatus(MatchState.LOBBY);
        this.soundManager.stopEngine();
        this.setupLobbyPreview(room.trackId);
      } else if (this.gameState.status === MatchState.LOBBY && room.trackId && room.trackId !== this.physics.currentTrack?.id) {
        this.setupLobbyPreview(room.trackId);
      } else if (this.isRoomHost && this.gameState.status !== MatchState.LOBBY) {
        const activeIds = new Set(room.players.map((player) => player.id));
        for (const id of this.gameState.players.keys()) {
          if (!id.startsWith('bot-') && !activeIds.has(id)) {
            this.gameState.players.delete(id);
            this.remoteInputs.delete(id);
          }
        }
      }
      const humanCount = room && Array.isArray(room.players) ? room.players.length : 1;
      this.menuUI.setMultiplayer(true, humanCount);
    });

    this.eventBus.on(EventType.PLAYER_INPUT_RECEIVED, ({ playerId, input }) => {
      if (this.isMultiplayer && this.isRoomHost && playerId !== this.localPlayerId) {
        this.remoteInputs.set(playerId, input);
      }
    });

    this.eventBus.on(EventType.STATE_SYNC_RECEIVED, (snapshot) => {
      if (this.isMultiplayer && !this.isRoomHost) this.applyRemoteSnapshot(snapshot);
    });
  }

  onFixedUpdate(fixedDt) {
    if (this.gameState.status === MatchState.LOBBY) {
      if (this.menuBackground) {
        this.menuBackground.update(fixedDt);
      }
      return;
    }

    if (this.gameState.status === MatchState.PAUSED || this.gameState.status === MatchState.GAME_OVER) {
      return;
    }

    // 1. Tick modules with latest snapshot
    const snapshot = this.gameState.getSnapshot();
    this.moduleManager.update(fixedDt, snapshot);

    // 2. Handle READY phase (Waiting for player to press K to rev up & start countdown)
    if (this.gameState.status === MatchState.READY) {
      const controls = this.inputManager.getInput();
      if (controls && (controls.gas || controls.action)) {
        if (this.isMultiplayer && !this.isRoomHost) {
          return; // Only room host can start countdown in multiplayer
        }
        this.gameState.setStatus(MatchState.COUNTDOWN);
        this.gameState.countdownTimer = 2.70;
        this.lastReportedCountdown = 3;
        this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.COUNTDOWN);
        this.eventBus.emit(EventType.COUNTDOWN_TICK, 3);
        if (this.isMultiplayer && this.isRoomHost) {
          this.networkClient.send('STATE_SNAPSHOT', this.gameState.getSnapshot());
        }
      }
      return;
    }

    // 3. Handle Pre-Race Countdown Phase
    if (this.gameState.status === MatchState.COUNTDOWN) {
      this.gameState.countdownTimer -= fixedDt;
      const currentCountdown = this.getCountdownStep(this.gameState.countdownTimer);

      if (currentCountdown !== this.lastReportedCountdown && currentCountdown > 0) {
        this.lastReportedCountdown = currentCountdown;
        this.eventBus.emit(EventType.COUNTDOWN_TICK, currentCountdown);
      }

      if (this.gameState.countdownTimer <= 0) {
        this.gameState.countdownTimer = 0;
        this.gameState.setStatus(MatchState.PLAYING);
        this.eventBus.emit(EventType.COUNTDOWN_TICK, 0);
        this.eventBus.emit(EventType.COUNTDOWN_COMPLETED);
        this.eventBus.emit(EventType.GAME_STATE_CHANGED, MatchState.PLAYING);
      }

      if (this.isMultiplayer && this.isRoomHost) {
        const now = performance.now();
        if (now - this.lastSnapshotAt >= 33) {
          this.lastSnapshotAt = now;
          this.networkClient.send('STATE_SNAPSHOT', this.gameState.getSnapshot());
        }
      }
      return;
    }

    if (this.isMultiplayer && !this.isRoomHost) return;

    // 4. Process Driving Controls & Physics
    const handleMissedCp = (car, requiredSector) => {
      if (car.id === this.localPlayerId) {
        this.eventBus.emit(EventType.PLAYER_ACTION_BROADCAST, `Missed Checkpoint! Complete ${requiredSector} to count lap.`);
        this.eventBus.emit(EventType.PLAY_SFX, 'damage');
      }
    };

    if (this.isMultiplayer) {
      for (const car of this.gameState.players.values()) {
        car.prevX = car.x;
        car.prevY = car.y;
        if (car.id.startsWith('bot-')) {
          this.physics.updateNPC(car, fixedDt, false);
          if (car.perk) {
            if (!car.perkTimer) car.perkTimer = 1.5 + Math.random() * 1.5;
            car.perkTimer -= fixedDt;
            if (car.perkTimer <= 0) {
              car.perkTimer = null;
              this.triggerPerk(car);
            }
          }
        } else {
          const controls = car.id === this.localPlayerId
            ? this.inputManager.getInput()
            : this.remoteInputs.get(car.id) || { gas: false, brake: false, steer: 0, action: false };
          const { actionTriggered, hitObstacle, isNewObstacleHit } = this.physics.updateCar(car, controls, fixedDt, false, handleMissedCp);
          if (isNewObstacleHit && car.id === this.localPlayerId) {
            this.eventBus.emit(EventType.CAR_COLLISION);
          }
          if (actionTriggered && car.perk) this.triggerPerk(car);
        }
      }
    } else {
      const player = this.gameState.players.get(this.localPlayerId);
      if (player) {
        player.prevX = player.x;
        player.prevY = player.y;

        const controls = this.inputManager.getInput();
        const { actionTriggered, hitObstacle, isNewObstacleHit } = this.physics.updateCar(player, controls, fixedDt, false, handleMissedCp);
        if (isNewObstacleHit) {
          this.eventBus.emit(EventType.CAR_COLLISION);
        }
        if (actionTriggered && player.perk) this.triggerPerk(player);
      }

      for (const car of this.gameState.players.values()) {
        if (car.id.startsWith('bot-')) {
          car.prevX = car.x;
          car.prevY = car.y;
          this.physics.updateNPC(car, fixedDt, false);

          if (car.perk) {
            if (!car.perkTimer) car.perkTimer = 1.5 + Math.random() * 1.5;
            car.perkTimer -= fixedDt;
            if (car.perkTimer <= 0) {
              car.perkTimer = null;
              this.triggerPerk(car);
            }
          }
        }
      }
    }

    // Engine Audio Pitch & Loop Modulation
    const localCar = this.gameState.players.get(this.localPlayerId);
    if (localCar && this.gameState.status === MatchState.PLAYING) {
      this.soundManager.playEngine();
      const speedRatio = Math.min(1, Math.abs(localCar.speed) / (this.physics.baseMaxSpeed || 320));
      const enginePitch = 0.8 + speedRatio * 0.7;
      this.soundManager.setEnginePitch(enginePitch);
    } else {
      this.soundManager.stopEngine();
    }

    // 4. Car-to-Car Collision Resolution
    const allCars = Array.from(this.gameState.players.values());
    const { hadCollision, hasNewImpact } = this.physics.resolveCarCollisions(allCars);
    if (hasNewImpact) {
      this.eventBus.emit(EventType.CAR_COLLISION);
    }

    // 5. Update Projectiles
    this.updateProjectiles(fixedDt);

    // 6. Update Hazards
    this.checkHazards();

    // 7. Update Mystery Item Boxes
    this.updateItemBoxes(fixedDt);

    // 8. Track Race Positions & Laps
    this.updateRaceStandings();

    // 9. Throttled Round Timer: emit once per second
    this.gameState.roundTimer += fixedDt;
    const currentSec = Math.floor(this.gameState.roundTimer);
    if (currentSec !== this.lastReportedSec) {
      this.lastReportedSec = currentSec;
      this.eventBus.emit(EventType.TIMER_TICK, currentSec);
    }

    // 10. Sync state to multiplayer clients (30 Hz rate)
    if (this.isMultiplayer && this.isRoomHost) {
      const now = performance.now();
      if (now - this.lastSnapshotAt >= 33) {
        this.lastSnapshotAt = now;
        this.networkClient.send('STATE_SNAPSHOT', this.gameState.getSnapshot());
      }
    }
  }

  triggerPerk(player) {
    const perk = player.perk;
    player.perk = null;

    if (perk === 'UFO') {
      this.eventBus.emit(EventType.UFO_ABDUCTION_STARTED, { playerId: player.id });
      this.eventBus.emit(EventType.PLAYER_ACTION_BROADCAST, `${player.nickname} summoned UFO Abduction!`);
      this.physics.startUFOAbduction(player, (car) => {
        this.eventBus.emit(EventType.UFO_ABDUCTION_COMPLETED, { playerId: car.id });
        if (car.id === this.localPlayerId) {
          this.eventBus.emit(EventType.PLAYER_ACTION_BROADCAST, 'UFO Abduction Boost Completed!');
        }
      });
    } else if (perk === 'boost') {
      player.boostTime = 1.4;
      this.eventBus.emit(EventType.PLAY_SFX, 'boost');
    } else if (perk === 'oil') {
      const angleRad = (player.angle * Math.PI) / 180;
      this.gameState.hazards.push({
        id: `oil-${Date.now()}`,
        x: player.x - Math.cos(angleRad) * 22,
        y: player.y - Math.sin(angleRad) * 22
      });
      this.eventBus.emit(EventType.PLAY_SFX, 'oil');
    } else if (perk === 'missile') {
      const angleRad = (player.angle * Math.PI) / 180;
      this.gameState.projectiles.push({
        id: `missile-${Date.now()}`,
        ownerId: player.id,
        x: player.x + Math.cos(angleRad) * 22,
        y: player.y + Math.sin(angleRad) * 22,
        vx: Math.cos(angleRad) * 450,
        vy: Math.sin(angleRad) * 450,
        angle: player.angle,
        life: 2.5
      });
      this.eventBus.emit(EventType.PLAY_SFX, 'boost');
    }

    if (player.id === this.localPlayerId) {
      this.eventBus.emit(EventType.ITEM_COLLECTED, { playerId: player.id, perk: null });
    }
  }

  updateProjectiles(dt) {
    const activeProjectiles = [];

    for (const proj of this.gameState.projectiles) {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      proj.life -= dt;

      let hit = false;
      for (const car of this.gameState.players.values()) {
        if (car.id !== proj.ownerId) {
          if (Math.hypot(car.x - proj.x, car.y - proj.y) < 22) {
            car.spinTime = 0.8;
            car.speed *= 0.2;
            hit = true;
            this.eventBus.emit(EventType.CAR_SPUN_OUT, { carId: car.id });
            this.eventBus.emit(EventType.PLAY_SFX, 'damage');
            break;
          }
        }
      }

      if (!hit && proj.life > 0 && proj.x >= 0 && proj.x <= this.physics.worldWidth && proj.y >= 0 && proj.y <= this.physics.worldHeight) {
        activeProjectiles.push(proj);
      }
    }
    this.gameState.projectiles = activeProjectiles;
  }

  checkHazards() {
    const activeHazards = [];
    for (const hazard of this.gameState.hazards) {
      let triggered = false;
      for (const car of this.gameState.players.values()) {
        if (Math.hypot(car.x - hazard.x, car.y - hazard.y) < 20) {
          car.spinTime = 0.9;
          car.speed *= 0.15;
          triggered = true;
          this.eventBus.emit(EventType.CAR_SPUN_OUT, { carId: car.id });
          this.eventBus.emit(EventType.PLAY_SFX, 'oil');
          break;
        }
      }
      if (!triggered) {
        activeHazards.push(hazard);
      }
    }
    this.gameState.hazards = activeHazards;
  }

  updateItemBoxes(dt) {
    const perks = ['boost', 'oil', 'missile'];
    for (const box of this.gameState.itemBoxes) {
      if (!box.active) {
        box.respawnTimer -= dt;
        if (box.respawnTimer <= 0) {
          box.active = true;
        }
        continue;
      }

      for (const car of this.gameState.players.values()) {
        if (Math.hypot(car.x - box.x, car.y - box.y) < box.radius + 14) {
          if (box.type === 'UFO') {
            // UFO Box Pickup (overwrites regular perks, and persists if already holding UFO)
            car.perk = 'UFO';
            if (car.id === this.localPlayerId) {
              this.eventBus.emit(EventType.ITEM_COLLECTED, { playerId: car.id, perk: 'UFO' });
              this.eventBus.emit(EventType.PLAYER_ACTION_BROADCAST, 'Acquired Special UFO Beam Perk!');
            }
            box.active = false;
            box.respawnTimer = 35.0; // 35s rare respawn cooldown so UFO perk is infrequent
          } else {
            // Standard Box Pickup (cannot overwrite UFO perk)
            if (car.perk !== 'UFO') {
              const chosen = perks[Math.floor(Math.random() * perks.length)];
              car.perk = chosen;
              if (car.id === this.localPlayerId) {
                this.eventBus.emit(EventType.ITEM_COLLECTED, { playerId: car.id, perk: chosen });
              }
            }
            box.active = false;
            box.respawnTimer = 1.0; // 1.0s fast respawn cooldown as requested
          }
          break;
        }
      }
    }
  }

  updateRaceStandings(checkForWinner = true) {
    const cars = Array.from(this.gameState.players.values());
    cars.sort((a, b) => b.lapProgress - a.lapProgress);

    const totalLaps = this.gameState.totalLaps || 3;
    const standings = cars.map((car, idx) => ({
      id: car.id,
      nickname: car.nickname,
      position: idx === 0 ? '1st' : `${idx + 1}${idx === 1 ? 'nd' : idx === 2 ? 'rd' : 'th'}`,
      lap: Math.min(totalLaps, car.lap),
      totalLaps: totalLaps,
      perk: car.perk
    }));

    this.eventBus.emit(EventType.RACE_POSITION_UPDATED, standings);

    // Check race completion
    for (const car of cars) {
      if (checkForWinner && car.lap > totalLaps && this.gameState.status === MatchState.PLAYING) {
        this.gameState.setStatus(MatchState.GAME_OVER);
        this.gameState.winner = car.nickname;
        this.eventBus.emit(EventType.MATCH_ENDED, { winner: car.nickname });
        break;
      }
    }
  }

  applyRemoteSnapshot(snapshot) {
    const previousPlayers = this.gameState.players;
    this.gameState.players = new Map((snapshot.players || []).map((player) => {
      const previous = previousPlayers.get(player.id);
      return [player.id, {
        ...player,
        prevX: previous ? previous.x : player.x,
        prevY: previous ? previous.y : player.y
      }];
    }));
    this.gameState.itemBoxes = snapshot.itemBoxes || [];
    this.gameState.hazards = snapshot.hazards || [];
    this.gameState.projectiles = snapshot.projectiles || [];
    this.gameState.roundTimer = snapshot.roundTimer || 0;
    if (snapshot.totalLaps !== undefined) {
      this.gameState.totalLaps = snapshot.totalLaps;
    }

    const prevStatus = this.gameState.status;
    this.gameState.countdownTimer = snapshot.countdownTimer !== undefined ? snapshot.countdownTimer : 0;
    this.gameState.status = snapshot.status || MatchState.PLAYING;
    this.gameState.pausedBy = snapshot.pausedBy || null;
    this.gameState.winner = snapshot.winner || null;

    if (snapshot.status !== prevStatus) {
      this.eventBus.emit(EventType.GAME_STATE_CHANGED, this.gameState.status);
    }

    if (this.gameState.status === MatchState.COUNTDOWN) {
      const currentCountdown = this.getCountdownStep(this.gameState.countdownTimer);
      if (currentCountdown !== this.lastReportedCountdown && currentCountdown > 0) {
        this.lastReportedCountdown = currentCountdown;
        this.eventBus.emit(EventType.COUNTDOWN_TICK, currentCountdown);
      }
    } else if (prevStatus === MatchState.COUNTDOWN && this.gameState.status === MatchState.PLAYING) {
      this.eventBus.emit(EventType.COUNTDOWN_TICK, 0);
      this.eventBus.emit(EventType.COUNTDOWN_COMPLETED);
    }

    this.eventBus.emit(EventType.TIMER_TICK, Math.floor(this.gameState.roundTimer));
    this.updateRaceStandings(false);
    if (this.gameState.status === MatchState.GAME_OVER && this.gameState.winner) {
      this.eventBus.emit(EventType.MATCH_ENDED, { winner: this.gameState.winner });
    }
  }

  onRender(alpha) {
    const renderView = this.gameState.getRenderView();
    this.renderer.render(renderView, alpha);
    this.hudUI.update(0, renderView);

    // Calculate real-time FPS using rolling exponential moving average of frame deltas
    const now = performance.now();
    if (this.lastFrameTime) {
      const delta = now - this.lastFrameTime;
      if (delta > 0 && delta < 200) {
        this.avgFrameDelta = this.avgFrameDelta === 0 ? delta : (this.avgFrameDelta * 0.9 + delta * 0.1);
      }
    }
    this.lastFrameTime = now;

    if (now - this.fpsTimer >= 500) {
      this.fpsTimer = now;
      if (this.avgFrameDelta > 0) {
        const rawFps = Math.round(1000 / this.avgFrameDelta);
        this.currentFps = Math.max(60, Math.min(240, rawFps));
        const fpsEl = document.getElementById('hud-fps');
        if (fpsEl && this.lastDisplayedFps !== this.currentFps) {
          this.lastDisplayedFps = this.currentFps;
          fpsEl.textContent = `${this.currentFps} FPS`;
        }
      }
    }
  }
}

function bootstrap() {
  const app = new GameApp();
  app.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
