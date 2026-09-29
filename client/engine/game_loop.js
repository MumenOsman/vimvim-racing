/**
 * client/engine/game_loop.js
 * Responsibility: Mumen (Core Game Engine)
 *
 * 60 FPS requestAnimationFrame loop with fixed timestep update,
 * delta accumulation, and spiral-of-death prevention.
 */

export class GameLoop {
  constructor(onUpdate, onRender) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
    this.isRunning = false;
    this.lastTime = 0;
    this.frameId = null;

    // Fixed timestep constants (60 updates per second)
    this.fixedDeltaTime = 1 / 60;
    this.accumulator = 0;
    this.maxAccumulator = 0.1; // Hard cap (max 6 ticks) to prevent accumulator cascade
  }

  /**
   * Start the game loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    const tick = (currentTime) => {
      if (!this.isRunning) return;
      this.frameId = requestAnimationFrame(tick);

      try {
        const frameTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;

        this.accumulator += frameTime;

        // Clamp accumulator to prevent spiral of death on background tab or lag spike
        if (this.accumulator > this.maxAccumulator) {
          this.accumulator = this.maxAccumulator;
        }

        // Fixed timestep updates with safety limit of 4 substeps per frame
        let subSteps = 0;
        while (this.accumulator >= this.fixedDeltaTime && subSteps < 4) {
          if (this.onUpdate) {
            this.onUpdate(this.fixedDeltaTime);
          }
          this.accumulator -= this.fixedDeltaTime;
          subSteps++;
        }

        // Discard remaining accumulator if substep limit was reached
        if (subSteps >= 4) {
          this.accumulator = 0;
        }

        // Render step with interpolation alpha
        const interpolationAlpha = this.accumulator / this.fixedDeltaTime;
        if (this.onRender) {
          this.onRender(interpolationAlpha);
        }
      } catch (err) {
        console.error('GameLoop tick error:', err);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }
}
