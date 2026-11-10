/* ============================================================
   classifica.js — Classifiche Top 3 e pannello Admin
   Scuola Fassicomo · Escape Room 2.0.4

   Tre livelli di persistenza:
   1. cache locale del browser (localStorage) — sempre attiva;
   2. file classifica.json collegato con File System Access API
      (Chrome/Edge) — scrittura automatica a ogni nuovo record;
   3. importazione / esportazione manuale del JSON — sempre possibile.
   ============================================================ */
(function (global) {
  'use strict';

  const PASSWORD = 'Password.0';
  const CACHE_KEY = 'escape-room-fassicomo-204-classifica';
  const MAX_PER_MODE = 3;
  const MODES = [
    { key: 'rapida', levels: 5, title: 'Rapida', tag: '5 livelli' },
    { key: 'completa', levels: 8, title: 'Completa', tag: '8 livelli' }
  ];

  const empty = () => ({ versione: 1, criterio: 'tempo-reale-v1', rapida: [], completa: [] });
  const $ = id => document.getElementById(id);
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const compare = (a, b) => a.tempoMs - b.tempoMs || Date.parse(a.data) - Date.parse(b.data);

  let data = empty();
  let handle = null;
  let baseline = null;
  let dirty = false;
  let busy = false;
  let ready = false;
  let playing = false;
  let unlocked = false;
  let dialogOpen = false;
  let returnFocus = null;
  let lastNewId = null;
  let message = 'Controllo classifica…';
  let detail = '';
  let queue = Promise.resolve();

  const supported = () => !!(global.isSecureContext && global.showOpenFilePicker && global.showSaveFilePicker);

  /* ---------------- Formattazione ---------------- */

  function formatTime(ms) {
    const cent = Math.max(0, Math.floor(ms / 10));
    const minutes = Math.floor(cent / 6000).toString().padStart(2, '0');
    const seconds = (Math.floor(cent / 100) % 60).toString().padStart(2, '0');
    const cents = (cent % 100).toString().padStart(2, '0');
    return `${minutes}:${seconds}.${cents}`;
  }

  /* ---------------- Validazione e fusione ---------------- */

  function validate(obj) {
    if (!obj || obj.versione !== 1 || obj.criterio !== 'tempo-reale-v1') {
      throw new Error('Formato classifica non riconosciuto.');
    }
    const out = empty();
    const ids = new Set();
    for (const key of ['rapida', 'completa']) {
      if (!Array.isArray(obj[key]) || obj[key].length > MAX_PER_MODE) {
        throw new Error(`Massimo ${MAX_PER_MODE} risultati per modalità.`);
      }
      out[key] = obj[key].map(r => {
        const okId = r && typeof r.id === 'string' && r.id && r.id.length <= 150 && !ids.has(r.id);
        const okName = r && typeof r.nome === 'string' && r.nome.trim() && r.nome.length <= 80;
        const okTime = r && Number.isSafeInteger(r.tempoMs) && r.tempoMs > 0 && r.tempoMs <= 86400000;
        const okDate = r && typeof r.data === 'string' && Number.isFinite(Date.parse(r.data));
        if (!(okId && okName && okTime && okDate)) throw new Error('Risultato non valido.');
        ids.add(r.id);
        return { id: r.id, nome: r.nome.trim(), tempoMs: r.tempoMs, data: r.data };
      }).sort(compare);
    }
    return out;
  }

  function merge(a, b) {
    const out = empty();
    for (const key of ['rapida', 'completa']) {
      const seen = new Set();
      out[key] = [...a[key], ...b[key]]
        .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
        .sort(compare)
        .slice(0, MAX_PER_MODE);
    }
    return out;
  }

  /* ---------------- Cache locale (localStorage) ---------------- */

  function readCache() {
    try {
      const raw = global.localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return validate(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function writeCache() {
    try {
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearCache() {
    try { global.localStorage.removeItem(CACHE_KEY); } catch (e) { /* nulla */ }
  }

  /* ---------------- Riferimento al file (IndexedDB) ---------------- */

  async function fileLink(action, value) {
    if (!global.indexedDB) throw new Error('Memoria browser non disponibile.');
    return new Promise((resolve, reject) => {
      let db;
      let settled = false;
      const timer = setTimeout(() => done(new Error('Memoria browser non disponibile.')), 2500);
      function done(error, result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (db) db.close();
        error ? reject(error) : resolve(result);
      }
      const req = global.indexedDB.open('escape-room-fassicomo-204-file-link', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('links');
      req.onerror = () => done(req.error);
      req.onblocked = () => done(new Error('Archivio browser occupato.'));
      req.onsuccess = () => {
        db = req.result;
        if (settled) { db.close(); return; }
        try {
          const tx = db.transaction('links', action === 'get' ? 'readonly' : 'readwrite');
          const store = tx.objectStore('links');
          const op = action === 'get' ? store.get('classifica') : store.put(value, 'classifica');
          tx.oncomplete = () => done(null, op.result);
          tx.onerror = () => done(tx.error);
          tx.onabort = () => done(tx.error || new Error('Operazione interrotta.'));
        } catch (e) { done(e); }
      };
    });
  }

  async function remember() {
    try {
      await fileLink('put', handle);
      detail = 'Collegamento ricordato in questo browser: il permesso viene verificato alla riapertura.';
    } catch (e) {
      detail = 'File salvabile, ma da riselezionare alla prossima apertura.';
    }
  }

  async function readFile(h) {
    const file = await h.getFile();
    if (file.size > 65536) throw new Error('File troppo grande: massimo 64 KB.');
    return validate(JSON.parse(await file.text()));
  }

  function failure(e) {
    message = 'Operazione non riuscita: ' + (e && e.message ? e.message : e);
    render();
  }

  /* ---------------- Rendering ---------------- */

  function rowHtml(mode, index, record) {
    const pos = index + 1;
    if (!record) {
      return `<tr><td class="pos">${pos}</td><td class="empty" colspan="2">Nessun risultato</td></tr>`;
    }
    const isNew = record.id === lastNewId ? ' class="is-new"' : '';
    return `<tr${isNew}><td class="pos">${pos}</td><td>${esc(record.nome)}</td><td class="time">${formatTime(record.tempoMs)}</td></tr>`;
  }

  function render() {
    const host = $('leaderboard-area');
    if (!host) return;

    host.hidden = playing;

    const cards = $('lb-cards');
    if (cards) {
      cards.innerHTML = MODES.map(m => `
        <div class="lb-card">
          <h3>${m.title} <span class="lb-tag">${m.tag}</span></h3>
          <table>
            <thead><tr><th scope="col">Pos.</th><th scope="col">Squadra</th><th scope="col">Tempo</th></tr></thead>
            <tbody>${[0, 1, 2].map(i => rowHtml(m.key, i, data[m.key][i])).join('')}</tbody>
          </table>
        </div>`).join('');
    }

    const status = $('lb-status');
    if (status) {
      let text = message;
      if (dirty) text += ' — record in memoria non ancora salvati nel file.';
      status.textContent = text;
      status.classList.toggle('warn', dirty);
    }

    for (const id of ['admin-status', 'admin-detail']) {
      const el = $(id);
      if (!el) continue;
      if (id === 'admin-status') el.textContent = dirty ? message + ' — record in memoria non ancora salvati nel file.' : message;
      else el.textContent = detail;
    }

    const commands = $('admin-commands');
    if (commands) commands.hidden = !unlocked;
    const login = $('admin-login');
    if (login) login.hidden = unlocked;

    for (const id of ['lb-connect', 'lb-create', 'lb-retry', 'lb-import', 'lb-export', 'lb-reset']) {
      const button = $(id);
      if (!button) continue;
      button.disabled = !unlocked || playing || !ready || busy;
      if (!supported() && (id === 'lb-connect' || id === 'lb-create')) button.disabled = true;
      if (id === 'lb-retry' && !handle) button.disabled = true;
    }

    const connected = $('lb-connected');
    if (connected) {
      connected.textContent = handle ? `File collegato: ${handle.name}` : 'Nessun file collegato (i tempi restano nella memoria del browser).';
    }
  }

  function mount() {
    const host = $('leaderboard-area');
    if (!host) return;

    host.innerHTML = `
      <h2 class="section-title">Migliori tempi</h2>
      <p class="section-sub">Tempo reale di completamento, al centesimo di secondo. Si conservano solo i migliori tre tempi per modalità: nessun punteggio, nessuno storico.</p>
      <div class="lb-grid" id="lb-cards"></div>
      <p id="lb-status" class="lb-status" role="status"></p>
      <div class="lb-footer">
        <span id="lb-connected" class="lb-status"></span>
        <button class="btn btn-ghost" type="button" id="admin-open">Admin</button>
      </div>`;

    $('admin-open').onclick = openAdmin;

    const overlay = $('admin-overlay');
    if (overlay) {
      $('admin-close').onclick = closeAdmin;
      $('admin-login').onsubmit = login;
      overlay.addEventListener('click', e => { if (e.target === overlay) closeAdmin(); });
      $('lb-connect').onclick = connect;
      $('lb-create').onclick = create;
      $('lb-retry').onclick = retry;
      $('lb-import').onclick = manualImport;
      $('lb-export').onclick = exportBackup;
      $('lb-reset').onclick = resetLeaderboard;
    }

    render();
  }

  /* ---------------- Pannello Admin ---------------- */

  function openAdmin() {
    if (playing) return;
    returnFocus = document.activeElement;
    unlocked = false;
    dialogOpen = true;
    const overlay = $('admin-overlay');
    if (!overlay) return;
    $('admin-password').value = '';
    $('admin-error').textContent = '';
    overlay.hidden = false;
    render();
    $('admin-password').focus();
  }

  function closeAdmin() {
    unlocked = false;
    dialogOpen = false;
    const overlay = $('admin-overlay');
    if (overlay) overlay.hidden = true;
    if ($('admin-password')) $('admin-password').value = '';
    if ($('admin-error')) $('admin-error').textContent = '';
    render();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  }

  function login(e) {
    e.preventDefault();
    const input = $('admin-password');
    if (input.value !== PASSWORD) {
      input.value = '';
      $('admin-error').textContent = 'Password non corretta.';
      input.focus();
      return;
    }
    unlocked = true;
    input.value = '';
    $('admin-error').textContent = '';
    render();
    $('admin-close').focus();
  }

  const allowed = () => unlocked && dialogOpen && !playing && ready && !busy;

  /* ---------------- Azioni sui file ---------------- */

  async function connect() {
    if (!allowed()) return;
    busy = true;
    render();
    try {
      const [candidate] = await global.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Classifica JSON', accept: { 'application/json': ['.json'] } }]
      });
      if (await candidate.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        throw new Error('Scrittura non autorizzata.');
      }
      const loaded = await readFile(candidate);
      if (dirty && !global.confirm('Unire i record non salvati al file scelto? Restano solo i migliori tre per modalità.')) return;
      const pending = dirty;
      data = pending ? merge(loaded, data) : loaded;
      handle = candidate;
      baseline = JSON.stringify(loaded);
      dirty = pending && JSON.stringify(data) !== baseline;
      writeCache();
      message = `Classifica collegata: ${handle.name}. Salvataggio automatico attivo.`;
      await remember();
      if (dirty) save();
    } catch (e) {
      if (e.name !== 'AbortError') failure(e);
    } finally {
      busy = false;
      render();
    }
  }

  async function create() {
    if (!allowed()) return;
    busy = true;
    render();
    try {
      const candidate = await global.showSaveFilePicker({
        suggestedName: 'classifica.json',
        types: [{ description: 'Classifica JSON', accept: { 'application/json': ['.json'] } }]
      });
      const writer = await candidate.createWritable();
      try {
        await writer.write(JSON.stringify(data, null, 2));
        await writer.close();
      } catch (e) {
        try { await writer.abort(); } catch (_) { /* nulla */ }
        throw e;
      }
      handle = candidate;
      baseline = JSON.stringify(data);
      dirty = false;
      message = `Classifica salvata: ${handle.name}. Salvataggio automatico attivo.`;
      await remember();
    } catch (e) {
      if (e.name !== 'AbortError') failure(e);
    } finally {
      busy = false;
      render();
    }
  }

  function save() {
    queue = queue.then(async () => {
      if (!dirty) return;
      if (!handle) {
        message = 'Tempi salvati nella memoria di questo browser. Collega o crea un file da Admin per una copia su disco.';
        render();
        return;
      }
      busy = true;
      message = 'Salvataggio in corso: non chiudere.';
      render();
      try {
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
          throw new Error('Permesso mancante: Admin → Riattiva / Salva.');
        }
        const disk = await readFile(handle);
        if (baseline !== null && JSON.stringify(disk) !== baseline) {
          throw new Error('File modificato all’esterno: Admin → Riattiva / Salva per unire.');
        }
        const snapshot = JSON.stringify(data);
        const writer = await handle.createWritable();
        try {
          await writer.write(JSON.stringify(JSON.parse(snapshot), null, 2));
          await writer.close();
        } catch (e) {
          try { await writer.abort(); } catch (_) { /* nulla */ }
          throw e;
        }
        baseline = snapshot;
        dirty = JSON.stringify(data) !== snapshot;
        message = `Classifica salvata: ${handle.name}. Salvataggio automatico attivo.`;
      } catch (e) {
        message = 'Salvataggio non riuscito: ' + (e && e.message ? e.message : e);
        writeCache();
      } finally {
        busy = false;
        render();
      }
    }).catch(failure);
    return queue;
  }

  async function retry() {
    if (!allowed() || !handle) return;
    busy = true;
    render();
    try {
      if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') {
        throw new Error('Autorizzazione negata.');
      }
      const loaded = await readFile(handle);
      baseline = JSON.stringify(loaded);
      data = dirty ? merge(loaded, data) : loaded;
      dirty = JSON.stringify(data) !== baseline;
      writeCache();
      message = `Classifica caricata: ${handle.name}. Salvataggio automatico attivo.`;
      if (dirty) save();
    } catch (e) {
      failure(e);
    } finally {
      busy = false;
      render();
    }
  }

  function exportBackup() {
    if (!allowed()) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classifica-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message = 'Backup richiesto: verifica il download. Il file collegato non cambia.';
    render();
  }

  function manualImport() {
    if (!allowed()) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      if (!input.files || !input.files[0]) return;
      busy = true;
      render();
      try {
        const file = input.files[0];
        if (file.size > 65536) throw new Error('File troppo grande.');
        const loaded = validate(JSON.parse(await file.text()));
        if (dirty && !global.confirm('Unire i record non salvati al file importato mantenendo i soli migliori tre?')) return;
        data = dirty ? merge(loaded, data) : loaded;
        handle = null;
        baseline = null;
        dirty = true;
        writeCache();
        message = 'Copia importata nella memoria del browser: collega o crea un file, oppure scarica il backup.';
      } catch (e) {
        failure(e);
      } finally {
        busy = false;
        render();
      }
    };
    input.click();
  }

  function resetLeaderboard() {
    if (!allowed()) return;
    if (!global.confirm('Azzerare tutte le classifiche? L’operazione svuota la memoria del browser e il file collegato. Scarica prima un backup se ti serve.')) return;
    busy = true;
    render();
    data = empty();
    lastNewId = null;
    writeCache();
    baseline = null;
    dirty = true;
    message = 'Classifiche azzerate.';
    if (handle) save();
    busy = false;
    render();
  }

  /* ---------------- Avvio ---------------- */

  async function init() {
    try {
      const cached = readCache();
      if (cached) data = cached;

      if (!supported()) {
        message = 'Salvataggio diretto su file non disponibile in questo browser: i tempi restano nella memoria del browser, con importazione e backup manuali.';
        detail = 'Per il salvataggio automatico usa Chrome o Edge desktop con la pagina servita in HTTPS.';
        dirty = !!cached;
        return;
      }

      handle = (await fileLink('get')) || null;
      if (!handle) {
        message = cached
          ? 'Tempi caricati dalla memoria del browser. Apri Admin per collegare classifica.json.'
          : 'Nessun file collegato. Apri Admin per collegare classifica.json.';
        dirty = !!cached;
        return;
      }

      if (await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
        const disk = await readFile(handle);
        baseline = JSON.stringify(disk);
        data = cached ? merge(disk, data) : disk;
        dirty = JSON.stringify(data) !== baseline;
        writeCache();
        message = `Classifica collegata: ${handle.name}. Salvataggio automatico attivo.`;
        if (dirty) save();
      } else {
        message = cached
          ? 'File ricordato ma permesso da rinnovare: i tempi vengono dalla memoria del browser.'
          : 'File ricordato. Admin → Riattiva / Salva per caricarlo.';
        dirty = !!cached;
      }
    } catch (e) {
      message = 'Collegamento automatico non disponibile. I tempi restano nella memoria del browser.';
      detail = String(e && e.message ? e.message : e);
      dirty = !!data.rapida.length || !!data.completa.length;
    } finally {
      ready = true;
      render();
    }
  }

  /* ---------------- Registrazione di un tempo ---------------- */

  function record(levels, name, elapsedMs) {
    if (!ready || ![5, 8].includes(levels)) return false;
    if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 1 || elapsedMs > 86400000) return false;

    const key = levels === 5 ? 'rapida' : 'completa';
    const previous = JSON.stringify(data[key]);
    const id = global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);

    const entry = {
      id,
      nome: String(name).trim().slice(0, 80) || 'Squadra',
      tempoMs: elapsedMs,
      data: new Date().toISOString()
    };

    data[key] = [...data[key], entry].sort(compare).slice(0, MAX_PER_MODE);
    if (JSON.stringify(data[key]) === previous) return false;

    lastNewId = id;
    dirty = true;
    writeCache();
    message = 'Nuovo record: aggiornamento della classifica.';
    render();
    save();
    document.dispatchEvent(new CustomEvent('leaderboard:record', { detail: { mode: key, entry } }));
    return true;
  }

  /* ---------------- Utilità per il gioco ---------------- */

  function bestTime(levels) {
    const key = levels === 5 ? 'rapida' : 'completa';
    const list = data[key];
    return list.length ? list[0].tempoMs : null;
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(data));
  }

  /* ---------------- Eventi globali ---------------- */

  global.addEventListener('beforeunload', e => {
    if (dirty || busy) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  document.addEventListener('keydown', e => {
    if (!dialogOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAdmin();
      return;
    }
    if (e.key === 'Tab') {
      const focusables = [...$('admin-overlay').querySelectorAll('button,input')]
        .filter(x => !x.disabled && x.getClientRects().length);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  global.Leaderboard = {
    get ready() { return ready && !busy; },
    get playing() { return playing; },
    mount,
    init,
    record,
    formatTime,
    bestTime,
    snapshot,
    setPlaying(value) {
      playing = !!value;
      if (playing) closeAdmin();
      render();
    }
  };
})(window);
