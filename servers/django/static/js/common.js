/* ============================================================
   common.js — utilità condivise dalle pagine Django
   ============================================================ */
(function (global) {
  'use strict';

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : '';
  }

  const CSRF_TOKEN = getCookie('csrftoken');

  async function api(url, options) {
    const config = Object.assign(
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-CSRFToken': CSRF_TOKEN
        },
        credentials: 'same-origin'
      },
      options || {}
    );

    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }

    let response;
    try {
      response = await fetch(url, config);
    } catch (e) {
      throw new Error('Connessione al server non riuscita. Controlla la rete e riprova.');
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (e) {
      payload = null;
    }

    if (!response.ok || (payload && payload.ok === false)) {
      const message = (payload && payload.message) || 'Errore del server (' + response.status + ').';
      const error = new Error(message);
      error.code = payload && payload.error;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function toast(text, kind) {
    const area = document.getElementById('toast-area');
    if (!area) return;
    const node = document.createElement('div');
    node.className = 'toast' + (kind ? ' ' + kind : '');
    node.textContent = text;
    area.appendChild(node);
    setTimeout(() => {
      node.style.transition = 'opacity .3s';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 320);
    }, 4200);
  }

  function formatTime(ms) {
    const cent = Math.max(0, Math.floor(ms / 10));
    const minutes = String(Math.floor(cent / 6000)).padStart(2, '0');
    const seconds = String(Math.floor(cent / 100) % 60).padStart(2, '0');
    const cents = String(cent % 100).padStart(2, '0');
    return minutes + ':' + seconds + '.' + cents;
  }

  function formatCountdown(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    return String(Math.floor(sec / 60)).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  global.EscapeAPI = { api, toast, formatTime, formatCountdown, escapeHtml, csrfToken: CSRF_TOKEN };
})(window);
