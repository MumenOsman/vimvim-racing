/**
 * client/engine/physics.js
 * Responsibility: Mumen (Core Game Engine)
 *
 * 2D Arcade Racing Physics:
 * - Car steering, momentum, acceleration, braking, drifting
 * - Multi-tier surface friction (Asphalt 1.0, Kerbs 0.9, Gravel/Grass 0.4)
 * - Car-to-car elastic collision and overlap separation
 * - Checkpoint / Lap progress tracking across 8 gates
 * - NPC AI waypoint navigation
 */

import { getActiveTrack, checkTrackSurface } from './track.js';

export const CAR_RADIUS = 13; // 26px collision diameter

export class PhysicsEngine {
  constructor() {
    this.currentTrack = getActiveTrack();
    this.worldWidth = this.currentTrack.width;
    this.worldHeight = this.currentTrack.height;
    this.checkpoints = this.currentTrack.checkpoints;
    this.waypoints = this.currentTrack.waypoints;
    this.obstacles = this.currentTrack.obstacles || [];

    // Driving physics constants (in World Units / second)
    this.baseMaxSpeed = 260;
    this.baseAccel = 320;
    this.brakeForce = 400;
    this.friction = 140;
    this.turnRate = 210; // Degrees per second

    // Active collision contact tracking to prevent sound looping during sustained proximity
    this.activeCarContacts = new Set();
  }

  setTrack(track) {
    this.currentTrack = track;
    this.worldWidth = track.width;
    this.worldHeight = track.height;
    this.checkpoints = track.checkpoints;
    this.waypoints = track.waypoints;
    this.obstacles = track.obstacles || [];
    this.activeCarContacts.clear();
  }

  /**
   * Start UFO Abduction sequence for a car
   */
  startUFOAbduction(car, onComplete = null) {
    const cps = this.checkpoints || this.currentTrack.checkpoints;
    const totalCps = cps.length;
    const startCp = car.lastCheckpoint !== undefined ? car.lastCheckpoint : 0;
    const targetCpIndex = (startCp + 2) % totalCps;
    const targetCp = cps[targetCpIndex];

    car.abduction = {
      active: true,
      startX: car.x,
      startY: car.y,
      startAngle: car.angle,
      targetX: targetCp.x,
      targetY: targetCp.y,
      targetAngle: targetCp.targetAngle !== undefined ? targetCp.targetAngle : car.angle,
      startCheckpoint: startCp,
      targetCheckpoint: targetCpIndex,
      elapsed: 0,
      duration: 2.2,
      onComplete
    };
  }

  /**
   * Update a car's physics step
   * @param {object} car - Car entity state
   * @param {{ gas: boolean, brake: boolean, steer: number, action: boolean }} controls
   * @param {number} dt - Fixed delta time
   * @param {boolean} locked - If true (e.g. countdown), car cannot accelerate
   * @returns {{ actionTriggered: boolean }}
   */
  updateCar(car, controls, dt, locked = false, onMissedCheckpoint = null) {
    let actionTriggered = false;

    // 0. Handle active UFO abduction state
    if (car.abduction && car.abduction.active) {
      const abd = car.abduction;
      abd.elapsed += dt;
      const t = Math.min(1.0, abd.elapsed / abd.duration);

      // Smooth cubic ease-in-out
      const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      car.x = abd.startX + (abd.targetX - abd.startX) * ease;
      car.y = abd.startY + (abd.targetY - abd.startY) * ease;

      let angleDiff = abd.targetAngle - abd.startAngle;
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;
      car.angle = (abd.startAngle + angleDiff * ease + 360) % 360;

      car.speed = 0;
      car.vx = 0;
      car.vy = 0;

      if (t >= 1.0) {
        car.abduction.active = false;
        car.x = abd.targetX;
        car.y = abd.targetY;
        car.angle = abd.targetAngle;
        car.speed = 220; // boost exit velocity
        car.boostTime = 0.8;

        // Advance 2 checkpoints and count laps if passing start/finish
        const cps = this.checkpoints || this.currentTrack.checkpoints;
        const totalCps = cps.length;
        const cp1 = (abd.startCheckpoint + 1) % totalCps;
        const cp2 = (abd.startCheckpoint + 2) % totalCps;

        if ((cp1 === 0 || cp2 === 0) && car.hasStarted) {
          car.lap += 1;
        }
        car.lastCheckpoint = cp2;
        car.hasStarted = true;
        car.lapProgress = car.lap + (car.lastCheckpoint / totalCps);

        // If bot, sync waypoint index
        if (car.waypointIndex !== undefined) {
          const wps = this.waypoints || this.currentTrack.waypoints;
          let closestIdx = 0;
          let closestDist = Infinity;
          for (let i = 0; i < wps.length; i++) {
            const wp = wps[i];
            const d = Math.hypot(car.x - wp.x, car.y - wp.y);
            if (d < closestDist) {
              closestDist = d;
              closestIdx = i;
            }
          }
          car.waypointIndex = (closestIdx + 1) % wps.length;
        }

        if (typeof abd.onComplete === 'function') {
          abd.onComplete(car);
        }
      }
      return { actionTriggered: false };
    }

    // 1. Handle spin-out state (from oil or projectile hit)
    if (car.spinTime > 0) {
      car.spinTime -= dt;
      car.speed = Math.max(0, car.speed - this.friction * 2.5 * dt);
      const angleRad = (car.angle * Math.PI) / 180;
      car.x += Math.cos(angleRad) * car.speed * dt;
      car.y += Math.sin(angleRad) * car.speed * dt;
      this.clampToArena(car);
      return { actionTriggered: false };
    }

    if (locked) {
      // Locked on starting grid
      car.speed = 0;
      car.vx = 0;
      car.vy = 0;
      return { actionTriggered: false };
    }

    // 2. Check surface friction
    const surface = checkTrackSurface(car.x, car.y, this.currentTrack);
    const surfaceMult = surface.friction;

    // Boost multiplier
    const boostMult = car.boostTime > 0 ? 1.45 : 1.0;
    if (car.boostTime > 0) {
      car.boostTime -= dt;
    }

    const maxSpeed = this.baseMaxSpeed * surfaceMult * boostMult;
    const accel = this.baseAccel * surfaceMult * (car.boostTime > 0 ? 1.5 : 1.0);

    // 3. Accelerate / Brake / Reverse
    if (controls.gas) {
      if (car.speed < maxSpeed) {
        car.speed = Math.min(maxSpeed, car.speed + accel * dt);
      } else if (car.speed > maxSpeed) {
        // Drag deceleration down towards maxSpeed when boost expires or car goes off-track
        const excessDrag = (this.friction * 2.5) * (surfaceMult < 1.0 ? 3.0 : 1.0);
        car.speed = Math.max(maxSpeed, car.speed - excessDrag * dt);
      }
    } else if (controls.brake) {
      if (car.speed > -maxSpeed * 0.4) {
        car.speed = Math.max(-maxSpeed * 0.4, car.speed - this.brakeForce * dt);
      }
    } else {
      // Natural rolling friction (slows down more aggressively on grass/kerbs)
      const rollFriction = this.friction * (surfaceMult < 1.0 ? 2.0 : 1.0);
      if (car.speed > 0) {
        car.speed = Math.max(0, car.speed - rollFriction * dt);
      } else if (car.speed < 0) {
        car.speed = Math.min(0, car.speed + rollFriction * dt);
      }
    }

    // 4. Steering (only active when moving)
    const steer = typeof controls.steer === 'number'
      ? controls.steer
      : (controls.left ? -1 : controls.right ? 1 : 0);
    if (steer !== 0 && Math.abs(car.speed) > 8) {
      const speedRatio = Math.min(1.0, Math.abs(car.speed) / (this.baseMaxSpeed * 0.45));
      const direction = car.speed >= 0 ? 1 : -1;
      car.angle += steer * this.turnRate * speedRatio * direction * dt;
      car.angle = (car.angle + 360) % 360;
    }

    // 5. Integrate position along car's facing angle
    const angleRad = (car.angle * Math.PI) / 180;
    car.vx = Math.cos(angleRad) * car.speed;
    car.vy = Math.sin(angleRad) * car.speed;

    car.x += car.vx * dt;
    car.y += car.vy * dt;

    this.clampToArena(car);
    const { hitObstacle, isNewObstacleHit } = this.resolveObstacleCollision(car);

    // 6. Action button trigger
    if (controls.action && !car.actionPrev) {
      actionTriggered = true;
    }
    car.actionPrev = controls.action;

    // 7. Checkpoint & Lap Progress
    this.updateCheckpoints(car, onMissedCheckpoint);

    return { actionTriggered, hitObstacle, isNewObstacleHit };
  }

  /**
   * Resolve collision between a car and solid obstacles (Spectator tents & buildings)
   * @returns {{ hitObstacle: boolean, isNewObstacleHit: boolean }}
   */
  resolveObstacleCollision(car) {
    const obstacles = this.obstacles || this.currentTrack.obstacles || [];
    const r = CAR_RADIUS;
    let hit = false;

    for (const obs of obstacles) {
      const nearestX = Math.max(obs.x, Math.min(car.x, obs.x + obs.width));
      const nearestY = Math.max(obs.y, Math.min(car.y, obs.y + obs.height));

      const dx = car.x - nearestX;
      const dy = car.y - nearestY;
      const dist = Math.hypot(dx, dy);

      if (dist < r) {
        hit = true;
        const overlap = r - dist;
        let nx = dx / (dist || 0.001);
        let ny = dy / (dist || 0.001);

        if (dist < 0.001) {
          const dl = Math.abs(car.x - obs.x);
          const dr = Math.abs(car.x - (obs.x + obs.width));
          const dt = Math.abs(car.y - obs.y);
          const db = Math.abs(car.y - (obs.y + obs.height));
          const minD = Math.min(dl, dr, dt, db);
          if (minD === dl) { nx = -1; ny = 0; }
          else if (minD === dr) { nx = 1; ny = 0; }
          else if (minD === dt) { nx = 0; ny = -1; }
          else { nx = 0; ny = 1; }
        }

        car.x += nx * (overlap + 1.5);
        car.y += ny * (overlap + 1.5);

        // Soft cushion rebound off solid obstacle with moderate speed penalty
        if (car.speed > 0) {
          car.speed = -car.speed * 0.35;
        }
      }
    }

    const isNewObstacleHit = hit && !car.inObstacleContact;
    car.inObstacleContact = hit;

    return { hitObstacle: hit, isNewObstacleHit };
  }

  /**
   * Resolve car-to-car collisions between all active vehicles with cushion bounce
   * @param {Array<object>} cars
   * @returns {{ hadCollision: boolean, hasNewImpact: boolean }}
   */
  resolveCarCollisions(cars) {
    let hadCollision = false;
    let hasNewImpact = false;
    const currentContacts = new Set();
    const count = cars.length;
    const minDist = CAR_RADIUS * 2; // 26px

    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const c1 = cars[i];
        const c2 = cars[j];

        const dx = c2.x - c1.x;
        const dy = c2.y - c1.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0.001 && dist < minDist) {
          hadCollision = true;

          const id1 = c1.id !== undefined ? String(c1.id) : `idx-${i}`;
          const id2 = c2.id !== undefined ? String(c2.id) : `idx-${j}`;
          const pairKey = id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
          currentContacts.add(pairKey);

          if (!this.activeCarContacts.has(pairKey)) {
            hasNewImpact = true;
          }

          // Normal collision vector
          const nx = dx / dist;
          const ny = dy / dist;

          // 1. Positional overlap separation
          const overlap = minDist - dist;
          c1.x -= nx * (overlap * 0.55);
          c1.y -= ny * (overlap * 0.55);
          c2.x += nx * (overlap * 0.55);
          c2.y += ny * (overlap * 0.55);

          // 2. Velocity calculation
          const rad1 = (c1.angle * Math.PI) / 180;
          const rad2 = (c2.angle * Math.PI) / 180;
          const v1x = c1.vx !== undefined && c1.vx !== 0 ? c1.vx : Math.cos(rad1) * c1.speed;
          const v1y = c1.vy !== undefined && c1.vy !== 0 ? c1.vy : Math.sin(rad1) * c1.speed;
          const v2x = c2.vx !== undefined && c2.vx !== 0 ? c2.vx : Math.cos(rad2) * c2.speed;
          const v2y = c2.vy !== undefined && c2.vy !== 0 ? c2.vy : Math.sin(rad2) * c2.speed;

          const rvx = v2x - v1x;
          const rvy = v2y - v1y;
          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal < 0) {
            const restitution = 0.65; // Soft cushion bounce
            const impulse = -(1 + restitution) * velAlongNormal * 0.5;
            const bounceImpulse = impulse + 35; // Distinct outward cushion push

            c1.vx = v1x - bounceImpulse * nx;
            c1.vy = v1y - bounceImpulse * ny;
            c2.vx = v2x + bounceImpulse * nx;
            c2.vy = v2y + bounceImpulse * ny;

            // Moderate speed penalty: cars push apart and lose ~30% speed
            c1.speed = Math.max(0, c1.speed * 0.70);
            c2.speed = Math.max(0, c2.speed * 0.70);
          }
        }
      }
    }

    this.activeCarContacts = currentContacts;
    return { hadCollision, hasNewImpact };
  }

  /**
   * Checkpoint gate detection for lap counting & missed gate warning
   */
  updateCheckpoints(car, onMissedCheckpoint = null) {
    const cps = this.checkpoints || this.currentTrack.checkpoints;
    const totalCps = cps.length;
    const nextCpIndex = (car.lastCheckpoint + 1) % totalCps;
    const targetCp = cps[nextCpIndex];

    const distToTarget = Math.hypot(car.x - targetCp.x, car.y - targetCp.y);
    if (distToTarget <= targetCp.radius) {
      car.lastCheckpoint = nextCpIndex;

      // Completed a full lap when finish line is crossed in sequence
      if (targetCp.isFinish && car.lastCheckpoint === 0 && car.hasStarted) {
        car.lap += 1;
      }
      car.hasStarted = true;
    } else {
      // Detect if car prematurely cut across into another checkpoint
      for (let i = 0; i < totalCps; i++) {
        if (i !== nextCpIndex && i !== car.lastCheckpoint) {
          const cp = cps[i];
          const dist = Math.hypot(car.x - cp.x, car.y - cp.y);
          if (dist <= cp.radius) {
            const now = performance.now();
            if (!car.lastWarnTime || now - car.lastWarnTime > 3500) {
              car.lastWarnTime = now;
              if (typeof onMissedCheckpoint === 'function') {
                const requiredName = targetCp.name || `Sector ${nextCpIndex}`;
                onMissedCheckpoint(car, requiredName);
              }
            }
            break;
          }
        }
      }
    }

    // Track fractional lap progress for race position calculation
    car.lapProgress = car.lap + (car.lastCheckpoint / totalCps);
  }

  /**
   * AI waypoint navigation for NPC opponent car
   */
  updateNPC(bot, dt, locked = false, onMissedCheckpoint = null) {
    if (locked) {
      bot.speed = 0;
      bot.vx = 0;
      bot.vy = 0;
      return { actionTriggered: false };
    }

    const wps = this.waypoints || this.currentTrack.waypoints;
    const target = wps[bot.waypointIndex || 0];
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 50) {
      bot.waypointIndex = ((bot.waypointIndex || 0) + 1) % wps.length;
    }

    const targetAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const normalizedTarget = (targetAngle + 360) % 360;
    const normalizedCurrent = (bot.angle + 360) % 360;

    let diff = normalizedTarget - normalizedCurrent;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    let steer = 0;
    if (diff > 5) steer = 1;
    else if (diff < -5) steer = -1;

    // NPC gas/brake logic
    const gas = Math.abs(diff) < 75;
    const brake = Math.abs(diff) >= 75;

    return this.updateCar(bot, { gas, brake, steer, action: false }, dt, false, onMissedCheckpoint);
  }

  /**
   * Keep cars and objects inside arena boundaries
   */
  clampToArena(entity) {
    const minX = 18;
    const maxX = this.worldWidth - 18;
    const minY = 18;
    const maxY = this.worldHeight - 18;
    entity.x = Math.max(minX, Math.min(maxX, entity.x));
    entity.y = Math.max(minY, Math.min(maxY, entity.y));
  }
}
