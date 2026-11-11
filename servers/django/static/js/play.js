/* ============================================================
   play.js — controller della partita
   Il timer mostrato è solo una copia: la verità è sul server,
   che ricalcola il tempo residuo a ogni richiesta.
   ============================================================ */
(function () {
  'use strict';

  const { api, toast, formatCountdown, escapeHtml } = window.EscapeAPI;
  const config = window.ESCAPEROOM || {};
  const stateNode = document.getElementById('initial-state');

  let state = stateNode ? JSON.parse(stateNode.textContent) : null;
  let serverOffset = 0;       // ms: orologio server - orologio client
  let tickTimer = null;
  let lastBeat = null;
  let busy = false;
  let ended = false;

  const gameBody = document.getElementById('game-body');
  const timerBox = document.getElementById('timer');
  const errorsBox = document.getElementById('errors-display');
  const codeBox = document.getElementById('screen-code-display');
  const hintModal = document.getElementById('hintModal');
  const hintText = document.getElementById('hintText');

  if (!state) {
    gameBody.textContent = 'Stato della partita non disponibile: ricarica la pagina.';
    return;
  }

  /* ---------------------------------------------------- timer */

  function syncOffset() {
    if (!state || !state.server_now) return;
    serverOffset = Date.parse(state.server_now) - Date.now();
  }

  function serverNow() {
    return Date.now() + serverOffset;
  }

  function remainingSeconds() {
    if (!state || state.status !== 'active') return 0;
    const deadline = Date.parse(state.deadline);
    return Math.max(0, Math.round((deadline - serverNow()) / 1000));
  }

  function renderTimer() {
    if (ended || !state) return;
    if (state.status !== 'active') {
      timerBox.textContent = '00:00';
      timerBox.classList.remove('urgent');
      return;
    }

    const seconds = remainingSeconds();
    timerBox.textContent = formatCountdown(seconds);
    timerBox.classList.toggle('urgent', seconds <= 10);

    if (seconds > 0 && seconds <= 10 && lastBeat !== seconds) {
      lastBeat = seconds;
      if (window.EscapeAudio) {
        window.EscapeAudio.stopMusic();
        window.EscapeAudio.tick(seconds <= 3);
      }
    }

    if (seconds === 0) {
      endGame('expired');
    }
  }

  function startTimer() {
    clearInterval(tickTimer);
    renderTimer();
    tickTimer = setInterval(renderTimer, 500);
  }

  /* ---------------------------------------------------- rendering */

  function progressHtml(level, total) {
    let html = '<div class="progress" aria-hidden="true">';
    for (let i = 1; i <= total; i++) {
      const cls = i < level ? 'done' : i === level ? 'current' : '';
      html += '<span class="progress-dot ' + cls + '"></span>';
    }
    return html + '</div>';
  }

  function renderHintButton(question) {
    if (!question || !question.hint) return '';
    return '<button class="btn btn-ghost" type="button" data-action="hint">Info / Hint</button>';
  }

  function renderQuestion() {
    const session = state;
    const question = session.question;

    if (session.status === 'completed') {
      window.location.assign(config.resultUrl);
      return;
    }
    if (session.status === 'expired' || session.status === 'abandoned') {
      window.location.assign(config.resultUrl);
      return;
    }

    if (!question) {
      gameBody.innerHTML = '<p class="loading">Preparazione della prossima domanda…</p>';
      return;
    }

    codeBox.textContent = question.code;
    errorsBox.textContent = String(session.error_count);

    let html = `
      <div class="level-header">
        <div class="level-title">Livello <strong>${question.level}</strong> / ${question.total_levels} · ${escapeHtml(question.title || '')}</div>
        ${renderHintButton(question)}
      </div>
      ${progressHtml(question.level, question.total_levels)}`;

    if (question.type === 'code_inspection') {
      html += `
        <div class="question-box">${question.text}</div>
        <div class="source-panel">
          <p class="source-note">La pagina si apre in un riquadro isolato: guarda il codice sorgente, cerca il commento e leggi il valore.</p>
          <iframe class="source-frame" id="source-frame" title="Pagina da ispezionare"
                  src="${escapeHtml(question.inspect_url)}" sandbox="allow-same-origin"></iframe>
          <div class="input-group" style="margin-top:14px;">
            <input type="text" id="userInput" placeholder="Inserisci il token trovato…"
                   autocomplete="off" autocapitalize="characters" enterkeyhint="go"
                   aria-label="Token trovato nel codice">
            <button class="btn btn-primary" type="button" data-action="submit-text">Verifica</button>
          </div>
        </div>`;
    } else if (question.type === 'choice' && question.options.length) {
      html += `
        <div class="question-box">${question.text}</div>
        <div class="mcq-options">
          ${question.options.map((option, index) => `
            <button class="option-btn" type="button" data-option-id="${option.id}">
              <span class="opt-key">${String.fromCharCode(65 + index)}</span>
              <span>${escapeHtml(option.text)}</span>
            </button>`).join('')}
        </div>`;
    } else {
      html += `
        <div class="question-box">${question.text}</div>
        <div class="input-group">
          <input type="text" id="userInput" placeholder="Inserisci la risposta…"
                 autocomplete="off" enterkeyhint="go">
          <button class="btn btn-primary" type="button" data-action="submit-text">Invia</button>
        </div>`;
    }

    html += '<div id="feedback-area" aria-live="polite"></div>';
    gameBody.innerHTML = html;
    bindQuestionEvents();
  }

  function bindQuestionEvents() {
    const submit = gameBody.querySelector('[data-action="submit-text"]');
    const input = document.getElementById('userInput');
    const hintButton = gameBody.querySelector('[data-action="hint"]');

    if (submit) submit.addEventListener('click', submitText);
    if (input) {
      input.focus();
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submitText();
        }
      });
    }
    if (hintButton) hintButton.addEventListener('click', openHint);

    gameBody.querySelectorAll('[data-option-id]').forEach(button => {
      button.addEventListener('click', () => submitChoice(Number(button.dataset.optionId)));
    });
  }

  function setBusy(value) {
    busy = value;
    gameBody.querySelectorAll('button, input').forEach(element => {
      element.disabled = value;
    });
  }

  function feedback(html, kind) {
    const area = document.getElementById('feedback-area');
    if (area) area.innerHTML = '<p class="feedback ' + kind + '">' + html + '</p>';
  }

  /* ---------------------------------------------------- invio risposte */

  async function sendAnswer(body, options) {
    if (busy || ended) return;
    setBusy(true);
    if (options && options.confirmText) {
      feedback(options.confirmText, 'ok');
    }

    try {
      const payload = await api(config.answerUrl, { method: 'POST', body });
      state = payload.session;
      syncOffset();

      if (payload.outcome === 'correct') {
        state = payload.session;
        if (window.EscapeAudio) window.EscapeAudio.success();
        feedback('Codice accettato. Accesso al livello successivo…', 'ok');
        setTimeout(() => {
          setBusy(false);
          renderQuestion();
        }, 520);
        renderTimer();
        return;
      }

      if (payload.outcome === 'wrong') {
        if (window.EscapeAudio) window.EscapeAudio.error();
        document.body.classList.add('flash-error');
        setTimeout(() => document.body.classList.remove('flash-error'), 400);
        errorsBox.textContent = String(state.error_count);
        renderTimer();

        const penalty = state.penalty_seconds;
        const label = Math.floor(penalty / 60) + ':' + String(penalty % 60).padStart(2, '0');
        feedback('Risposta errata. Penalità: −' + label + '. Ecco una nuova variante.', 'error');

        setTimeout(() => {
          setBusy(false);
          renderQuestion();
        }, 750);
        return;
      }

      // completed oppure expired
      endGame(payload.outcome);
    } catch (error) {
      if (error.status === 409) {
        // sessione chiusa da un'altra scheda o scaduta
        endGame('expired');
        return;
      }
      feedback(error.message, 'error');
      setBusy(false);
      toast(error.message, 'err');
    }
  }

  function submitText() {
    const input = document.getElementById('userInput');
    if (!input) return;
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    sendAnswer({ answer: value }, { confirmText: 'Verifica in corso…' });
  }

  function submitChoice(optionId) {
    sendAnswer({ option_id: optionId }, { confirmText: 'Verifica in corso…' });
  }

  /* ---------------------------------------------------- fine partita */

  function endGame(reason) {
    if (ended) return;
    ended = true;
    clearInterval(tickTimer);
    setBusy(true);
    if (window.EscapeAudio) {
      window.EscapeAudio.active = false;
      window.EscapeAudio.stopMusic();
    }

    if (reason === 'completed') {
      toast('Escape room completata!', 'ok');
    } else {
      toast('Tempo scaduto.', 'err');
    }

    setTimeout(() => window.location.assign(config.resultUrl), 700);
  }

  /* ---------------------------------------------------- hint */

  function openHint() {
    if (!state || !state.question) return;
    const question = state.question;

    if (question.level === 1) {
      hintText.innerHTML = `
        <h4>Il cifrario di Cesare</h4>
        <p>Ogni lettera viene sostituita da un’altra, spostandosi nell’alfabeto. La chiave <strong>III</strong> vale 3.</p>
        <p>Per cifrare si avanza di tre posizioni; per decifrare si torna indietro di tre posizioni.</p>
        <p>Esempio: CASA → FDVD. Per leggere FDVD: F → C, D → A, V → S, D → A.</p>
        <p class="alphabet">ABCDEFGHIJKLMNOPQRSTUVWXYZ</p>
        <p>Dopo Z si riparte da A; tornando indietro prima di A c’è Z.</p>
        <button type="button" class="btn btn-ghost" style="margin-top:16px;" data-close-hint>Torna alla missione</button>`;
    } else if (question.hint) {
      hintText.innerHTML = '<p>' + escapeHtml(question.hint) + '</p>' +
        '<button type="button" class="btn btn-ghost" style="margin-top:16px;" data-close-hint>Torna alla missione</button>';
    } else {
      return;
    }

    hintModal.classList.add('open');
    hintText.querySelectorAll('[data-close-hint]').forEach(button => {
      button.addEventListener('click', closeHint);
    });
    const close = hintModal.querySelector('.close-modal');
    if (close) close.focus();
  }

  function closeHint() {
    hintModal.classList.remove('open');
    const input = document.getElementById('userInput');
    if (input) input.focus();
  }

  /* ---------------------------------------------------- eventi globali */

  hintModal.addEventListener('click', event => {
    if (event.target === hintModal) closeHint();
  });
  document.querySelectorAll('[data-close-hint]').forEach(button => {
    button.addEventListener('click', closeHint);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeHint();
  });

  // se la scheda torna visibile, riallinea il timer col server
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !ended) {
      api(config.stateUrl)
        .then(payload => {
          state = payload.session;
          syncOffset();
          renderTimer();
          if (state.status !== 'active') endGame(state.status);
        })
        .catch(() => {});
    }
  });

  // avvisa se la partita è stata aperta in un'altra scheda
  window.addEventListener('beforeunload', event => {
    if (!ended && state && state.status === 'active') {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  /* ---------------------------------------------------- avvio */

  syncOffset();
  startTimer();
  renderQuestion();

  if (window.EscapeAudio) {
    window.EscapeAudio.active = true;
    const startMusicOnce = () => {
      window.EscapeAudio.ensure();
      if (remainingSeconds() > 10) window.EscapeAudio.startMusic();
      document.removeEventListener('pointerdown', startMusicOnce);
      document.removeEventListener('keydown', startMusicOnce);
    };
    document.addEventListener('pointerdown', startMusicOnce);
    document.addEventListener('keydown', startMusicOnce);
  }
})();
