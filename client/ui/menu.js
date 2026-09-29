/**
 * client/ui/menu.js
 * Responsibility: Ville (Assets, Audio, Controls & In-Game UI)
 *
 * In-game menu (Pause, Resume, Restart, Return to Room, Quit)
 * and Multiplayer 15-second Majority Restart Vote Dialog.
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';

export class MenuUI extends BaseModule {
  constructor() {
    super('MenuUI');
    this.menuModal = null;
    this.bannerContainer = null;
    this.voteModal = null;

    this.isMultiplayer = false;
    this.localPlayerId = 'player-1';
    this.pausedBy = null;
    this.pauserNickname = null;
    this.voteTimerId = null;
    this.humanPlayerCount = 1;
  }

  init(context) {
    super.init(context);
    this.menuModal = document.getElementById('in-game-menu');
    this.bannerContainer = document.getElementById('broadcast-banners');
    this.voteModal = document.getElementById('restart-vote-modal');

    // Subscribe to pause state changes
    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      if (status === 'PAUSED') {
        this.showMenu();
      } else {
        this.hideMenu();
        this.hideVoteModal();
        if (status === 'LOBBY') {
          const goModal = document.getElementById('game-over-modal');
          if (goModal) goModal.style.display = 'none';
        }
      }
    });

    this.subscribe(EventType.LOCAL_PLAYER_CHANGED, (id) => {
      this.localPlayerId = id;
    });

    // Subscribe to player action announcements
    this.subscribe(EventType.PLAYER_ACTION_BROADCAST, (message) => {
      this.showBroadcastBanner(message);
    });

    this.subscribe(EventType.GAME_PAUSED, ({ pausedBy, pauserNickname }) => {
      this.pausedBy = pausedBy;
      this.pauserNickname = pauserNickname || null;
      this.updatePauseDisplay();
    });

    this.subscribe(EventType.GAME_RESUMED, () => {
      this.pausedBy = null;
      this.pauserNickname = null;
      this.hideMenu();
      this.hideVoteModal();
    });

    this.subscribe(EventType.GAME_RESTART_REQUESTED, () => {
      this.pausedBy = null;
      this.pauserNickname = null;
      this.hideMenu();
      this.hideVoteModal();
    });

    // Multiplayer restart vote events
    this.subscribe(EventType.RESTART_VOTE_INITIATED, (vote) => {
      this.showVoteModal(vote);
    });

    this.subscribe(EventType.RESTART_VOTE_STATUS, (status) => {
      this.handleVoteStatus(status);
    });

    this.subscribe(EventType.GAME_STARTED, (room) => {
      this.humanPlayerCount = room && Array.isArray(room.players) ? room.players.length : 1;
      this.updatePauseDisplay();
    });

    this.subscribe(EventType.ROOM_UPDATED, (room) => {
      this.humanPlayerCount = room && Array.isArray(room.players) ? room.players.length : 1;
      this.updatePauseDisplay();
    });

    this.subscribe(EventType.ROOM_JOINED, (data) => {
      this.humanPlayerCount = data && data.room && Array.isArray(data.room.players) ? data.room.players.length : 1;
      this.updatePauseDisplay();
    });

    this.bindButtons();
  }

  setMultiplayer(isMp, humanPlayerCount = 1) {
    this.isMultiplayer = isMp;
    this.humanPlayerCount = Number(humanPlayerCount) || 1;
    this.updatePauseDisplay();
  }

  bindButtons() {
    // Solo Pause Buttons
    const btnSoloResume = document.getElementById('btn-pause-resume');
    if (btnSoloResume) {
      btnSoloResume.addEventListener('click', () => {
        this.eventBus.emit(EventType.RESUME_REQUESTED, {});
      });
    }

    const btnSoloRestart = document.getElementById('btn-pause-restart');
    if (btnSoloRestart) {
      btnSoloRestart.addEventListener('click', () => {
        this.eventBus.emit(EventType.GAME_RESTART_REQUESTED, {});
      });
    }

    const btnSoloSettings = document.getElementById('btn-pause-settings');
    if (btnSoloSettings) {
      btnSoloSettings.addEventListener('click', () => {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
      });
    }

    const btnSoloRoom = document.getElementById('btn-pause-solo-room');
    if (btnSoloRoom) {
      btnSoloRoom.addEventListener('click', () => {
        this.eventBus.emit(EventType.GAME_STATE_CHANGED, 'LOBBY');
        const soloMenu = document.getElementById('solo-menu');
        if (soloMenu) soloMenu.style.display = 'flex';
      });
    }

    const btnSoloExit = document.getElementById('btn-pause-exit-home');
    if (btnSoloExit) {
      btnSoloExit.addEventListener('click', () => {
        this.eventBus.emit(EventType.QUIT_REQUESTED, {});
        this.eventBus.emit(EventType.HOME_REQUESTED, {});
      });
    }

    // Multiplayer Pause Buttons
    const btnMpResume = document.getElementById('btn-pause-mp-resume');
    if (btnMpResume) {
      btnMpResume.addEventListener('click', () => {
        this.eventBus.emit(EventType.RESUME_REQUESTED, {});
      });
    }

    const btnMpRestart = document.getElementById('btn-pause-mp-restart');
    if (btnMpRestart) {
      btnMpRestart.addEventListener('click', () => {
        if (this.humanPlayerCount <= 1) return;
        this.eventBus.emit(EventType.RESTART_VOTE_REQUESTED, {});
      });
    }

    const btnMpSettings = document.getElementById('btn-pause-mp-settings');
    if (btnMpSettings) {
      btnMpSettings.addEventListener('click', () => {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.style.display = 'flex';
      });
    }

    const btnMpRoom = document.getElementById('btn-pause-mp-room');
    if (btnMpRoom) {
      btnMpRoom.addEventListener('click', () => {
        this.eventBus.emit(EventType.RETURN_TO_ROOM_REQUESTED, {});
      });
    }

    const btnMpExit = document.getElementById('btn-pause-mp-exit');
    if (btnMpExit) {
      btnMpExit.addEventListener('click', () => {
        this.eventBus.emit(EventType.QUIT_REQUESTED, {});
        this.eventBus.emit(EventType.HOME_REQUESTED, {});
      });
    }

    // Voting Buttons
    const btnVoteYes = document.getElementById('btn-vote-yes');
    const btnVoteNo = document.getElementById('btn-vote-no');
    if (btnVoteYes) {
      btnVoteYes.addEventListener('click', () => {
        this.castVote(true);
      });
    }
    if (btnVoteNo) {
      btnVoteNo.addEventListener('click', () => {
        this.castVote(false);
      });
    }

    // Game Over Buttons
    const btnGoRestart = document.getElementById('btn-game-over-restart');
    if (btnGoRestart) {
      btnGoRestart.addEventListener('click', () => {
        const modal = document.getElementById('game-over-modal');
        if (modal) modal.style.display = 'none';
        if (!this.isMultiplayer) {
          this.eventBus.emit(EventType.GAME_RESTART_REQUESTED, {});
        } else {
          this.eventBus.emit(EventType.RESTART_VOTE_REQUESTED, {});
        }
      });
    }

    const btnGoHome = document.getElementById('btn-game-over-home');
    if (btnGoHome) {
      btnGoHome.addEventListener('click', () => {
        const modal = document.getElementById('game-over-modal');
        if (modal) modal.style.display = 'none';
        this.eventBus.emit(EventType.QUIT_REQUESTED, {});
        this.eventBus.emit(EventType.HOME_REQUESTED, {});
      });
    }
  }

  showMenu() {
    if (!this.menuModal) return;
    this.menuModal.style.display = 'flex';
    this.updatePauseDisplay();
  }

  hideMenu() {
    if (this.menuModal) this.menuModal.style.display = 'none';
  }

  updatePauseDisplay() {
    const soloOptions = document.getElementById('pause-solo-options');
    const mpOptions = document.getElementById('pause-mp-options');
    const bannerPlayer = document.getElementById('pause-paused-by-msg');

    if (this.isMultiplayer) {
      if (soloOptions) soloOptions.style.display = 'none';
      if (mpOptions) mpOptions.style.display = 'flex';

      const isPauser = !this.pausedBy || this.pausedBy === this.localPlayerId;
      const btnMpResume = document.getElementById('btn-pause-mp-resume');
      if (btnMpResume) {
        btnMpResume.disabled = !isPauser;
        btnMpResume.title = isPauser ? '' : 'Only the player who paused can resume.';
      }

      const btnMpRestart = document.getElementById('btn-pause-mp-restart');
      if (btnMpRestart) {
        const canVote = this.humanPlayerCount > 1;
        btnMpRestart.disabled = !canVote;
        if (btnMpRestart.classList) {
          if (!canVote) {
            btnMpRestart.classList.add('disabled-btn');
          } else {
            btnMpRestart.classList.remove('disabled-btn');
          }
        }
        btnMpRestart.title = canVote
          ? 'Call a vote to restart the race'
          : 'Voting is disabled when playing with bots only.';
      }

      if (bannerPlayer) {
        bannerPlayer.style.display = 'block';
        bannerPlayer.textContent = isPauser 
          ? 'You paused the race.' 
          : `Race paused by ${this.pauserNickname || 'another driver'}.`;
      }
    } else {
      if (soloOptions) soloOptions.style.display = 'flex';
      if (mpOptions) mpOptions.style.display = 'none';
      if (bannerPlayer) bannerPlayer.style.display = 'none';
    }
  }

  showVoteModal(vote) {
    if (!this.voteModal) return;
    this.voteModal.style.display = 'flex';

    const isInitiator = Boolean(vote && vote.initiatorId && vote.initiatorId === this.localPlayerId);
    const promptText = document.getElementById('vote-prompt-text');
    if (promptText) {
      promptText.textContent = isInitiator
        ? 'You requested to restart the race. Waiting for other drivers to vote...'
        : `${vote?.initiatorName || 'A driver'} requested to restart the race.`;
    }

    const votes = vote?.votes || {};
    const yesCount = Object.values(votes).filter((v) => v === true).length || (isInitiator ? 1 : 0);
    const total = vote?.totalPlayers || 2;
    const statusMsg = document.getElementById('vote-status-msg');
    if (statusMsg) {
      statusMsg.textContent = `Votes: ${yesCount} / ${total}`;
    }

    const btnYes = document.getElementById('btn-vote-yes');
    const btnNo = document.getElementById('btn-vote-no');
    if (btnYes) {
      btnYes.disabled = isInitiator;
      btnYes.textContent = isInitiator ? 'Voted Yes' : 'Vote Yes';
    }
    if (btnNo) {
      btnNo.disabled = isInitiator;
    }

    // Start 15s timer
    if (this.voteTimerId) clearInterval(this.voteTimerId);
    let secondsLeft = 15;
    const timerLabel = document.getElementById('vote-timer-label');
    const timerFill = document.getElementById('vote-timer-fill');

    if (timerLabel) timerLabel.textContent = `Time remaining: ${secondsLeft}s`;
    if (timerFill) timerFill.style.width = '100%';

    this.voteTimerId = setInterval(() => {
      secondsLeft--;
      if (timerLabel) timerLabel.textContent = `Time remaining: ${secondsLeft}s`;
      if (timerFill) timerFill.style.width = `${(secondsLeft / 15) * 100}%`;

      if (secondsLeft <= 0) {
        clearInterval(this.voteTimerId);
        this.voteTimerId = null;
      }
    }, 1000);
  }

  castVote(vote) {
    const btnYes = document.getElementById('btn-vote-yes');
    const btnNo = document.getElementById('btn-vote-no');
    if (btnYes) btnYes.disabled = true;
    if (btnNo) btnNo.disabled = true;

    this.eventBus.emit(EventType.RESTART_VOTE_CAST, { vote });
    this.hideVoteModal();
  }

  handleVoteStatus(status) {
    if (status.failed) {
      this.hideVoteModal();
      this.showBroadcastBanner(status.reason || 'Majority voted against restart.');
      return;
    }

    if (status.votes) {
      const yesCount = Object.values(status.votes).filter((v) => v === true).length;
      const total = status.totalPlayers || 2;
      const statusMsg = document.getElementById('vote-status-msg');
      if (statusMsg) {
        statusMsg.textContent = `Votes: ${yesCount} / ${total}`;
      }
    }
  }

  hideVoteModal() {
    if (this.voteTimerId) {
      clearInterval(this.voteTimerId);
      this.voteTimerId = null;
    }
    if (this.voteModal) {
      this.voteModal.style.display = 'none';
    }
  }

  showBroadcastBanner(message) {
    if (!this.bannerContainer) return;
    const banner = document.createElement('div');
    banner.className = 'broadcast-banner';
    banner.textContent = message;
    this.bannerContainer.appendChild(banner);

    setTimeout(() => {
      banner.remove();
    }, 3200);
  }

  destroy() {
    super.destroy();
    if (this.voteTimerId) {
      clearInterval(this.voteTimerId);
      this.voteTimerId = null;
    }
  }
}
