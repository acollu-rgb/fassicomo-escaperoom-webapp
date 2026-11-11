/* ============================================================
   audio.js — musica e suoni sintetizzati (Web Audio API)
   Nessun file audio: tutto generato nel browser.
   L'audio parte solo dopo un'interazione dell'utente.
   ============================================================ */
(function (global) {
  'use strict';

  const Audio = {
    ctx: null,
    soundsBus: null,
    musicBus: null,
    soundsEnabled: true,
    musicEnabled: true,
    volume: 0.16,
    voices: { sounds: new Set(), music: new Set() },
    timer: null,
    track: 0,
    step: 0,
    active: false,

    ensure() {
      try {
        if (!this.ctx) {
          const Ctor = global.AudioContext || global.webkitAudioContext;
          if (!Ctor) return false;
          this.ctx = new Ctor();
          this.soundsBus = this.ctx.createGain();
          this.musicBus = this.ctx.createGain();
          this.soundsBus.connect(this.ctx.destination);
          this.musicBus.connect(this.ctx.destination);
        }
        this.soundsBus.gain.value = this.soundsEnabled ? 0.18 : 0;
        this.musicBus.gain.value = this.musicEnabled ? this.volume : 0;
        this.ctx.resume().catch(function () {});
        return true;
      } catch (e) {
        return false;
      }
    },

    tone(freq, type, duration, volume, channel) {
      const ch = channel || 'sounds';
      if (!this.ctx) return;
      if (ch === 'sounds' ? !this.soundsEnabled : !this.musicEnabled) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime;
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(ch === 'sounds' ? this.soundsBus : this.musicBus);
      this.voices[ch].add(osc);
      osc.onended = () => {
        this.voices[ch].delete(osc);
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(now);
      osc.stop(now + duration);
    },

    clear(channel) {
      for (const osc of this.voices[channel]) {
        try { osc.stop(); } catch (e) { /* nulla */ }
      }
      this.voices[channel].clear();
    },

    play(freq, type, duration) { this.tone(freq, type, duration, 0.65, 'sounds'); },
    error() { this.play(150, 'sawtooth', 0.35); },
    success() { this.play(740, 'sine', 0.25); },
    tick(urgent) { this.play(urgent ? 1100 : 700, 'square', 0.15); },

    stopMusic() {
      clearTimeout(this.timer);
      this.timer = null;
      this.clear('music');
    },

    startMusic() {
      if (!this.active || !this.musicEnabled || !this.ctx || this.timer) return;
      this.tick();
    },

    tick() {
      this.timer = null;
      if (!this.active || !this.musicEnabled || !this.ctx) return;

      const tracks = [
        { bpm: 96, roots: [40, 36, 43, 38], seq: [0, 7, 12, 15, 19, 12, 7, 10] },
        { bpm: 128, roots: [30, 30, 33, 29], seq: [0, 12, 7, 0, 13, 7, 12, 3] },
        { bpm: 82, roots: [42, 38, 45, 40], seq: [0, 7, 10, 14, 19, 14, 10, 7] }
      ];
      const track = tracks[this.track];
      const step = 60 / track.bpm / 4;
      const root = track.roots[Math.floor(this.step / 32) % 4];
      const hz = n => 440 * Math.pow(2, (n - 69) / 12);
      const fade = Math.min(1, (this.step + 1) / 16, (256 - this.step) / 16);

      if (this.track !== 2 || this.step % 2 === 0) {
        this.tone(
          hz(root + (this.track === 2 ? 12 : 24) + track.seq[this.step % 8]),
          'triangle', step * 2.8, 0.35 * fade, 'music'
        );
      }
      if (this.step % 4 === 0) {
        this.tone(hz(root), 'sine', step * 3.5, 0.65 * fade, 'music');
      }

      this.step++;
      if (this.step >= 256) {
        this.step = 0;
        const choices = [0, 1, 2].filter(n => n !== this.track);
        this.track = choices[Math.floor(Math.random() * 2)];
      }
      this.timer = setTimeout(() => this.tick(), step * 1000);
    },

    /* Collega i controlli presenti nella pagina (se ci sono). */
    bindControls() {
      const sounds = document.getElementById('sounds-toggle');
      const music = document.getElementById('music-toggle');
      const volume = document.getElementById('music-volume');

      if (sounds) {
        sounds.addEventListener('click', () => {
          this.soundsEnabled = !this.soundsEnabled;
          this.ensure();
          if (!this.soundsEnabled) this.clear('sounds');
          sounds.textContent = 'Suoni: ' + (this.soundsEnabled ? 'ON' : 'OFF');
          sounds.setAttribute('aria-pressed', String(this.soundsEnabled));
        });
      }

      if (music) {
        music.addEventListener('click', () => {
          this.musicEnabled = !this.musicEnabled;
          this.ensure();
          music.textContent = 'Musica: ' + (this.musicEnabled ? 'ON' : 'OFF');
          music.setAttribute('aria-pressed', String(this.musicEnabled));
          if (!this.musicEnabled) this.stopMusic();
          else this.startMusic();
        });
      }

      if (volume) {
        this.volume = Number(volume.value) || 0.16;
        volume.addEventListener('input', event => {
          this.volume = Math.max(0, Math.min(0.5, Number(event.target.value)));
          if (this.musicBus) this.musicBus.gain.value = this.musicEnabled ? this.volume : 0;
        });
      }

      // l'audio si sblocca alla prima interazione
      const unlock = () => {
        this.ensure();
        document.removeEventListener('pointerdown', unlock);
        document.removeEventListener('keydown', unlock);
      };
      document.addEventListener('pointerdown', unlock);
      document.addEventListener('keydown', unlock);
    }
  };

  global.EscapeAudio = Audio;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Audio.bindControls());
  } else {
    Audio.bindControls();
  }
})(window);
