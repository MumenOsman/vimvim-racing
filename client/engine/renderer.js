/**
 * client/engine/renderer.js
 * Responsibility: Mumen (Core Game Engine)
 *
 * 2D Top-Down Cartesian Rendering Engine.
 * High-performance DOM & SVG rendering with zero 3D tilt.
 * Pure hardware-accelerated CSS translate3d transforms.
 * STRICT REQUIREMENT: NO HTML CANVAS.
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';
import { getActiveTrack, getTrackSvgPath } from './track.js';
import { MatchState } from './state.js';
import { getCarSpriteUrl } from '../ui/lobby.js';

export class DOMRenderer extends BaseModule {
  constructor() {
    super('DOMRenderer');
    this.gameViewport = null;
    this.trackStage = null;
    this.bgContainer = null;
    this.entitiesContainer = null;
    this.countdownOverlay = null;

    this.carElements = new Map(); // id -> { el, imgEl, labelEl, colorEl, lastX, lastY, lastAngle }
    this.boxElements = new Map();
    this.hazardElements = new Map();
    this.projectileElements = new Map();

    this.currentTrack = getActiveTrack();
    this.localPlayerId = 'player-1';
    this.camX = 0;
    this.camY = 0;
    this.camScale = 1.0;
    this.cameraInitialized = false;
    this.currentStatus = MatchState.LOBBY;

    this.cachedVpW = 1200;
    this.cachedVpH = 700;
    this.onResizeHandler = null;
  }

  setTrack(track) {
    this.currentTrack = track;
    this.cameraInitialized = false;

    if (this.trackStage) {
      this.trackStage.style.width = `${track.width}px`;
      this.trackStage.style.height = `${track.height}px`;
    }

    this.carElements.clear();
    this.boxElements.clear();
    this.hazardElements.clear();
    this.projectileElements.clear();

    if (this.entitiesContainer) {
      this.entitiesContainer.innerHTML = '';
    }

    this.renderStageBackground();
  }

  init(context) {
    super.init(context);
    this.gameViewport = document.getElementById('game-viewport');
    if (this.gameViewport) {
      this.updateViewportCache();
      this.buildStage();
    }

    this.onResizeHandler = () => this.updateViewportCache();
    window.addEventListener('resize', this.onResizeHandler);

    this.subscribe(EventType.LOCAL_PLAYER_CHANGED, (id) => {
      this.localPlayerId = id;
    });

    this.subscribe(EventType.COUNTDOWN_TICK, (val) => this.showCountdown(val));
    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      this.currentStatus = status;
      if (status === MatchState.READY) {
        this.showReadyPrompt();
      } else if (status === MatchState.LOBBY) {
        if (this.countdownOverlay) {
          this.countdownOverlay.style.display = 'none';
        }
      }
    });
  }

  updateViewportCache() {
    if (this.gameViewport) {
      this.cachedVpW = this.gameViewport.clientWidth || 1200;
      this.cachedVpH = this.gameViewport.clientHeight || 700;
    }
  }

  /**
   * Build persistent DOM Stage hierarchy (Zero DOM node churn during gameplay)
   */
  buildStage() {
    const existingStage = document.getElementById('track-stage');
    if (existingStage) existingStage.remove();
    const existingOverlay = document.getElementById('countdown-overlay');
    if (existingOverlay) existingOverlay.remove();

    const track = this.currentTrack || getActiveTrack();

    // 1. Root Stage Layer
    this.trackStage = document.createElement('div');
    this.trackStage.id = 'track-stage';
    this.trackStage.style.width = `${track.width}px`;
    this.trackStage.style.height = `${track.height}px`;

    // 2. Background Layer (Track graphics, grass/soil tiles, lake, kerbs)
    this.bgContainer = document.createElement('div');
    this.bgContainer.id = 'track-bg-layer';
    this.bgContainer.style.position = 'absolute';
    this.bgContainer.style.top = '0';
    this.bgContainer.style.left = '0';
    this.bgContainer.style.width = '100%';
    this.bgContainer.style.height = '100%';

    // 3. Dynamic Entities Layer (Cars, Item boxes, Hazards, Projectiles)
    this.entitiesContainer = document.createElement('div');
    this.entitiesContainer.id = 'track-entities-layer';
    this.entitiesContainer.style.position = 'absolute';
    this.entitiesContainer.style.top = '0';
    this.entitiesContainer.style.left = '0';
    this.entitiesContainer.style.width = '100%';
    this.entitiesContainer.style.height = '100%';
    this.entitiesContainer.style.pointerEvents = 'none';

    // 4. Dynamic UFO Abduction Actor
    this.ufoActor = document.createElement('div');
    this.ufoActor.id = 'ufo-abduction-actor';
    this.ufoActor.className = 'ufo-abduction-actor';
    this.ufoActor.style.display = 'none';
    this.ufoActor.innerHTML = `
      <div class="ufo-saucer">
        <div class="ufo-saucer-dome"></div>
        <div class="ufo-saucer-body"></div>
        <div class="ufo-saucer-lights">
          <div class="ufo-saucer-light"></div>
          <div class="ufo-saucer-light"></div>
          <div class="ufo-saucer-light"></div>
        </div>
      </div>
      <div class="ufo-tractor-beam"></div>
    `;

    // 5. Pre-race Ready & Countdown Visual Overlay (Top-Anchored)
    this.countdownOverlay = document.createElement('div');
    this.countdownOverlay.id = 'countdown-overlay';
    this.countdownOverlay.style.display = 'none';
    this.countdownOverlay.innerHTML = `
      <div id="countdown-banner" class="countdown-banner">
        <span id="countdown-text">READY</span>
      </div>
    `;

    this.trackStage.appendChild(this.bgContainer);
    this.trackStage.appendChild(this.entitiesContainer);
    this.trackStage.appendChild(this.ufoActor);

    this.gameViewport.appendChild(this.trackStage);
    this.gameViewport.appendChild(this.countdownOverlay);

    this.renderStageBackground();
  }

  /**
   * Render or update background SVG/tiles for current active track
   */
  renderStageBackground() {
    if (!this.bgContainer) return;

    const track = this.currentTrack || getActiveTrack();
    const trackW = track.width;
    const trackH = track.height;
    const roadW = track.roadWidth;
    const totalKerbWidth = roadW + track.kerbWidth * 2;
    const trackSvgPath = track.svgPath || getTrackSvgPath(track.waypoints);

    if (track.theme === 'kit') {
      // 100% Asset-Assembled Grand Prix Circuit (Asphalt Straights & Turns, Curbs, Verges, Landscaping, Pavilions)
      this.bgContainer.innerHTML = `
        <svg id="track-svg" width="${trackW}" height="${trackH}" viewBox="0 0 ${trackW} ${trackH}" xmlns="http://www.w3.org/2000/svg">
          <!-- Assembled Modular Asset Circuit -->
          <image href="${track.image || '/assets/kit/track_assembled.png'}" x="0" y="0" width="${trackW}" height="${trackH}"/>

          <!-- Starting Grid Slots -->
          ${track.startingGrid.map((slot) => `
            <rect x="${slot.x - 20}" y="${slot.y - 16}" width="40" height="32" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="5 5" rx="3" opacity="0.85"/>
            <text x="${slot.x - 12}" y="${slot.y + 5}" font-family="monospace" font-size="11" font-weight="bold" fill="#ffffff">${slot.slot}</text>
          `).join('')}

          <!-- Start / Finish Timing Line at (${track.checkpoints[0]?.x || 743}, ${track.checkpoints[0]?.y || 800}) -->
          <g id="start-finish-line" transform="translate(${track.checkpoints[0]?.x || 743}, ${track.checkpoints[0]?.y || 800})">
            <line x1="0" y1="-80" x2="0" y2="80" stroke="#ffffff" stroke-width="8"/>
            <line x1="0" y1="-80" x2="0" y2="80" stroke="#0f172a" stroke-width="8" stroke-dasharray="8 8"/>
          </g>

          <!-- Checkpoint Sector Timing Gates -->
          ${track.checkpoints.filter(cp => !cp.isFinish).map(cp => {
            const rot = (cp.targetAngle !== undefined) ? cp.targetAngle + 90 : 0;
            return `
            <g id="cp-gate-${cp.index}" class="cp-gate" transform="translate(${cp.x}, ${cp.y}) rotate(${rot})">
              <line x1="-55" y1="0" x2="55" y2="0" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
              <line x1="-55" y1="0" x2="55" y2="0" stroke="#0f172a" stroke-width="2" stroke-dasharray="6 6" opacity="0.4"/>
            </g>`;
          }).join('')}
        </svg>
      `;
    }
  }

  showReadyPrompt() {
    if (!this.countdownOverlay) return;
    const banner = this.countdownOverlay.querySelector('#countdown-banner');
    const text = this.countdownOverlay.querySelector('#countdown-text');
    if (!banner || !text) return;

    this.countdownOverlay.style.display = 'flex';
    text.innerHTML = '<span class="ready-sub">PRESS</span> <span class="ready-key">K</span> <span class="ready-sub">OR [UP] TO START</span>';
    text.className = 'ready-prompt-text';
    banner.className = 'countdown-banner ready-banner-pulse';
  }

  showCountdown(value) {
    if (!this.countdownOverlay) return;

    const banner = this.countdownOverlay.querySelector('#countdown-banner');
    const text = this.countdownOverlay.querySelector('#countdown-text');
    if (!banner || !text) return;

    this.countdownOverlay.style.display = 'flex';

    if (value > 0) {
      text.textContent = String(value);
      text.className = 'countdown-num';
      banner.className = 'countdown-banner countdown-active';
    } else if (value === 0) {
      text.textContent = 'LIGHTS OUT! GO!';
      text.className = 'countdown-go';
      banner.className = 'countdown-banner countdown-go-banner';
      setTimeout(() => {
        if (this.countdownOverlay) {
          this.countdownOverlay.style.display = 'none';
        }
      }, 850);
    }
  }

  /**
   * 60 FPS Render Tick (Animation Frame)
   * @param {object} snapshot - Immutable racing game state
   * @param {number} alpha - Interpolation factor
   */
  render(snapshot, alpha) {
    if (!snapshot || !this.trackStage) return;

    // Update Camera Zoom & Follow
    this.updateCamera(snapshot);

    // Render Players and Bots
    this.renderCars(snapshot.players);

    // Render Mystery Boxes
    this.renderItemBoxes(snapshot.itemBoxes || []);

    // Render Oil Hazards
    this.renderHazards(snapshot.hazards || []);

    // Render Projectiles
    this.renderProjectiles(snapshot.projectiles || []);

    // Render UFO Abduction Actor
    this.renderUFOAbduction(snapshot.players || []);
  }

  /**
   * Module lifecycle update step (no-op for renderer to prevent duplicate DOM writes)
   */
  update(deltaTime, snapshot) {
    // Pure rendering executed strictly on requestAnimationFrame via render()
  }

  /**
   * Hardware-accelerated camera zoom and car tracking
   * @param {object} snapshot
   */
  updateCamera(snapshot) {
    if (!this.gameViewport || !this.trackStage) return;

    const vpW = this.cachedVpW || 1200;
    const vpH = this.cachedVpH || 700;
    const track = this.currentTrack || getActiveTrack();
    const trackW = track.width;
    const trackH = track.height;

    if (this.currentStatus === MatchState.LOBBY) {
      // In Lobby, display full circuit centered nicely
      const scaleFit = Math.min((vpW * 0.96) / trackW, (vpH * 0.92) / trackH);
      const targetX = (vpW - trackW * scaleFit) / 2;
      const targetY = (vpH - trackH * scaleFit) / 2;

      if (!this.cameraInitialized) {
        this.camX = targetX;
        this.camY = targetY;
        this.camScale = scaleFit;
        this.cameraInitialized = true;
      } else {
        this.camX += (targetX - this.camX) * 0.16;
        this.camY += (targetY - this.camY) * 0.16;
        this.camScale += (scaleFit - this.camScale) * 0.16;
      }
    } else {
      // Zoom into target car and track it dynamically
      const zoom = Math.max(1.15, Math.min(1.65, vpH / 440));
      const players = snapshot.players;
      let targetCar = null;

      if (players) {
        if (players instanceof Map) {
          targetCar = players.get(this.localPlayerId) || players.values().next().value;
        } else if (Array.isArray(players)) {
          targetCar = players.find((p) => p.id === this.localPlayerId) || players[0];
        } else if (typeof players[Symbol.iterator] === 'function') {
          for (const p of players) {
            if (p.id === this.localPlayerId) {
              targetCar = p;
              break;
            }
            if (!targetCar) targetCar = p;
          }
        }
      }

      let targetX = track.startingGrid && track.startingGrid[0] ? track.startingGrid[0].x : trackW / 2;
      let targetY = track.startingGrid && track.startingGrid[0] ? track.startingGrid[0].y : trackH / 2;

      if (targetCar && typeof targetCar.x === 'number' && typeof targetCar.y === 'number') {
        const record = this.carElements.get(targetCar.id);
        if (record && typeof record.renderX === 'number' && typeof record.renderY === 'number') {
          targetX = record.renderX;
          targetY = record.renderY;
        } else {
          targetX = targetCar.x;
          targetY = targetCar.y;
        }
      }

      const targetCamX = vpW / 2 - targetX * zoom;
      const targetCamY = vpH / 2 - targetY * zoom;

      if (!this.cameraInitialized) {
        this.camX = targetCamX;
        this.camY = targetCamY;
        this.camScale = zoom;
        this.cameraInitialized = true;
      } else {
        const lerpFactor = 0.14;
        this.camX += (targetCamX - this.camX) * lerpFactor;
        this.camY += (targetCamY - this.camY) * lerpFactor;
        this.camScale += (zoom - this.camScale) * 0.08;
      }
    }

    this.trackStage.style.transformOrigin = '0 0';
    this.trackStage.style.transform = `translate3d(${this.camX.toFixed(2)}px, ${this.camY.toFixed(2)}px, 0) scale(${this.camScale.toFixed(3)})`;
  }

  /**
   * Render Top-Down Single-Element PNG Car Sprites with translate3d and rotation
   */
  renderCars(players) {
    if (!players || !this.entitiesContainer) return;
    const activeIds = new Set();
    const carList = players.values ? players.values() : players;

    for (const car of carList) {
      activeIds.add(car.id);
      let record = this.carElements.get(car.id);

      if (!record) {
        const el = document.createElement('div');
        el.className = 'entity-car-sprite';
        el.id = `car-${car.id}`;

        const carModelNum = car.carModel || 1;
        const carColor = car.color || '#dc2626';
        const spriteUrl = getCarSpriteUrl(carModelNum, carColor);

        el.innerHTML = `
          <img class="car-sprite-img" src="${spriteUrl}" alt="car"/>
          <div class="car-nickname-label">${car.nickname || 'Racer'}</div>
        `;

        this.entitiesContainer.appendChild(el);
        record = {
          el,
          imgEl: el.querySelector('.car-sprite-img'),
          labelEl: el.querySelector('.car-nickname-label'),
          carModel: carModelNum,
          color: carColor,
          nickname: car.nickname,
          renderX: car.x,
          renderY: car.y,
          renderAngle: car.angle
        };
        this.carElements.set(car.id, record);
      } else {
        // Update car appearance if model or color changed
        const carModelNum = car.carModel || 1;
        const carColor = car.color || '#dc2626';
        if ((record.carModel !== carModelNum || record.color !== carColor) && record.imgEl) {
          record.carModel = carModelNum;
          record.color = carColor;
          record.imgEl.src = getCarSpriteUrl(carModelNum, carColor);
        }
        if (record.nickname !== car.nickname && record.labelEl) {
          record.nickname = car.nickname;
          record.labelEl.textContent = car.nickname || 'Racer';
        }
      }

      // Smooth 60 FPS lerp interpolation (eliminates 30Hz snapshot stepping)
      const dist = Math.hypot(car.x - record.renderX, car.y - record.renderY);
      if (dist > 80 || isNaN(record.renderX)) {
        record.renderX = car.x;
        record.renderY = car.y;
        record.renderAngle = car.angle;
      } else {
        const lerpFactor = 0.32;
        record.renderX += (car.x - record.renderX) * lerpFactor;
        record.renderY += (car.y - record.renderY) * lerpFactor;

        let diffAngle = (car.angle - record.renderAngle) % 360;
        if (diffAngle > 180) diffAngle -= 360;
        if (diffAngle < -180) diffAngle += 360;
        record.renderAngle += diffAngle * lerpFactor;
      }

      // Centered translate3d and rotation from interpolated coordinates
      const posX = record.renderX - 16;
      const posY = record.renderY - 26;
      const renderAngle = record.renderAngle + 90;

      record.el.style.transform = `translate3d(${posX.toFixed(1)}px, ${posY.toFixed(1)}px, 0) rotate(${renderAngle.toFixed(1)}deg)`;

      if (car.spinTime > 0) {
        record.el.classList.add('car-spinning');
      } else {
        record.el.classList.remove('car-spinning');
      }

      if (car.boostTime > 0) {
        record.el.classList.add('car-boosting');
      } else {
        record.el.classList.remove('car-boosting');
      }
    }

    // Garbage collection of disconnected cars
    for (const [id, record] of this.carElements.entries()) {
      if (!activeIds.has(id)) {
        if (record.el.parentNode) {
          record.el.parentNode.removeChild(record.el);
        }
        this.carElements.delete(id);
      }
    }
  }

  /**
   * Render Mystery Item Boxes (Standard & UFO Green Boxes)
   */
  renderItemBoxes(boxes) {
    if (!this.entitiesContainer) return;
    const activeIds = new Set();

    for (const box of boxes) {
      if (!box.active) continue;
      activeIds.add(box.id);

      let el = this.boxElements.get(box.id);
      if (!el) {
        el = document.createElement('div');
        el.className = box.type === 'UFO' ? 'entity-box entity-box-ufo' : 'entity-box';
        el.innerHTML = `<span class="box-symbol">${box.type === 'UFO' ? 'UFO' : '?'}</span>`;
        this.entitiesContainer.appendChild(el);
        this.boxElements.set(box.id, el);
      }

      el.style.transform = `translate3d(${(box.x - 11).toFixed(1)}px, ${(box.y - 11).toFixed(1)}px, 0)`;
    }

    for (const [id, el] of this.boxElements.entries()) {
      if (!activeIds.has(id)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        this.boxElements.delete(id);
      }
    }
  }

  /**
   * Render Dynamic UFO Abduction Actor
   */
  renderUFOAbduction(players) {
    if (!this.ufoActor || !players) return;

    const carList = players.values ? players.values() : players;
    let abductingCar = null;
    for (const p of carList) {
      if (p.abduction && p.abduction.active) {
        abductingCar = p;
        break;
      }
    }
    if (!abductingCar) {
      this.ufoActor.style.display = 'none';
      return;
    }

    this.ufoActor.style.display = 'flex';
    const ufoX = abductingCar.x - 40;
    const ufoY = abductingCar.y - 85;
    this.ufoActor.style.transform = `translate3d(${ufoX.toFixed(1)}px, ${ufoY.toFixed(1)}px, 0)`;
  }

  /**
   * Render Oil Hazard Slicks
   */
  renderHazards(hazards) {
    if (!this.entitiesContainer) return;
    const activeIds = new Set();

    for (const h of hazards) {
      activeIds.add(h.id);
      let el = this.hazardElements.get(h.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'entity-hazard-oil';
        el.innerHTML = `<img src="/assets/kit/Game_Props_Items/Oil.png" style="width:100%;height:100%;object-fit:contain;" alt="oil"/>`;
        this.entitiesContainer.appendChild(el);
        this.hazardElements.set(h.id, el);
      }
      el.style.transform = `translate3d(${(h.x - 14).toFixed(1)}px, ${(h.y - 14).toFixed(1)}px, 0)`;
    }

    for (const [id, el] of this.hazardElements.entries()) {
      if (!activeIds.has(id)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        this.hazardElements.delete(id);
      }
    }
  }

  /**
   * Render Projectiles
   */
  renderProjectiles(projectiles) {
    if (!this.entitiesContainer) return;
    const activeIds = new Set();

    for (const p of projectiles) {
      activeIds.add(p.id);
      let el = this.projectileElements.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'entity-missile';
        this.entitiesContainer.appendChild(el);
        this.projectileElements.set(p.id, el);
      }
      const rot = ((p.angle || 0) + 90).toFixed(1);
      el.style.transform = `translate3d(${(p.x - 6).toFixed(1)}px, ${(p.y - 10).toFixed(1)}px, 0) rotate(${rot}deg)`;
    }

    for (const [id, el] of this.projectileElements.entries()) {
      if (!activeIds.has(id)) {
        if (el.parentNode) el.parentNode.removeChild(el);
        this.projectileElements.delete(id);
      }
    }
  }

  destroy() {
    super.destroy();
    if (this.onResizeHandler) {
      window.removeEventListener('resize', this.onResizeHandler);
      this.onResizeHandler = null;
    }
    if (this.trackStage && this.trackStage.parentNode) {
      this.trackStage.parentNode.removeChild(this.trackStage);
    }
    if (this.countdownOverlay && this.countdownOverlay.parentNode) {
      this.countdownOverlay.parentNode.removeChild(this.countdownOverlay);
    }
    this.carElements.clear();
    this.boxElements.clear();
    this.hazardElements.clear();
    this.projectileElements.clear();
  }
}
