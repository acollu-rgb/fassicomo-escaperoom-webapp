/* ============================================================
   game.js — motore di gioco di Escape Room Cyber
   Scuola Fassicomo · versione 2.0.4
   ============================================================ */
(function (global) {
  'use strict';

  const { titles, variants, modeInfo } = global.LEVELS;

  /* ---------------- Stato ---------------- */

  const state = {
    active: false,
    playerName: '',
    levels: 5,
    currentLevel: 1,
    errorCount: 0,
    timeRemaining: 0,
    deadline: 0,
    timerId: null,
    startedAt: 0,
    lastBeat: -1,
    currentVariant: null,
    locked: false
  };

  const $ = id => document.getElementById(id);

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /* ---------------- Audio ---------------- */

  const audio = {
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
        this.ctx.resume().catch(() => {});
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

    stopMusic() {
      clearTimeout(this.timer);
      this.timer = null;
      this.clear('music');
    },

    startMusic() {
      if (!state.active || !this.musicEnabled || !this.ctx) return;
      if (state.timeRemaining <= 10) return;
      if (this.timer) return;
      this.tick();
    },

    tick() {
      this.timer = null;
      if (!state.active || !this.musicEnabled || state.timeRemaining <= 10 || !this.ctx) return;

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
        this.tone(hz(root + (this.track === 2 ? 12 : 24) + track.seq[this.step % 8]), 'triangle', step * 2.8, 0.35 * fade, 'music');
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
    }
  };

  /* ---------------- Utility UI ---------------- */

  function toast(text, kind) {
    const area = $('toast-area');
    if (!area) return;
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = text;
    area.appendChild(node);
    setTimeout(() => {
      node.style.opacity = '0';
      node.style.transition = 'opacity .3s';
      setTimeout(() => node.remove(), 320);
    }, 4200);
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (e) { /* nulla */ }
    }
  }

  function updatePlayerDisplay() { $('player-display').textContent = state.playerName || '--'; }
  function updateErrorDisplay() { $('errors-display').textContent = String(state.errorCount); }

  /* ---------------- Timer ---------------- */

  function updateTimerDisplay() {
    const box = $('timer');
    const sec = Math.max(0, state.timeRemaining);
    box.textContent = `${Math.floor(sec / 60).toString().padStart(2, '0')}:${(sec % 60).toString().padStart(2, '0')}`;
    const urgent = state.active && sec <= 10;
    box.classList.toggle('urgent', urgent);
    if (state.active && sec > 0 && sec <= 10 && state.lastBeat !== sec) {
      state.lastBeat = sec;
      audio.stopMusic();
      audio.play(sec <= 3 ? 1100 : 700, 'square', 0.15);
    }
  }

  function syncClock() {
    if (!state.active) return false;
    const next = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));
    const changed = next !== state.timeRemaining;
    state.timeRemaining = next;
    if (changed) updateTimerDisplay();
    if (state.timeRemaining === 0) {
      triggerGameOver();
      return false;
    }
    return true;
  }

  function startTimer() {
    clearInterval(state.timerId);
    state.deadline = Date.now() + state.timeRemaining * 1000;
    syncClock();
    state.timerId = setInterval(syncClock, 100);
  }

  /* ---------------- Schermata iniziale ---------------- */

  function showStartScreen() {
    if (global.Leaderboard) global.Leaderboard.setPlaying(false);
    state.active = false;
    state.locked = false;
    state.levels = 5;
    state.currentLevel = 1;
    state.playerName = '';
    state.errorCount = 0;
    state.lastBeat = -1;
    state.timeRemaining = 0;
    state.currentVariant = null;
    clearInterval(state.timerId);
    audio.stopMusic();
    audio.clear('sounds');
    closeHint();
    updateErrorDisplay();
    updatePlayerDisplay();
    $('screen-code-display').textContent = '--';
    $('timer').textContent = '--:--';
    $('timer').classList.remove('urgent');

    const container = $('game-body');
    container.innerHTML = `
      <div class="start">
        <div class="start-head">
          <h2 class="section-title">Inserimento registro agenti</h2>
          <p>Inserisci il nome del team per sbloccare il terminale, poi scegli la modalità.</p>
        </div>

        <div class="field">
          <label for="nameInput">Nome giocatore / squadra</label>
          <input type="text" id="nameInput" placeholder="Es. Cyber Ninja" autocomplete="off" maxlength="80" enterkeyhint="go">
        </div>

        <div>
          <p class="field-label" style="font-size:.8rem;letter-spacing:2px;text-transform:uppercase;color:#b4ffd0;margin-bottom:10px;">Modalità di gioco</p>
          <div class="mode-select-box" role="radiogroup" aria-label="Modalità di gioco">
            ${[5, 8].map(levels => {
              const m = modeInfo[levels];
              return `<button type="button" class="mode-card${levels === 5 ? ' selected' : ''}" id="mode${levels}" role="radio" aria-checked="${levels === 5}" data-mode="${levels}">
                <h3>${m.icon} ${m.label}</h3>
                <ul>
                  <li><strong>${m.levels} livelli</strong> da superare</li>
                  <li>Tempo totale: <strong>${m.totalSeconds / 60} minuti</strong></li>
                  <li>Penalità per errore: <strong>−${Math.floor(m.penaltySeconds / 60)}:${(m.penaltySeconds % 60).toString().padStart(2, '0')}</strong></li>
                </ul>
              </button>`;
            }).join('')}
          </div>
        </div>

        <button class="btn btn-primary btn-block" type="button" id="start-btn">Inizia missione</button>
        <p class="section-sub" style="margin:0;text-align:center;">Premi Invio nel campo del nome per iniziare subito.</p>
      </div>`;

    container.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => selectMode(Number(card.dataset.mode)));
    });

    $('start-btn').addEventListener('click', startGame);
    const nameInput = $('nameInput');
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        startGame();
      }
    });
    nameInput.focus();
  }

  function selectMode(levels) {
    state.levels = levels;
    for (const mode of [5, 8]) {
      const card = $('mode' + mode);
      if (!card) continue;
      const selected = mode === levels;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-checked', String(selected));
    }
  }

  /* ---------------- Avvio partita ---------------- */

  function startGame() {
    if (global.Leaderboard && !global.Leaderboard.ready) {
      toast('Attendi il controllo della classifica o il salvataggio in corso.', 'warn');
      return;
    }
    const input = $('nameInput');
    if (!input || !input.value.trim()) {
      toast('Inserisci un nome valido prima di iniziare.', 'err');
      if (input) input.focus();
      return;
    }
    if (state.active) return;

    const mode = modeInfo[state.levels];
    state.playerName = input.value.trim().slice(0, 80);
    state.active = true;
    state.locked = false;
    state.errorCount = 0;
    state.lastBeat = -1;
    state.startedAt = performance.now();
    state.timeRemaining = mode.totalSeconds;
    state.penaltySeconds = mode.penaltySeconds;

    updatePlayerDisplay();
    updateErrorDisplay();

    if (global.Leaderboard) global.Leaderboard.setPlaying(true);

    audio.ensure();
    audio.track = 0;
    audio.step = 0;

    updateTimerDisplay();
    startTimer();
    loadLevel(1);
    audio.stopMusic();
    audio.startMusic();
  }

  /* ---------------- Livelli ---------------- */

  function progressHtml(levels) {
    let html = '<div class="progress" aria-hidden="true">';
    for (let i = 1; i <= levels; i++) {
      const cls = i < state.currentLevel ? 'done' : i === state.currentLevel ? 'current' : '';
      html += `<span class="progress-dot ${cls}"></span>`;
    }
    return html + '</div>';
  }

  function pickVariant(levels) {
    const list = variants[levels];
    const previous = state.currentVariant;
    const pool = list.length > 1 && previous ? list.filter(v => v.code !== previous.code) : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function loadLevel(level) {
    state.currentLevel = level;
    state.locked = false;
    closeHint();

    const variant = pickVariant(level);
    state.currentVariant = variant;
    $('screen-code-display').textContent = variant.code;

    const container = $('game-body');
    const showHint = level === 1 || level >= 4;
    let html = `
      <div class="level-header">
        <div class="level-title">Livello <strong>${level}</strong> / ${state.levels} · ${escapeHtml(titles[level])}</div>
        ${showHint ? '<button class="btn btn-ghost" type="button" onclick="openHint()">Info / Hint</button>' : ''}
      </div>
      ${progressHtml(state.levels)}`;

    if (level === 2) {
      html += `
        <div class="question-box">
          Il sito nasconde un codice di accesso nel suo codice sorgente.<br>
          Premi <strong>Ispeziona codice</strong>, cerca il commento che contiene la parola <code>TOKEN</code> e inserisci il valore che trovi dopo i due punti (può essere una parola o un codice).
        </div>
        <button id="inspect-code-button" type="button" class="btn btn-primary" aria-expanded="false" aria-controls="source-panel" style="margin-bottom:16px;">Ispeziona codice</button>
        <section id="source-panel" class="source-panel" hidden aria-labelledby="source-title">
          <h3 id="source-title" style="margin-bottom:8px;">Codice sorgente della pagina</h3>
          <p class="source-hint">Questo è solo il testo del codice, non una pagina da eseguire. Cerca la parola TOKEN e copia soltanto il valore dopo i due punti.</p>
          <div id="source-lines" class="source-lines" tabindex="0" role="region" aria-label="Codice HTML da analizzare"></div>
          <button type="button" class="btn btn-ghost" style="margin-top:12px;" onclick="toggleSource(false)">Chiudi e torna alla missione</button>
        </section>
        <div class="input-group">
          <input type="text" id="userInput" placeholder="Inserisci il token…" autocomplete="off" aria-label="Token trovato nel codice" enterkeyhint="go">
          <button class="btn btn-primary" type="button" data-action="check-text">Verifica</button>
        </div>`;
    } else if (variant.opts) {
      html += `
        <div class="question-box">${escapeHtml(variant.q)}</div>
        <div class="mcq-options">
          ${shuffle(variant.opts.map((_, i) => i)).map((i, n) => `
            <button class="option-btn" type="button" data-option="${i}">
              <span class="opt-key">${String.fromCharCode(65 + n)}</span>
              <span>${escapeHtml(variant.opts[i])}</span>
            </button>`).join('')}
        </div>`;
    } else {
      html += `
        <div class="question-box">${variant.text}</div>
        <div class="input-group">
          <input type="text" id="userInput" placeholder="Inserisci la risposta…" autocomplete="off" enterkeyhint="go">
          <button class="btn btn-primary" type="button" data-action="check-text">Invia</button>
        </div>`;
    }

    html += '<div id="feedback-area" aria-live="polite"></div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-action="check-text"]').forEach(btn => {
      btn.addEventListener('click', checkTextAnswer);
    });
    container.querySelectorAll('[data-option]').forEach(btn => {
      btn.addEventListener('click', () => checkOption(Number(btn.dataset.option)));
    });
    const inspect = $('inspect-code-button');
    if (inspect) inspect.addEventListener('click', () => toggleSource());

    const textInput = $('userInput');
    if (textInput) {
      textInput.focus();
      textInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkTextAnswer();
        }
      });
    }
  }

  /* ---------------- Verifiche ---------------- */

  function setBusy(value) {
    const container = $('game-body');
    if (!container) return;
    container.querySelectorAll('button, input').forEach(el => {
      if (el.closest('.modal')) return;
      el.disabled = value;
    });
  }

  function checkTextAnswer() {
    if (!state.active || state.locked) return;
    const input = $('userInput');
    if (!input || !state.currentVariant) return;
    if (!syncClock()) return;
    const value = input.value.trim().toUpperCase();
    if (!value) {
      input.focus();
      return;
    }
    if (value === state.currentVariant.ans.toUpperCase()) {
      handleCorrect();
    } else {
      applyPenalty();
    }
  }

  function checkOption(index) {
    if (!state.active || state.locked || !state.currentVariant || !state.currentVariant.opts) return;
    if (!syncClock()) return;
    const selected = state.currentVariant.opts[index];
    if (selected === state.currentVariant.ans) {
      handleCorrect();
    } else {
      applyPenalty();
    }
  }

  function handleCorrect() {
    state.locked = true;
    setBusy(true);
    audio.success();
    const area = $('feedback-area');
    if (area) area.innerHTML = '<p class="feedback ok">Codice accettato. Accesso al livello successivo…</p>';
    setTimeout(nextLevel, 520);
  }

  function applyPenalty() {
    if (!syncClock()) return;
    state.errorCount++;
    updateErrorDisplay();
    state.deadline -= state.penaltySeconds * 1000;
    if (!syncClock()) return;

    audio.error();
    vibrate(180);
    document.body.classList.add('flash-error');
    setTimeout(() => document.body.classList.remove('flash-error'), 400);

    const area = $('feedback-area');
    const minutes = Math.floor(state.penaltySeconds / 60);
    const seconds = (state.penaltySeconds % 60).toString().padStart(2, '0');
    if (area) {
      area.innerHTML = `<p class="feedback error" role="status">Risposta errata. Penalità: −${minutes}:${seconds}. Ecco una nuova variante.</p>`;
    }
    setTimeout(() => {
      if (state.active) loadLevel(state.currentLevel);
    }, 700);
  }

  function nextLevel() {
    if (!state.active) return;
    if (!syncClock()) return;
    if (state.currentLevel < state.levels) {
      loadLevel(state.currentLevel + 1);
    } else {
      finishGame();
    }
  }

  /* ---------------- Fine partita ---------------- */

  function finishGame() {
    const elapsedMs = Math.max(1, Math.round(performance.now() - state.startedAt));
    const mode = modeInfo[state.levels];
    state.active = false;
    clearInterval(state.timerId);
    audio.stopMusic();
    closeHint();
    audio.clear('sounds');

    let isRecord = false;
    if (global.Leaderboard) {
      isRecord = global.Leaderboard.record(state.levels, state.playerName, elapsedMs);
      global.Leaderboard.setPlaying(false);
    }
    const best = global.Leaderboard ? global.Leaderboard.bestTime(state.levels) : null;

    const remainingMin = Math.floor(Math.max(0, state.timeRemaining) / 60).toString().padStart(2, '0');
    const remainingSec = (Math.max(0, state.timeRemaining) % 60).toString().padStart(2, '0');

    $('game-body').innerHTML = `
      <div class="result win">
        <h2>Escape room completata</h2>
        <div class="badge">
          <div class="badge-brand"><img src="assets/logo-fassicomo.svg" alt="Fondazione Fassicomo" width="150" height="64"></div>
          <h3>Badge ufficiale hacker</h3>
          <p class="badge-school">Scuola Fassicomo</p>
          <p style="margin-top:14px;">Agente: <strong>${escapeHtml(state.playerName)}</strong></p>
          <p class="big">${global.Leaderboard ? global.Leaderboard.formatTime(elapsedMs) : (elapsedMs / 1000).toFixed(2) + ' s'}</p>
          <p class="badge-meta">Tempo reale di completamento</p>
          <p class="badge-meta">Tempo residuo: ${remainingMin}:${remainingSec} · Errori: ${state.errorCount} · Modalità: ${mode.label} (${mode.levels} livelli)</p>
          ${isRecord ? '<p class="feedback ok" style="margin-top:14px;">Nuovo record in classifica!</p>' : ''}
          ${!isRecord && best !== null ? `<p class="badge-meta">Miglior tempo ${mode.label}: ${global.Leaderboard.formatTime(best)}</p>` : ''}
        </div>
        <p class="note">Mostra questa schermata al tutor per registrare la vittoria.</p>
        <div class="result-actions">
          <button class="btn btn-primary" type="button" onclick="showStartScreen()">Nuova partita</button>
          <button class="btn btn-ghost" type="button" onclick="window.print()">Stampa badge</button>
        </div>
      </div>`;

    toast(isRecord ? 'Tempo registrato: nuovo record nella classifica!' : 'Partita conclusa. Il tempo non entra nella top 3.', isRecord ? 'ok' : 'warn');
  }

  function triggerGameOver() {
    if (!state.active) return;
    state.active = false;
    state.locked = true;
    clearInterval(state.timerId);
    audio.stopMusic();
    closeHint();
    state.timeRemaining = 0;
    updateTimerDisplay();
    if (global.Leaderboard) global.Leaderboard.setPlaying(false);
    audio.error();
    vibrate([120, 80, 220]);

    $('game-body').innerHTML = `
      <div class="result lose">
        <h2>System lockdown</h2>
        <p class="note">Il tempo a disposizione è scaduto: il sistema si è bloccato al livello ${state.currentLevel} di ${state.levels}.</p>
        <p class="note">Errori commessi: ${state.errorCount}. Nessun tempo registrato in classifica.</p>
        <div class="result-actions">
          <button class="btn btn-primary" type="button" onclick="showStartScreen()">Ricomicia</button>
        </div>
      </div>`;
  }

  /* ---------------- Hint ---------------- */

  function openHint() {
    if (!state.active || !syncClock()) return;
    const box = $('hintText');
    if (state.currentLevel === 1) {
      box.innerHTML = `
        <h4>Il cifrario di Cesare</h4>
        <p>Ogni lettera viene sostituita da un’altra, spostandosi nell’alfabeto. La chiave <strong>III</strong> è un numero romano e vale 3.</p>
        <p>Per cifrare si avanza di tre posizioni; per decifrare si torna indietro di tre posizioni.</p>
        <p>Esempio: CASA → FDVD. Per leggere FDVD: F → C, D → A, V → S, D → A.</p>
        <p class="alphabet">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
        <p>Usa tutte le 26 lettere: dopo Z si riparte da A, e tornando indietro prima di A c’è Z.</p>
        <button type="button" class="btn btn-ghost" style="margin-top:16px;" onclick="closeHint()">Torna alla missione</button>`;
    } else if (state.currentVariant && state.currentVariant.hint) {
      box.innerHTML = `<p>${escapeHtml(state.currentVariant.hint)}</p>
        <button type="button" class="btn btn-ghost" style="margin-top:16px;" onclick="closeHint()">Torna alla missione</button>`;
    } else if (state.currentLevel === 2) {
      box.innerHTML = `<p>Il valore cercato si trova in un commento HTML. L’etichetta del commento cambia (per esempio <code>ACCESSO</code>, <code>PASSWORD TEMPORANEA</code>, <code>CHIAVE DI RETE</code>): cerca la parola <code>TOKEN</code> e copia solo ciò che segue i due punti. Le righe sono numerate: scorri il riquadro del codice.</p>
        <button type="button" class="btn btn-ghost" style="margin-top:16px;" onclick="closeHint()">Torna alla missione</button>`;
    } else {
      return;
    }
    $('hintModal').classList.add('open');
  }

  function closeHint() {
    $('hintModal').classList.remove('open');
  }

  /* ---------------- Livello 2: codice sorgente ---------------- */

  /* Pagine del livello 2: una per variante (a-i).
     Il commento con il token cambia posizione a ogni variante. */
  const SOURCE_LABELS = {
    2: 'ACCESSO',
    3: 'PASSWORD TEMPORANEA',
    4: 'CODICE DI SBLOCCO',
    5: 'CHIAVE DI RETE'
  };

  function buildSource(variant) {
    const index = variant.code.charCodeAt(1) - 97;      // 0..8
    const name = variant.code.slice(-1).toUpperCase();
    const label = SOURCE_LABELS[(index % 4) + 2];
    const lines = [
      '<!DOCTYPE html>',
      '<html lang="it">',
      '<head>',
      '    <meta charset="UTF-8">',
      `    <title>Terminale ${name}</title>`,
      '</head>',
      '<body>',
      '    <header>',
      `        <h1>Accesso al settore ${name}</h1>`,
      '        <p>Rete riservata agli agenti.</p>',
      '    </header>',
      '    <nav>',
      '        <a href="#stato">Stato del sistema</a>',
      '    </nav>',
      '    <main>',
      '        <section id="stato">',
      '            <h2>Controllo connessione</h2>',
      '            <p>Collegamento al terminale attivo.</p>',
      '            <p>Identificazione agente in corso...</p>',
      '        </section>',
      '        <section id="accesso">',
      '            <button>Accedi</button>',
      '        </section>',
      '    </main>',
      '    <footer>Laboratorio di informatica</footer>',
      '</body>',
      '</html>'
    ];
    // sempre 28 righe, commento in posizione variabile
    const position = 17 + (index % 6);
    lines.splice(position, 0, `        <!-- ${label}: ${variant.ans} -->`);
    return lines.join('\n');
  }

  function toggleSource(force) {
    if (!state.active || state.currentLevel !== 2 || !state.currentVariant) return;
    if (!syncClock()) return;
    const panel = $('source-panel');
    const button = $('inspect-code-button');
    if (!panel || !button) return;
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      const lines = buildSource(state.currentVariant).split('\n');
      $('source-lines').innerHTML = lines.map((line, i) => `
        <div class="source-line">
          <span class="ln" aria-hidden="true">${i + 1}</span>
          <code class="code${line.includes('TOKEN') ? ' tok' : ''}">${escapeHtml(line)}</code>
        </div>`).join('');
      $('source-lines').focus();
      button.textContent = 'Nascondi codice';
    } else {
      button.textContent = 'Ispeziona codice';
      const input = $('userInput');
      if (input) input.focus();
    }
  }

  /* ---------------- Controlli audio ---------------- */

  function toggleSounds() {
    audio.soundsEnabled = !audio.soundsEnabled;
    audio.ensure();
    if (!audio.soundsEnabled) audio.clear('sounds');
    const button = $('sounds-toggle');
    button.textContent = 'Suoni: ' + (audio.soundsEnabled ? 'ON' : 'OFF');
    button.setAttribute('aria-pressed', String(audio.soundsEnabled));
  }

  function toggleMusic() {
    audio.musicEnabled = !audio.musicEnabled;
    audio.ensure();
    const button = $('music-toggle');
    button.textContent = 'Musica: ' + (audio.musicEnabled ? 'ON' : 'OFF');
    button.setAttribute('aria-pressed', String(audio.musicEnabled));
    if (!audio.musicEnabled) audio.stopMusic();
    else audio.startMusic();
  }

  function setMusicVolume(value) {
    audio.volume = Math.max(0, Math.min(0.5, Number(value)));
    if (audio.musicBus) audio.musicBus.gain.value = audio.musicEnabled ? audio.volume : 0;
  }

  /* ---------------- Eventi globali ---------------- */

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeHint();
      if (state.active && state.currentLevel === 2) {
        const panel = $('source-panel');
        if (panel && !panel.hidden) toggleSource(false);
      }
    }
  });

  $('hintModal').addEventListener('click', e => {
    if (e.target === $('hintModal')) closeHint();
  });

  $('sounds-toggle').addEventListener('click', toggleSounds);
  $('music-toggle').addEventListener('click', toggleMusic);
  $('music-volume').addEventListener('input', e => setMusicVolume(e.target.value));

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.active) syncClock();
  });

  window.addEventListener('resize', () => {
    const canvas = $('matrixCanvas');
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });

  /* ---------------- Sfondo Matrix ---------------- */

  function startMatrix() {
    const canvas = $('matrixCanvas');
    const ctx = canvas.getContext('2d');
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const fontSize = 16;
    let drops = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drops = Array(Math.ceil(canvas.width / fontSize)).fill(1);
    }

    function draw() {
      ctx.fillStyle = 'rgba(7, 3, 10, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#00ff41';
      ctx.font = fontSize + 'px monospace';
      for (let i = 0; i < drops.length; i++) {
        const text = chars.charAt(Math.floor(Math.random() * chars.length));
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }

    resize();
    window.addEventListener('resize', resize);
    setInterval(() => { if (!document.hidden) draw(); }, 40);
  }

  /* ---------------- Avvio applicazione ---------------- */

  function boot() {
    if (!global.Leaderboard) {
      $('game-body').textContent = 'Manca js/classifica.js: verifica che tutti i file del progetto siano presenti.';
      return;
    }
    if (!global.LEVELS) {
      $('game-body').textContent = 'Manca js/levels.js: verifica che tutti i file del progetto siano presenti.';
      return;
    }

    startMatrix();
    global.Leaderboard.mount();
    showStartScreen();
    global.Leaderboard.init();

    document.addEventListener('leaderboard:record', e => {
      const detail = e.detail;
      if (detail && detail.entry) {
        toast('Record salvato in modalità ' + detail.mode + '.', 'ok');
      }
    });
  }

  /* API pubblica usata dai pulsanti inline dell'HTML generato. */
  global.showStartScreen = showStartScreen;
  global.startGame = startGame;
  global.selectMode = selectMode;
  global.checkTextAnswer = checkTextAnswer;
  global.checkOption = checkOption;
  global.openHint = openHint;
  global.closeHint = closeHint;
  global.toggleSource = toggleSource;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
