/**
 * client/core/module_manager.js
 * Responsibility: Mumen
 *
 * Module registry and lifecycle manager coordinating registration, updates, and disposal.
 */

export class ModuleManager {
  constructor(context) {
    this.context = context;
    this.modules = new Map();
  }

  /**
   * Register a module instance into the manager
   * @param {BaseModule} module
   */
  register(module) {
    if (this.modules.has(module.name)) {
      console.warn(`Module with name ${module.name} already registered. Overwriting.`);
    }
    this.modules.set(module.name, module);
    module.init(this.context);
  }

  /**
   * Unregister and destroy a module instance
   * @param {string} moduleName
   */
  unregister(moduleName) {
    const module = this.modules.get(moduleName);
    if (module) {
      module.destroy();
      this.modules.delete(moduleName);
    }
  }

  /**
   * Run update tick across all registered modules
   * @param {number} deltaTime
   * @param {object} stateSnapshot
   */
  update(deltaTime, stateSnapshot) {
    this.modules.forEach((module) => {
      try {
        module.update(deltaTime, stateSnapshot);
      } catch (error) {
        console.error(`Error during update in module ${module.name}:`, error);
      }
    });
  }

  /**
   * Destroy and clean up all registered modules
   */
  destroyAll() {
    this.modules.forEach((module) => module.destroy());
    this.modules.clear();
  }
}
