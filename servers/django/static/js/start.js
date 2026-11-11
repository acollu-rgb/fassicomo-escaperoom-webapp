/* ============================================================
   start.js — schermata iniziale: scelta modalità e avvio partita
   ============================================================ */
(function () {
  'use strict';

  const { api, toast, escapeHtml } = window.EscapeAPI;
  const config = window.ESCAPEROOM || {};

  const form = document.getElementById('start-form');
  const nameInput = document.getElementById('team-name');
  const modeInput = document.getElementById('selected-mode');
  const startButton = document.getElementById('start-button');
  const errorBox = document.getElementById('start-error');

  /* ---------- selezione modalità ---------- */

  function selectMode(mode) {
    modeInput.value = mode;
    document.querySelectorAll('.mode-card').forEach(card => {
      const selected = card.dataset.mode === mode;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-checked', String(selected));
    });
  }

  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
  });

  /* ---------- avvio partita ---------- */

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.hidden = true;
  }

  async function startGame() {
    clearError();
    const teamName = nameInput.value.trim();
    if (!teamName) {
      showError('Inserisci il nome della squadra prima di iniziare.');
      nameInput.focus();
      return;
    }

    startButton.disabled = true;
    startButton.textContent = 'Preparazione della missione…';

    try {
      const payload = await api(config.startUrl, {
        method: 'POST',
        body: { team_name: teamName, mode: modeInput.value }
      });
      toast('Missione avviata. Buona fortuna, ' + payload.session.team_name + '!', 'ok');
      window.location.assign(payload.play_url);
    } catch (error) {
      showError(error.message);
      startButton.disabled = false;
      startButton.textContent = 'Inizia missione';
      if (error.code === 'team_name_in_use') nameInput.focus();
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    startGame();
  });

  nameInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      startGame();
    }
  });

  nameInput.addEventListener('input', clearError);

  /* ---------- aggiornamento periodico della classifica ---------- */

  async function refreshLeaderboard() {
    try {
      const payload = await api(config.leaderboardUrl);
      const cards = document.querySelectorAll('.lb-card');
      const modes = ['rapid', 'complete'];
      cards.forEach((card, index) => {
        const entries = payload.leaderboard[modes[index]] || [];
        const tbody = card.querySelector('tbody');
        if (!tbody) return;
        tbody.innerHTML = entries.length
          ? entries.map(entry => `
              <tr>
                <td class="pos">${entry.position}</td>
                <td>${escapeHtml(entry.team_name)}</td>
                <td class="time">${entry.formatted}</td>
              </tr>`).join('')
          : [1, 2, 3].map(position => `
              <tr><td class="pos">${position}</td><td class="empty" colspan="2">Nessun risultato</td></tr>`).join('');
      });
    } catch (e) {
      /* silenzioso: la classifica si aggiorna al prossimo giro */
    }
  }

  refreshLeaderboard();
  setInterval(refreshLeaderboard, 15000);

  nameInput.focus();
  if (config.mode) selectMode(config.mode);
})();
