/**
 * client/audio/sound.js
 * Responsibility: Ville (Assets, Audio, Controls & In-Game UI)
 *
 * Handles game audio, music tracks, engine noise loop, and Web Audio SFX synthesis.
 */

import { BaseModule } from '../core/base_module.js';
import { EventType } from '../core/events.js';

export class SoundManager extends BaseModule {
  constructor() {
    super('SoundManager');

    this.audioCtx = null;
    this.isMuted = false;

    // Load persisted volume configurations (0.0 to 1.0)
    const savedSfx = localStorage.getItem('vimvim_sfx_volume');
    const savedMusic = localStorage.getItem('vimvim_music_volume');
    this.sfxVolume = savedSfx !== null ? parseFloat(savedSfx) : 0.8;
    this.musicVolume = savedMusic !== null ? parseFloat(savedMusic) : 0.7;

    this.sfxGain = null;
    this.musicGain = null;

    this.engineBuffer = null;
    this.engineSource = null;
    this.engineGain = null;
    this.enginePlaying = false;

    this.clickBuffer = null;
    this.countdownBuffer = null;
    this.countdownSource = null;
    this.crashBuffer = null;
    this.lastCrashTime = 0;
    this.brakePlaying = false;

    // Background music elements
    this.menuMusic = new Audio('/audio/assets/menu-music.mp3');
    this.menuMusic.loop = true;
    this.menuMusic.volume = this.musicVolume;

    this.raceMusic = new Audio('/audio/assets/race-music.mp3');
    this.raceMusic.loop = true;
    this.raceMusic.volume = this.musicVolume;

    this.currentMusicTrack = null; // 'menu' | 'race' | null
    this.hasUserInteracted = false;
  }

  init(context) {
    super.init(context);

    this.loadEngineSound();
    this.loadClickSound();
    this.loadCountdownSound();
    this.loadCrashSound();

    // Volume configuration events
    this.subscribe(EventType.SFX_VOLUME_CHANGED, (val) => this.setSfxVolume(val));
    this.subscribe(EventType.MUSIC_VOLUME_CHANGED, (val) => this.setMusicVolume(val));

    // Game lifecycle and music synchronization
    this.subscribe(EventType.GAME_STATE_CHANGED, (status) => {
      if (status === 'LOBBY' || status === 'READY') {
        this.stopCountdown();
        this.playMenuMusic();
      } else if (status === 'COUNTDOWN') {
        this.stopAllMusic();
        this.playCountdown();
      } else if (status === 'PLAYING') {
        this.playRaceMusic();
      } else if (status === 'PAUSED') {
        this.pauseMusic();
        this.stopCountdown();
      } else if (status === 'GAME_OVER') {
        this.stopCountdown();
        this.playMenuMusic();
      }
    });

    this.subscribe(EventType.HOME_REQUESTED, () => {
      this.stopEngine();
      this.stopCountdown();
      this.playMenuMusic();
    });

    this.subscribe(EventType.RETURN_TO_ROOM_REQUESTED, () => {
      this.stopEngine();
      this.stopCountdown();
      this.playMenuMusic();
    });

    this.subscribe(EventType.GAME_RESTART_REQUESTED, () => {
      this.stopCountdown();
    });

    // Subscribe to game events to trigger decoupled sound effects
    this.subscribe(EventType.PLAYER_SCORED, () => this.play('score'));
    this.subscribe(EventType.PLAYER_DAMAGED, () => this.play('damage'));
    this.subscribe(EventType.PAUSE_REQUESTED, () => {
      this.play('pause');
      this.stopEngine();
      this.stopCountdown();
      this.pauseMusic();
    });
    this.subscribe(EventType.RESUME_REQUESTED, () => {
      this.play('resume');
      this.resumeMusic();
    });
    this.subscribe(EventType.MATCH_ENDED, () => {
      this.play('gameOver');
      this.stopEngine();
      this.stopCountdown();
      this.playMenuMusic();
    });
    this.subscribe(EventType.CAR_COLLISION, () => this.play('collision'));
    this.subscribe(EventType.COUNTDOWN_TICK, (val) => {
      // Fallback synthetic beep only if arcade countdown audio buffer is unavailable
      if (!this.countdownBuffer) {
        if (val > 0) this.play('countdown_beep');
        else if (val === 0) this.play('countdown_go');
      }
    });
    this.subscribe(EventType.ITEM_COLLECTED, (data) => {
      if (data && data.perk === 'UFO') {
        this.play('ufo_pickup');
      } else {
        this.play('score');
      }
    });
    this.subscribe(EventType.UFO_ABDUCTION_STARTED, () => this.play('ufo_beam'));
    this.subscribe(EventType.UFO_ABDUCTION_COMPLETED, () => this.play('boost'));
    this.subscribe(EventType.PLAY_SFX, (sfxName) => this.play(sfxName));
  }

  /**
   * Initialize AudioContext on first user interaction to comply with browser autoplay policy
   */
  ensureAudioContext() {
    this.hasUserInteracted = true;

    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }

    if (this.audioCtx) {
      if (!this.sfxGain) {
        this.sfxGain = this.audioCtx.createGain();
        this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : this.sfxVolume, this.audioCtx.currentTime);
        this.sfxGain.connect(this.audioCtx.destination);
      }
      if (!this.musicGain) {
        this.musicGain = this.audioCtx.createGain();
        this.musicGain.gain.setValueAtTime(this.isMuted ? 0 : this.musicVolume, this.audioCtx.currentTime);
        this.musicGain.connect(this.audioCtx.destination);
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
    }

    return this.audioCtx;
  }

  onFirstUserInteraction() {
    this.hasUserInteracted = true;
    this.ensureAudioContext();
    if (!this.currentMusicTrack || this.currentMusicTrack === 'menu') {
      this.playMenuMusic();
    }
  }

  playMenuMusic() {
    if (this.currentMusicTrack === 'menu' && !this.menuMusic.paused) return;
    this.currentMusicTrack = 'menu';

    try {
      this.raceMusic.pause();
      this.raceMusic.currentTime = 0;
    } catch (e) {}

    if (this.isMuted || this.musicVolume === 0) return;

    this.menuMusic.volume = this.musicVolume;
    this.menuMusic.play().catch(() => {});
  }

  playRaceMusic() {
    if (this.currentMusicTrack === 'race' && !this.raceMusic.paused) return;
    this.currentMusicTrack = 'race';

    try {
      this.menuMusic.pause();
      this.menuMusic.currentTime = 0;
    } catch (e) {}

    if (this.isMuted || this.musicVolume === 0) return;

    this.raceMusic.volume = this.musicVolume;
    this.raceMusic.play().catch(() => {});
  }

  pauseMusic() {
    try {
      if (this.currentMusicTrack === 'race') {
        this.raceMusic.pause();
      } else if (this.currentMusicTrack === 'menu') {
        this.menuMusic.pause();
      }
    } catch (e) {}
  }

  resumeMusic() {
    if (this.isMuted || this.musicVolume === 0) return;
    try {
      if (this.currentMusicTrack === 'race') {
        this.raceMusic.volume = this.musicVolume;
        this.raceMusic.play().catch(() => {});
      } else if (this.currentMusicTrack === 'menu') {
        this.menuMusic.volume = this.musicVolume;
        this.menuMusic.play().catch(() => {});
      }
    } catch (e) {}
  }

  stopAllMusic() {
    this.currentMusicTrack = null;
    try {
      this.menuMusic.pause();
      this.menuMusic.currentTime = 0;
      this.raceMusic.pause();
      this.raceMusic.currentTime = 0;
    } catch (e) {}
  }

  setSfxVolume(val) {
    const vol = Math.max(0, Math.min(1, parseFloat(val) || 0));
    this.sfxVolume = vol;
    try {
      localStorage.setItem('vimvim_sfx_volume', vol.toString());
    } catch (e) {}
    if (this.sfxGain && this.audioCtx) {
      this.sfxGain.gain.setValueAtTime(this.isMuted ? 0 : vol, this.audioCtx.currentTime);
    }
  }

  setMusicVolume(val) {
    const vol = Math.max(0, Math.min(1, parseFloat(val) || 0));
    this.musicVolume = vol;
    try {
      localStorage.setItem('vimvim_music_volume', vol.toString());
    } catch (e) {}

    if (this.menuMusic) {
      this.menuMusic.volume = this.isMuted ? 0 : vol;
    }
    if (this.raceMusic) {
      this.raceMusic.volume = this.isMuted ? 0 : vol;
    }
    if (this.musicGain && this.audioCtx) {
      this.musicGain.gain.setValueAtTime(this.isMuted ? 0 : vol, this.audioCtx.currentTime);
    }

    if (vol > 0 && !this.isMuted && this.hasUserInteracted) {
      if (this.currentMusicTrack === 'menu' && this.menuMusic.paused) {
        this.menuMusic.play().catch(() => {});
      } else if (this.currentMusicTrack === 'race' && this.raceMusic.paused) {
        this.raceMusic.play().catch(() => {});
      }
    }
  }

  getSfxVolume() {
    return this.sfxVolume;
  }

  getMusicVolume() {
    return this.musicVolume;
  }

  async loadEngineSound() {
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    try {
      const response = await fetch('/audio/assets/engine-noise.mp3');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const audioData = await response.arrayBuffer();
      this.engineBuffer = await this.audioCtx.decodeAudioData(audioData);
    } catch (error) {
      console.warn('Engine sound asset unavailable or failed to load:', error.message);
    }
  }

  async loadClickSound() {
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    try {
      const response = await fetch('/audio/assets/button-click.mp3');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const audioData = await response.arrayBuffer();
      this.clickBuffer = await this.audioCtx.decodeAudioData(audioData);
    } catch (error) {
      console.warn('Click sound asset unavailable or failed to load:', error.message);
    }
  }

  async loadCountdownSound() {
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    try {
      const response = await fetch('/audio/assets/countdown.mp3');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const audioData = await response.arrayBuffer();
      this.countdownBuffer = await this.audioCtx.decodeAudioData(audioData);
    } catch (error) {
      console.warn('Countdown audio asset unavailable or failed to load:', error.message);
    }
  }

  playCountdown() {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    this.stopCountdown();

    try {
      if (this.countdownBuffer) {
        this.countdownSource = this.audioCtx.createBufferSource();
        this.countdownSource.buffer = this.countdownBuffer;
        const out = this.sfxGain || this.audioCtx.destination;
        this.countdownSource.connect(out);
        this.countdownSource.start();
      }
    } catch (e) {
      console.warn('Countdown playback error:', e);
    }
  }

  stopCountdown() {
    try {
      if (this.countdownSource) {
        this.countdownSource.stop();
        this.countdownSource.disconnect();
        this.countdownSource = null;
      }
    } catch (e) {}
  }

  async loadCrashSound() {
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    try {
      const response = await fetch('/audio/assets/car-crash.mp3');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const audioData = await response.arrayBuffer();
      this.crashBuffer = await this.audioCtx.decodeAudioData(audioData);
    } catch (error) {
      console.warn('Car crash audio asset unavailable or failed to load:', error.message);
    }
  }

  playEngine() {
    if (this.isMuted || this.enginePlaying) return;
    this.ensureAudioContext();
    if (!this.audioCtx || !this.engineBuffer) return;

    try {
      this.engineSource = this.audioCtx.createBufferSource();
      this.engineGain = this.audioCtx.createGain();

      this.engineSource.buffer = this.engineBuffer;
      this.engineSource.loop = true;
      this.engineGain.gain.value = 0.12;

      this.engineSource.connect(this.engineGain);
      const destination = this.sfxGain || this.audioCtx.destination;
      this.engineGain.connect(destination);

      this.engineSource.start();
      this.enginePlaying = true;
    } catch (e) {
      console.warn('Engine sound playback error:', e);
    }
  }

  stopEngine() {
    if (!this.enginePlaying) return;

    try {
      if (this.engineSource) {
        this.engineSource.stop();
        this.engineSource.disconnect();
      }
      if (this.engineGain) {
        this.engineGain.disconnect();
      }
    } catch (e) {
      // Ignored
    }

    this.engineSource = null;
    this.engineGain = null;
    this.enginePlaying = false;
  }

  setEnginePitch(value) {
    if (!this.engineSource || !this.enginePlaying) return;
    try {
      this.engineSource.playbackRate.value = value;
    } catch (e) {
      // Ignored
    }
  }

  setEngineVolume(value) {
    if (!this.engineGain) return;
    try {
      this.engineGain.gain.value = value;
    } catch (e) {
      // Ignored
    }
  }

  playBrake() {
    if (this.isMuted || this.brakePlaying) return;
    this.ensureAudioContext();
    this.brakePlaying = true;
  }

  stopBrake() {
    if (!this.brakePlaying) return;
    this.brakePlaying = false;
  }

  /**
   * Play a synthesized sound effect or audio buffer
   * @param {string} soundName
   */
  play(soundName) {
    if (this.isMuted) return;
    this.ensureAudioContext();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const out = this.sfxGain || ctx.destination;

    try {
      if (soundName === 'button_click' || soundName === 'click') {
        if (this.clickBuffer) {
          const src = ctx.createBufferSource();
          src.buffer = this.clickBuffer;
          src.connect(out);
          src.start();
          return;
        }
        // Crisp synthesized UI click fallback
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (soundName === 'countdown_beep') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (soundName === 'countdown_go') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, now);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (soundName === 'collision' || soundName === 'crash') {
        if (now - this.lastCrashTime < 0.30) {
          return; // Prevent continuous buzzing on persistent contact
        }
        this.lastCrashTime = now;

        if (this.crashBuffer) {
          const src = ctx.createBufferSource();
          src.buffer = this.crashBuffer;
          const gain = ctx.createGain();
          gain.gain.value = 0.85;
          src.connect(gain);
          gain.connect(out);
          src.start();
          return;
        }

        // Fallback synthesized impact
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (soundName === 'boost') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (soundName === 'oil') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.25);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (soundName === 'score') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.setValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (soundName === 'damage') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (soundName === 'ufo_pickup') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (soundName === 'ufo_beam') {
        // Warbling alien sci-fi beam sound
        const osc = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.linearRampToValueAtTime(680, now + 1.2);
        osc.frequency.linearRampToValueAtTime(420, now + 2.5);

        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(18, now); // 18Hz vibrato
        lfoGain.gain.setValueAtTime(60, now);

        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

        osc.connect(gain);
        gain.connect(out);

        osc.start(now);
        lfo.start(now);
        osc.stop(now + 2.5);
        lfo.stop(now + 2.5);
      } else if (soundName === 'pause' || soundName === 'resume') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(soundName === 'pause' ? 440 : 660, now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(out);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      console.warn('Audio synthesis error:', e);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopEngine();
      this.pauseMusic();
    } else {
      this.resumeMusic();
    }
    return this.isMuted;
  }

  destroy() {
    super.destroy();
    this.stopEngine();
    this.stopAllMusic();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
  }
}

