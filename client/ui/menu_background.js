/**
 * client/ui/menu_background.js
 * Responsibility: Mumen (Core Engine & Visuals) & Ville (UI Design)
 *
 * Dynamic animated menu background featuring intersecting horizontal and vertical
 * roadway corridors with cars passing across the screen periodically.
 *
 * Invariants & Guarantees:
 * 1. Strict Zero HTML Canvas. Pure hardware-accelerated DOM elements.
 * 2. Pre-allocated DOM element pool to eliminate garbage collection churn.
 * 3. Horizontal roads and cars pass underneath vertical roads (overpass layering).
 * 4. Cars are centered with mathematical precision in their respective travel lanes.
 * 5. Strict single-car-per-road rule: no two cars ever occupy the same line at once.
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';
import { getCarSpriteUrl, CAR_MODELS, CAR_COLORS } from './lobby.js';

const POOL_PER_ORIENTATION = 4; // 4 horizontal + 4 vertical = 8 pre-allocated cars
const MIN_SPAWN_INTERVAL = 1.0; // Seconds between car pass attempts
const MAX_SPAWN_INTERVAL = 2.2;

export class MenuBackground extends BaseModule {
  constructor() {
    super('MenuBackground');

    this.container = null;
    this.roadsHorizontalLayer = null;
    this.carsHorizontalLayer = null;
    this.roadsVerticalLayer = null;
    this.carsVerticalLayer = null;

    this.roadTopEl = null;
    this.roadBottomEl = null;
    this.roadLeftEl = null;
    this.roadRightEl = null;

    this.roadTopY = 0;
    this.roadBottomY = 0;
    this.roadLeftX = 0;
    this.roadRightX = 0;

    this.carPool = [];
    this.spawnTimer = 0.4; // Swift initial spawn on menu load
    this.isActive = true;

    this.cachedW = window.innerWidth;
    this.cachedH = window.innerHeight;
    this.onResize = null;
  }

  init(context) {
    super.init(context);

    // 1. Root animated background container in #app-root (Shared by all lobby screens)
    let bg = document.getElementById('home-dynamic-bg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'home-dynamic-bg';
      bg.className = 'home-dynamic-bg';
      const root = document.getElementById('app-root') || document.body;
      const homeMenu = document.getElementById('home-menu');
      if (homeMenu) {
        root.insertBefore(bg, homeMenu);
      } else {
        root.appendChild(bg);
      }
    }
    this.container = bg;
    this.container.innerHTML = '';

    // 2. Layer 1: Horizontal Roads (Bottom layer)
    this.roadsHorizontalLayer = document.createElement('div');
    this.roadsHorizontalLayer.className = 'menu-roads-layer menu-roads-horizontal';
    
    this.roadTopEl = document.createElement('div');
    this.roadTopEl.className = 'menu-road menu-road-horizontal menu-road-top';
    this.roadsHorizontalLayer.appendChild(this.roadTopEl);

    this.roadBottomEl = document.createElement('div');
    this.roadBottomEl.className = 'menu-road menu-road-horizontal menu-road-bottom';
    this.roadsHorizontalLayer.appendChild(this.roadBottomEl);

    this.container.appendChild(this.roadsHorizontalLayer);

    // 3. Layer 2: Horizontal Cars (Underneath vertical roads)
    this.carsHorizontalLayer = document.createElement('div');
    this.carsHorizontalLayer.className = 'menu-bg-cars-layer menu-cars-horizontal';
    this.container.appendChild(this.carsHorizontalLayer);

    // 4. Layer 3: Vertical Roads (Acts as overpass above horizontal roads & cars)
    this.roadsVerticalLayer = document.createElement('div');
    this.roadsVerticalLayer.className = 'menu-roads-layer menu-roads-vertical';

    this.roadLeftEl = document.createElement('div');
    this.roadLeftEl.className = 'menu-road menu-road-vertical menu-road-left';
    this.roadsVerticalLayer.appendChild(this.roadLeftEl);

    this.roadRightEl = document.createElement('div');
    this.roadRightEl.className = 'menu-road menu-road-vertical menu-road-right';
    this.roadsVerticalLayer.appendChild(this.roadRightEl);

    this.container.appendChild(this.roadsVerticalLayer);

    // 5. Layer 4: Vertical Cars (Above vertical roads)
    this.carsVerticalLayer = document.createElement('div');
    this.carsVerticalLayer.className = 'menu-bg-cars-layer menu-cars-vertical';
    this.container.appendChild(this.carsVerticalLayer);

    // 6. Pre-allocate Car Element Pool (4 Horizontal + 4 Vertical)
    this.carPool = [];

    // Horizontal car entities (parented to carsHorizontalLayer)
    for (let i = 0; i < POOL_PER_ORIENTATION; i++) {
      const el = document.createElement('div');
      el.className = 'menu-bg-car';
      el.style.display = 'none';

      const img = document.createElement('img');
      img.className = 'menu-bg-car-img';
      img.alt = 'passing car';
      el.appendChild(img);

      this.carsHorizontalLayer.appendChild(el);

      this.carPool.push({
        el,
        img,
        active: false,
        isVertical: false,
        roadId: null,
        x: -999,
        y: -999,
        vx: 0,
        vy: 0,
        angle: 0
      });
    }

    // Vertical car entities (parented to carsVerticalLayer)
    for (let i = 0; i < POOL_PER_ORIENTATION; i++) {
      const el = document.createElement('div');
      el.className = 'menu-bg-car';
      el.style.display = 'none';

      const img = document.createElement('img');
      img.className = 'menu-bg-car-img';
      img.alt = 'passing car';
      el.appendChild(img);

      this.carsVerticalLayer.appendChild(el);

      this.carPool.push({
        el,
        img,
        active: false,
        isVertical: true,
        roadId: null,
        x: -999,
        y: -999,
        vx: 0,
        vy: 0,
        angle: 0
      });
    }

    // 7. Layer 5: Subtle ambient vignette overlay
    const vignette = document.createElement('div');
    vignette.className = 'menu-bg-vignette';
    this.container.appendChild(vignette);

    // 8. Cache road pixel bounds
    this.cacheRoadPositions();

    // 9. Window resize listener
    this.onResize = () => {
      this.cacheRoadPositions();
    };
    window.addEventListener('resize', this.onResize);

    // 10. Listen for match state transitions to halt animation during races
    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      if (status === 'LOBBY') {
        this.resume();
      } else {
        this.pause();
      }
    });
  }

  cacheRoadPositions() {
    this.cachedW = window.innerWidth;
    this.cachedH = window.innerHeight;

    if (!this.container) return;
    const bgRect = this.container.getBoundingClientRect();

    if (this.roadTopEl && bgRect.width > 0) {
      const rect = this.roadTopEl.getBoundingClientRect();
      this.roadTopY = rect.top - bgRect.top;
    } else {
      this.roadTopY = this.cachedH * 0.15;
    }

    if (this.roadBottomEl && bgRect.width > 0) {
      const rect = this.roadBottomEl.getBoundingClientRect();
      this.roadBottomY = rect.top - bgRect.top;
    } else {
      this.roadBottomY = this.cachedH * 0.85 - 64;
    }

    if (this.roadLeftEl && bgRect.width > 0) {
      const rect = this.roadLeftEl.getBoundingClientRect();
      this.roadLeftX = rect.left - bgRect.left;
    } else {
      this.roadLeftX = this.cachedW * 0.10;
    }

    if (this.roadRightEl && bgRect.width > 0) {
      const rect = this.roadRightEl.getBoundingClientRect();
      this.roadRightX = rect.left - bgRect.left;
    } else {
      this.roadRightX = this.cachedW * 0.90 - 64;
    }
  }

  pause() {
    this.isActive = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
    for (const car of this.carPool) {
      if (car.active) {
        car.active = false;
        car.roadId = null;
        car.el.style.display = 'none';
      }
    }
  }

  resume() {
    this.isActive = true;
    if (this.container) {
      this.container.style.display = 'block';
    }
    this.spawnTimer = 0.5;
    this.cacheRoadPositions();
  }

  /**
   * Called every fixed tick from game engine ModuleManager
   * @param {number} dt - Delta time in seconds
   * @param {object} snapshot - Current match state snapshot
   */
  update(dt, snapshot) {
    if (!this.isActive) return;
    if (snapshot && snapshot.status && snapshot.status !== 'LOBBY') {
      return;
    }

    // 1. Advance active passing cars
    for (const car of this.carPool) {
      if (!car.active) continue;

      car.x += car.vx * dt;
      car.y += car.vy * dt;

      // car.x and car.y represent the exact center of the car (elements are 28x52)
      car.el.style.transform = `translate3d(${(car.x - 14).toFixed(1)}px, ${(car.y - 26).toFixed(1)}px, 0) rotate(${car.angle}deg)`;

      // Boundary check: recycle car once outside screen plus generous buffer
      const buffer = 100;
      if (
        car.x < -buffer ||
        car.x > this.cachedW + buffer ||
        car.y < -buffer ||
        car.y > this.cachedH + buffer
      ) {
        car.active = false;
        car.roadId = null;
        car.el.style.display = 'none';
      }
    }

    // 2. Spawn timer for next car pass
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnCar();
      this.spawnTimer = MIN_SPAWN_INTERVAL + Math.random() * (MAX_SPAWN_INTERVAL - MIN_SPAWN_INTERVAL);
    }
  }

  spawnCar() {
    // 1. Identify which road lines are currently occupied
    const occupiedRoads = new Set();
    for (const car of this.carPool) {
      if (car.active && car.roadId) {
        occupiedRoads.add(car.roadId);
      }
    }

    // 2. Filter available roads (Strict guarantee: no two cars move together on the same line at once)
    const allRoads = ['top', 'bottom', 'left', 'right'];
    const availableRoads = allRoads.filter((r) => !occupiedRoads.has(r));
    if (availableRoads.length === 0) {
      return;
    }

    // Pick random available road
    const chosenRoad = availableRoads[Math.floor(Math.random() * availableRoads.length)];
    const isVertical = chosenRoad === 'left' || chosenRoad === 'right';

    // Find free car from pool matching horizontal/vertical layer
    const freeCar = this.carPool.find((c) => !c.active && c.isVertical === isVertical);
    if (!freeCar) return;

    // Pick random vehicle sprite and vibrant color
    const model = CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)];
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    freeCar.img.src = getCarSpriteUrl(model.id, color);

    const w = this.cachedW;
    const h = this.cachedH;
    const speed = 360 + Math.random() * 120;
    const pickLane = Math.random() < 0.5 ? 0 : 1;

    let startX = 0;
    let startY = 0;
    let vx = 0;
    let vy = 0;
    let angle = 0;

    if (chosenRoad === 'top') {
      const roadY = this.roadTopY;
      if (pickLane === 0) {
        // Upper lane: Westbound (leftward), angle 270 deg
        startX = w + 80;
        startY = roadY + 16;
        vx = -speed;
        vy = 0;
        angle = 270;
      } else {
        // Lower lane: Eastbound (rightward), angle 90 deg
        startX = -80;
        startY = roadY + 48;
        vx = speed;
        vy = 0;
        angle = 90;
      }
    } else if (chosenRoad === 'bottom') {
      const roadY = this.roadBottomY;
      if (pickLane === 0) {
        // Upper lane: Westbound (leftward), angle 270 deg
        startX = w + 80;
        startY = roadY + 16;
        vx = -speed;
        vy = 0;
        angle = 270;
      } else {
        // Lower lane: Eastbound (rightward), angle 90 deg
        startX = -80;
        startY = roadY + 48;
        vx = speed;
        vy = 0;
        angle = 90;
      }
    } else if (chosenRoad === 'left') {
      const roadX = this.roadLeftX;
      if (pickLane === 0) {
        // Left lane: Northbound (upward), angle 0 deg
        startX = roadX + 16;
        startY = h + 80;
        vx = 0;
        vy = -speed;
        angle = 0;
      } else {
        // Right lane: Southbound (downward), angle 180 deg
        startX = roadX + 48;
        startY = -80;
        vx = 0;
        vy = speed;
        angle = 180;
      }
    } else if (chosenRoad === 'right') {
      const roadX = this.roadRightX;
      if (pickLane === 0) {
        // Left lane: Northbound (upward), angle 0 deg
        startX = roadX + 16;
        startY = h + 80;
        vx = 0;
        vy = -speed;
        angle = 0;
      } else {
        // Right lane: Southbound (downward), angle 180 deg
        startX = roadX + 48;
        startY = -80;
        vx = 0;
        vy = speed;
        angle = 180;
      }
    }

    freeCar.active = true;
    freeCar.roadId = chosenRoad;
    freeCar.x = startX;
    freeCar.y = startY;
    freeCar.vx = vx;
    freeCar.vy = vy;
    freeCar.angle = angle;

    freeCar.el.style.display = 'block';
    freeCar.el.style.transform = `translate3d(${(freeCar.x - 14).toFixed(1)}px, ${(freeCar.y - 26).toFixed(1)}px, 0) rotate(${freeCar.angle}deg)`;
  }

  destroy() {
    super.destroy();
    if (this.onResize) {
      window.removeEventListener('resize', this.onResize);
    }
    if (this.container) {
      this.container.remove();
    }
    this.carPool = [];
  }
}
