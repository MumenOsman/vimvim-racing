/**
 * client/core/base_module.js
 * Responsibility: Mumen
 *
 * Base module contract ensuring uniform lifecycle interface across all feature modules.
 */

export class BaseModule {
  constructor(name) {
    this.name = name || this.constructor.name;
    this.context = null;
    this.eventBus = null;
    this.unsubscribers = [];
  }

  /**
   * Module initialization lifecycle hook
   * @param {object} context - Shared engine context { eventBus, rootElement, config }
   */
  init(context) {
    this.context = context;
    this.eventBus = context.eventBus;
  }

  /**
   * Helper to subscribe to eventBus with automatic cleanup on destroy
   * @param {string} eventType
   * @param {Function} callback
   */
  subscribe(eventType, callback) {
    if (this.eventBus) {
      const unsub = this.eventBus.on(eventType, callback.bind(this));
      this.unsubscribers.push(unsub);
    }
  }

  /**
   * Optional tick update hook called every frame
   * @param {number} deltaTime - Time elapsed since last frame in seconds
   * @param {object} stateSnapshot - Read-only snapshot of current game state
   */
  update(deltaTime, stateSnapshot) {
    // Override in derived modules if tick updates are required
  }

  /**
   * Module teardown and cleanup hook
   */
  destroy() {
    // Clean up all event subscriptions
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this.context = null;
    this.eventBus = null;
  }
}
