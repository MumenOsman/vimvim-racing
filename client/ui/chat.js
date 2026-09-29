/**
 * client/ui/chat.js
 * Responsibility: Rene (Multiplayer Networking & Lobby)
 *
 * In-game chat with local echo and message logging.
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';

export class ChatUI extends BaseModule {
  constructor() {
    super('ChatUI');
    this.chatContainer = null;
    this.messageList = null;
    this.inputField = null;
    this.toggleButton = null;
    this.unreadBadge = null;
    this.localPlayerId = null;
    this.unreadCount = 0;
    this.isCollapsed = true;
  }

  init(context) {
    super.init(context);
    this.chatContainer = document.getElementById('chat-container');
    this.messageList = document.getElementById('chat-messages');
    this.inputField = document.getElementById('chat-input');
    this.toggleButton = document.getElementById('chat-toggle');
    this.unreadBadge = document.getElementById('chat-unread');
    this.isInRoom = false;

    // Subscribe to incoming chat messages
    this.subscribe(EventType.CHAT_MESSAGE_RECEIVED, (data) => {
      const fromAnotherPlayer = data.playerId && data.playerId !== this.localPlayerId;
      this.appendMessage(data.sender, data.text, this.isCollapsed && fromAnotherPlayer);
    });
    this.subscribe(EventType.ROOM_JOINED, (data) => {
      this.isInRoom = true;
      this.localPlayerId = data.playerId;
      this.setUnreadCount(0);
      this.setCollapsed(true);
    });
    this.subscribe(EventType.ROOM_CLOSED, () => {
      this.isInRoom = false;
      this.localPlayerId = null;
      this.setUnreadCount(0);
    });
    this.subscribe(EventType.ROOM_LEFT, () => {
      this.isInRoom = false;
      this.localPlayerId = null;
      this.setUnreadCount(0);
    });

    this.bindEvents();
    this.setCollapsed(true); // Default to minimized so circuit is unobscured
  }

  bindEvents() {
    if (this.toggleButton) {
      this.toggleButton.addEventListener('click', () => {
        this.setCollapsed(!this.isCollapsed);
      });
    }

    if (this.inputField) {
      this.inputField.addEventListener('keydown', (e) => {
        // Prevent game control keys from interfering while typing
        e.stopPropagation();

        if (e.key === 'Enter' && this.inputField.value.trim()) {
          const text = this.inputField.value.trim();
          this.inputField.value = '';

          // Determine current player's nickname
          const nicknameInput = document.getElementById('input-nickname');
          const sender = nicknameInput && nicknameInput.value.trim() ? nicknameInput.value.trim() : 'You';

          if (this.isInRoom) {
            this.eventBus.emit(EventType.CHAT_SEND_REQUESTED, { text });
          } else {
            this.appendMessage(sender, text);
          }
        }
      });
    }
  }

  setCollapsed(collapsed) {
    this.isCollapsed = collapsed;
    this.chatContainer?.classList.toggle('chat-collapsed', collapsed);
    if (this.toggleButton) {
      this.toggleButton.textContent = collapsed ? 'Show' : 'Hide';
      this.toggleButton.setAttribute('aria-expanded', String(!collapsed));
      this.toggleButton.setAttribute('aria-label', collapsed ? 'Show chat' : 'Hide chat');
    }
    if (!collapsed) this.setUnreadCount(0);
  }

  setUnreadCount(count) {
    this.unreadCount = count;
    if (!this.unreadBadge) return;
    this.unreadBadge.hidden = count === 0;
    this.unreadBadge.textContent = count > 99 ? '99+' : `${count} unread`;
    this.unreadBadge.setAttribute('aria-label', `${count} unread chat messages`);
  }

  appendMessage(sender, text, countAsUnread = false) {
    if (!this.messageList) return;
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-message';

    const senderSpan = document.createElement('span');
    senderSpan.className = 'chat-sender';
    senderSpan.textContent = `${sender}: `;

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-text';
    textSpan.textContent = text;

    msgEl.appendChild(senderSpan);
    msgEl.appendChild(textSpan);
    this.messageList.appendChild(msgEl);
    this.messageList.scrollTop = this.messageList.scrollHeight;
    if (countAsUnread) this.setUnreadCount(this.unreadCount + 1);
  }

  destroy() {
    super.destroy();
  }
}
