/**
 * client/input/keyboard.js
 * Responsibility: Ville (Assets, Audio, Controls & In-Game UI) & Mumen (Baseline Controls)
 *
 * Smooth, zero-delay keyboard listener with configurable key bindings.
 * Default bindings:
 * - Gas: KeyK / ArrowUp
 * - Brake: KeyJ / ArrowDown
 * - Left: KeyH / ArrowLeft
 * - Right: KeyL / ArrowRight
 * - Action / Item: Space
 * - Pause / Menu: Escape
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';

export class InputManager extends BaseModule {
  constructor() {
    super('InputManager');

    this.pressedKeys = new Set();

    // Configurable key bindings
    this.keyBindings = {
      gas: 'KeyK',
      brake: 'KeyJ',
      left: 'KeyH',
      right: 'KeyL',
      action: 'Space',
      pause: 'Escape'
    };

    this.currentControls = {
      gas: false,
      brake: false,
      steer: 0,
      action: false
    };

    this.currentStatus = 'LOBBY';
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
  }

  init(context) {
    super.init(context);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      this.currentStatus = status;
    });
  }

  handleKeyDown(event) {
    // Allow standard typing in input fields (room code, nickname, chat)
    const isTyping = event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
    if (isTyping) {
      if (event.code === 'Escape') {
        event.target.blur();
      }
      return;
    }

    // Prevent browser scrolling with game keys only when not typing in text fields
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) ||
        Object.values(this.keyBindings).includes(event.code)) {
      event.preventDefault();
    }

    // Toggle menu on Pause key or Escape (unless settings modal is open)
    if (event.code === this.keyBindings.pause || event.code === 'Escape') {
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal && settingsModal.style.display === 'flex') {
        return;
      }
      if (this.currentStatus === 'PAUSED') {
        this.eventBus.emit(EventType.RESUME_REQUESTED, {});
      } else {
        this.eventBus.emit(EventType.PAUSE_REQUESTED, {});
      }
      return;
    }

    if (!this.pressedKeys.has(event.code)) {
      this.pressedKeys.add(event.code);
      this.evaluateInput();
    }
  }

  handleKeyUp(event) {
    const isTyping = event.target && ['INPUT', 'TEXTAREA'].includes(event.target.tagName);
    if (isTyping) {
      return;
    }

    if (this.pressedKeys.has(event.code)) {
      this.pressedKeys.delete(event.code);
      this.evaluateInput();
    }
  }

  /**
   * Evaluate pressed keys into driving controls vector
   */
  evaluateInput() {
    // Driving controls strictly driven by configured keyBindings
    const gas = this.pressedKeys.has(this.keyBindings.gas);
    const brake = this.pressedKeys.has(this.keyBindings.brake);

    let steer = 0;
    if (this.pressedKeys.has(this.keyBindings.left)) {
      steer -= 1;
    }
    if (this.pressedKeys.has(this.keyBindings.right)) {
      steer += 1;
    }

    const action = this.pressedKeys.has(this.keyBindings.action);

    const changed =
      gas !== this.currentControls.gas ||
      brake !== this.currentControls.brake ||
      steer !== this.currentControls.steer ||
      action !== this.currentControls.action;

    this.currentControls = { gas, brake, steer, action };

    if (changed) {
      this.eventBus.emit(EventType.INPUT_CHANGED, this.currentControls);
    }
  }

  setKeyBinding(action, keyCode) {
    if (!Object.prototype.hasOwnProperty.call(this.keyBindings, action)) {
      console.warn(`Unknown control action: ${action}`);
      return;
    }

    this.keyBindings[action] = keyCode;

    // Clear currently pressed keys so an old key doesn't remain stuck
    this.pressedKeys.clear();
    this.evaluateInput();
  }

  getKeyBinding(action) {
    return this.keyBindings[action];
  }

  /**
   * Synchronously query current driving controls during the fixed update loop
   * @returns {{ gas: boolean, brake: boolean, steer: number, action: boolean }}
   */
  getInput() {
    return this.currentControls;
  }

  destroy() {
    super.destroy();
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.pressedKeys.clear();
  }
}
