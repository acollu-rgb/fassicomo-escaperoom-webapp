#!/usr/bin/env node
/* ============================================================
   run-tests.js — verifiche automatiche (senza browser reale)
   Simula DOM, canvas, localStorage, IndexedDB, File System API
   e un orologio controllabile.
   Uso: npm test
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];

function check(name, fn) {
  try {
    const outcome = fn();
    if (outcome === false) throw new Error('asserzione falsa');
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`  \u2717 ${name} \u2014 ${e.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'asserzione falsa');
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms == null ? 15 : ms));

/* ---------------- DOM simulato ---------------- */

function makeElement(tag, id) {
  const el = {
    tagName: String(tag).toUpperCase(),
    id: id || '',
    nodeType: 1,
    children: [],
    classes: [],
    attrs: {},
    style: {},
    dataset: {},
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    isConnected: true,
    listeners: {},
    parentNode: null,
    _html: '',
    querySelectorAll(selector) { return queryAll(this, selector); },
    querySelector(selector) { return queryAll(this, selector)[0] || null; },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    removeChild(child) { this.children = this.children.filter(c => c !== child); return child; },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    insertBefore(child) { this.children.unshift(child); child.parentNode = this; return child; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return this.attrs[name]; },
    removeAttribute(name) { delete this.attrs[name]; },
    focus() { doc.activeElement = this; },
    blur() {},
    click() { dispatch(this, 'click'); },
    getClientRects() { return [{ width: 10, height: 10 }]; },
    closest() { return null; },
    scrollIntoView() {},
    set innerHTML(html) { applyHtml(this, html); },
    get innerHTML() { return this._html; },
    get outerHTML() { return this._html; },
    get firstChild() { return this.children[0] || null; },
    get classList() {
      const self = el;
      return {
        add(...names) { names.forEach(n => { if (!self.classes.includes(n)) self.classes.push(n); }); },
        remove(...names) { self.classes = self.classes.filter(c => !names.includes(c)); },
        toggle(name, force) {
          const has = self.classes.includes(name);
          const want = force === undefined ? !has : !!force;
          if (want && !has) self.classes.push(name);
          if (!want && has) self.classes = self.classes.filter(c => c !== name);
          return want;
        },
        contains(name) { return self.classes.includes(name); }
      };
    },
    get className() { return el.classes.join(' '); },
    set className(value) { el.classes = String(value).split(/\s+/).filter(Boolean); }
  };
  return el;
}

const doc = {
  readyState: 'complete',
  activeElement: null,
  elements: {},
  listeners: {},
  hidden: false,
  body: null,
  documentElement: null,
  createElement(tag) { return makeElement(tag); },
  createTextNode(text) { return { nodeType: 3, textContent: text }; },
  getElementById(id) { return doc.elements[id] || null; },
  querySelector(selector) { return queryAll(doc.body, selector)[0] || null; },
  querySelectorAll(selector) { return queryAll(doc.body, selector); },
  addEventListener(type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent(event) {
    const handlers = doc.listeners[event.type] || [];
    for (const handler of handlers) handler(event);
    return true;
  }
};

function walk(el, out) {
  for (const child of el.children) {
    out.push(child);
    walk(child, out);
  }
  return out;
}

function matches(el, selector) {
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.classes.includes(selector.slice(1));
  if (selector.startsWith('[')) {
    const body = selector.slice(1, -1);
    const [name, rawValue] = body.split('=');
    if (rawValue === undefined) return el.attrs[name] !== undefined || el.dataset[name] !== undefined;
    return el.attrs[name] === rawValue.replace(/^["']|["']$/g, '');
  }
  if (selector.includes('[')) {
    const tag = selector.split('[')[0];
    return el.tagName === tag.toUpperCase();
  }
  return el.tagName === selector.toUpperCase() || selector === '*';
}

function queryAll(root, selector) {
  const all = walk(root, []);
  const matched = [];
  for (const sel of selector.split(',').map(s => s.trim()).filter(Boolean)) {
    for (const el of all) {
      if (matches(el, sel) && !matched.includes(el)) matched.push(el);
    }
  }
  return matched;
}

function forgetIds(el) {
  for (const child of walk(el, [])) {
    if (child.id && doc.elements[child.id] === child) delete doc.elements[child.id];
  }
}

function applyHtml(el, html) {
  forgetIds(el);
  el._html = html;
  el.children = [];
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)([^>]*?)\sid="([^"]+)"([^>]*)>/g;
  let match;
  while ((match = tagRegex.exec(String(html))) !== null) {
    const [, tag, before, id, after] = match;
    const child = makeElement(tag, id);
    const classMatch = (before + after).match(/class="([^"]*)"/);
    if (classMatch) child.classes = classMatch[1].split(/\s+/).filter(Boolean);
    const attrs = before + after;
    if (/\shidden(\s|$)/.test(attrs)) child.hidden = true;
    const dataRe = /data-([a-z0-9-]+)="([^"]*)"/g;
    let dataMatch;
    while ((dataMatch = dataRe.exec(attrs)) !== null) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      child.dataset[key] = dataMatch[2];
    }
    const valueMatch = attrs.match(/\svalue="([^"]*)"/);
    if (valueMatch) child.value = valueMatch[1];
    child.parentNode = el;
    el.children.push(child);
    doc.elements[id] = child;
  }
}

function dispatch(el, type, extra) {
  const event = Object.assign({
    type,
    target: el,
    currentTarget: el,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
    defaultPrevented: false,
    key: '',
    shiftKey: false
  }, extra || {});
  for (const handler of (el.listeners && el.listeners[type]) || []) handler(event);
  const inline = el['on' + type];
  if (typeof inline === 'function') inline(event);
  return event;
}

doc.body = makeElement('body');
doc.documentElement = makeElement('html');

const staticIds = [
  'matrixCanvas', 'schoolCanvas', 'game-body', 'leaderboard-area', 'hintModal', 'hintText',
  'admin-overlay', 'admin-close', 'admin-login', 'admin-password', 'admin-error',
  'admin-commands', 'admin-status', 'admin-detail', 'lb-connect', 'lb-create', 'lb-retry',
  'lb-import', 'lb-export', 'lb-reset', 'toast-area', 'timer', 'sounds-toggle', 'music-toggle',
  'music-volume', 'screen-code-display', 'errors-display', 'player-display'
];
for (const id of staticIds) {
  const el = makeElement('div', id);
  if (/Canvas$/.test(id)) {
    el.width = 800;
    el.height = 600;
    el.getContext = () => ({
      fillStyle: '', globalAlpha: 1, font: '', textBaseline: '',
      fillRect() {}, clearRect() {}, fillText() {}, measureText: () => ({ width: 10 })
    });
  }
  doc.elements[id] = el;
  doc.body.children.push(el);
}
doc.elements['admin-overlay'].hidden = true;

/* ---------------- Orologio controllabile ---------------- */

let clockOffset = 0;
class FakeDate extends Date {
  constructor(...args) {
    if (args.length === 0) super(Date.now() + clockOffset);
    else super(...args);
  }
  static now() { return Date.now() + clockOffset; }
}

/* ---------------- API del browser simulate ---------------- */

const store = new Map();
const localStorageMock = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: key => { store.delete(key); },
  clear: () => store.clear()
};

const idbStore = new Map();

function makeIdb() {
  return {
    open() {
      const request = {};
      setTimeout(() => {
        const db = {
          createObjectStore() {},
          transaction() {
            const tx = {};
            tx.objectStore = () => ({
              get: key => ({ get result() { return idbStore.get(key); } }),
              put: (value, key) => { idbStore.set(key, value); return {}; }
            });
            setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
            return tx;
          },
          close() {}
        };
        request.result = db;
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
}

let savedFileContent = null;
function fileContent() {
  if (!savedFileContent) {
    savedFileContent = JSON.stringify({ versione: 1, criterio: 'tempo-reale-v1', rapida: [], completa: [] }, null, 2);
  }
  return savedFileContent;
}

const fileHandle = {
  name: 'classifica.json',
  kind: 'file',
  async getFile() {
    const text = fileContent();
    return { size: Buffer.byteLength(text), text: async () => text };
  },
  async queryPermission() { return 'granted'; },
  async requestPermission() { return 'granted'; },
  async createWritable() {
    let buffer = '';
    return {
      async write(chunk) { buffer += chunk; },
      async close() { savedFileContent = buffer; },
      async abort() {}
    };
  }
};

const warnings = [];
const windowMock = {
  isSecureContext: true,
  innerWidth: 1280,
  innerHeight: 800,
  devicePixelRatio: 1,
  localStorage: localStorageMock,
  indexedDB: makeIdb(),
  showOpenFilePicker: async () => [fileHandle],
  showSaveFilePicker: async () => fileHandle,
  confirm: () => true,
  alert: msg => warnings.push(msg),
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  requestAnimationFrame: () => 0,
  cancelAnimationFrame() {},
  setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 5)),
  clearTimeout,
  setInterval: () => 0,
  clearInterval,
  performance: { now: () => FakeDate.now() },
  crypto: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2) },
  URL: { createObjectURL: () => 'blob:mock', revokeObjectURL() {} },
  Blob: class Blob { constructor(parts, options) { this.parts = parts; this.options = options; } },
  CustomEvent: class CustomEvent {
    constructor(type, init) { this.type = type; this.detail = (init || {}).detail; }
  },
  navigator: { vibrate: () => true },
  AudioContext: null,
  print() {},
  listeners: {},
  addEventListener(type, fn) { (windowMock.listeners[type] = windowMock.listeners[type] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent() { return true; }
};
windowMock.window = windowMock;
windowMock.document = doc;
windowMock.globalThis = windowMock;
windowMock.self = windowMock;
windowMock.console = console;
windowMock.Date = FakeDate;
windowMock.Math = Math;
windowMock.JSON = JSON;
windowMock.Number = Number;
windowMock.String = String;
windowMock.Object = Object;
windowMock.Array = Array;
windowMock.Promise = Promise;
windowMock.Error = Error;
windowMock.Boolean = Boolean;
windowMock.URLSearchParams = URLSearchParams;
windowMock.location = { href: 'http://localhost:3000/', search: '', protocol: 'http:' };
windowMock.idbStore = idbStore;
windowMock.__test = { warnings, get clockOffset() { return clockOffset; }, set clockOffset(v) { clockOffset = v; } };

function loadScript(relative) {
  const code = fs.readFileSync(path.join(ROOT, relative), 'utf8');
  vm.runInNewContext(code, windowMock, { filename: relative });
}

/* ============================================================
   TEST SINCRONI
   ============================================================ */

console.log('\nControllo sintattico');
for (const file of ['js/levels.js', 'js/classifica.js', 'js/scuola.js', 'js/game.js', 'server.js']) {
  check(`sintassi ${file}`, () => {
    new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file });
    return true;
  });
}

console.log('\nContenuti didattici');
loadScript('js/levels.js');
const LEVELS = windowMock.LEVELS;

check('otto livelli con titoli', () => Object.keys(LEVELS.titles).length === 8);
check('cinque varianti per ogni livello', () => {
  for (let level = 1; level <= 8; level++) assert(LEVELS.variants[level].length === 5, 'livello ' + level);
  return true;
});
check('risposte univoche per livello', () => {
  for (let level = 1; level <= 8; level++) {
    const answers = LEVELS.variants[level].map(v => v.ans);
    assert(new Set(answers).size === answers.length, 'duplicati al livello ' + level);
  }
  return true;
});
check('modalità rapida: 5 livelli, 12 minuti, penalità 120 s', () => {
  const m = LEVELS.modeInfo[5];
  return m.levels === 5 && m.totalSeconds === 720 && m.penaltySeconds === 120;
});
check('modalità completa: 8 livelli, 17 minuti, penalità 150 s', () => {
  const m = LEVELS.modeInfo[8];
  return m.levels === 8 && m.totalSeconds === 1020 && m.penaltySeconds === 150;
});
check('livello 1 con chiave III e risposta HACKER', () => {
  const v = LEVELS.variants[1][0];
  return v.text.includes('III') && v.ans === 'HACKER';
});
check('28 righe nel sorgente del livello 2', () => {
  const variant = LEVELS.variants[2][0];
  const lines = ['<!DOCTYPE html>', '<html lang="it">', '<head>', '    <meta charset="UTF-8">', '    <title>Terminale A</title>', '</head>', '<body>', '    <header>', '        <h1>Accesso al settore A</h1>', '        <p>Rete riservata agli agenti.</p>', '    </header>', '    <nav>', '        <a href="#stato">Stato del sistema</a>', '    </nav>', '    <main>', '        <section id="stato">', '            <h2>Controllo connessione</h2>', '            <p>Collegamento al terminale attivo.</p>', '            <p>Identificazione agente in corso...</p>', '        </section>', '        <section id="accesso">', '            <button>Accedi</button>', '        </section>', '    </main>', '    <footer>Laboratorio di informatica</footer>', '</body>', '</html>'];
  lines.splice(18 + variant.code.charCodeAt(1) - 97, 0, '        <!-- TOKEN: ' + variant.ans + ' -->');
  assert(lines.length === 28, 'righe: ' + lines.length);
  return true;
});

console.log('\nClassifica e Admin');
loadScript('js/classifica.js');
const Leaderboard = windowMock.Leaderboard;

check('interfaccia classifica montata', () => {
  Leaderboard.mount();
  return !!doc.getElementById('lb-cards') && !!doc.getElementById('admin-open');
});
check('gestione file nascosta', () => doc.getElementById('admin-overlay').hidden === true);
check('podi iniziali vuoti', () => {
  const html = doc.getElementById('lb-cards').innerHTML;
  return html.includes('Rapida') && html.includes('Completa') && html.includes('Nessun risultato');
});
check('password errata rifiutata', () => {
  doc.getElementById('admin-open').click();
  doc.getElementById('admin-password').value = 'sbagliata';
  doc.getElementById('admin-login').onsubmit({ preventDefault() {} });
  return doc.getElementById('admin-error').textContent === 'Password non corretta.'
    && doc.getElementById('admin-commands').hidden === true;
});
check('login corretto', () => {
  doc.getElementById('admin-password').value = 'Password.0';
  doc.getElementById('admin-login').onsubmit({ preventDefault() {} });
  return doc.getElementById('admin-commands').hidden === false;
});
check('chiusura Admin blocca di nuovo', () => {
  doc.getElementById('admin-close').click();
  return doc.getElementById('admin-overlay').hidden === true;
});
check('formato tempo minuti:secondi.centesimi', () => {
  assert(Leaderboard.formatTime(65432) === '01:05.43', Leaderboard.formatTime(65432));
  assert(Leaderboard.formatTime(1000) === '00:01.00', Leaderboard.formatTime(1000));
  return true;
});

/* ============================================================
   TEST ASINCRONI
   ============================================================ */

(async () => {
  // intenzionalmente lungo: init è asincrono
  const leaderboardReady = Leaderboard.init();
  await Promise.race([leaderboardReady, wait(200)]);
  await wait(40);

  check('init completato e pronta', () => Leaderboard.ready === true);
  check('senza file collegato lo stato lo segnala', () => {
    const text = doc.getElementById('lb-status').textContent;
    return text.includes('Nessun file collegato') || text.includes('memoria');
  });
  check('riattiva disabilitato senza file', () => doc.getElementById('lb-retry').disabled === true);

  doc.getElementById('admin-open').click();
  doc.getElementById('admin-password').value = 'Password.0';
  doc.getElementById('admin-login').onsubmit({ preventDefault() {} });
  doc.getElementById('lb-connect').click();
  await wait(80);

  check('collegamento file esistente', () => {
    assert(!!idbStore.get('classifica'), 'riferimento al file non ricordato');
    return doc.getElementById('lb-status').textContent.includes('Classifica collegata');
  });
  check('collegamento ricordato in IndexedDB', () => idbStore.get('classifica').name === 'classifica.json');

  doc.getElementById('admin-close').click();

  check('record registrato in memoria', () => {
    assert(Leaderboard.record(5, 'Squadra Alfa', 65432) === true, 'record rifiutato');
    return true;
  });
  check('cache locale aggiornata', () => {
    const raw = JSON.parse(localStorageMock.getItem('escape-room-fassicomo-204-classifica'));
    return raw && raw.rapida.length === 1 && raw.rapida[0].nome === 'Squadra Alfa';
  });
  check('classifiche separate per modalità', () => {
    const snap = Leaderboard.snapshot();
    return snap.rapida.length === 1 && snap.completa.length === 0;
  });
  check('risultato peggiore non entra in top 3', () => {
    Leaderboard.record(5, 'Beta', 90000);
    Leaderboard.record(5, 'Gamma', 40000);
    const before = JSON.stringify(Leaderboard.snapshot().rapida);
    const ok = Leaderboard.record(5, 'Delta', 120000);
    return ok === false && JSON.stringify(Leaderboard.snapshot().rapida) === before;
  });
  check('solo tre tempi, ordinati per tempo', () => {
    const names = Leaderboard.snapshot().rapida.map(r => r.nome);
    assert(names.length === 3, 'lunghezza ' + names.length);
    assert(names.join(',') === 'Gamma,Squadra Alfa,Beta', names.join(','));
    return true;
  });
  check('record modalità completa separato', () => {
    Leaderboard.record(8, 'Completa Uno', 500000);
    const snap = Leaderboard.snapshot();
    return snap.completa.length === 1 && snap.rapida.length === 3;
  });
  check('rifiuta modalità e tempi non validi', () => {
    return Leaderboard.record(6, 'X', 1000) === false
      && Leaderboard.record(5, 'Y', 0) === false
      && Leaderboard.record(5, 'Z', 90000000) === false;
  });
  check('podi nascosti durante la partita', () => {
    Leaderboard.setPlaying(true);
    const hidden = doc.getElementById('leaderboard-area').hidden === true;
    Leaderboard.setPlaying(false);
    return hidden && doc.getElementById('leaderboard-area').hidden === false;
  });
  check('tempo migliore per modalità', () => Leaderboard.bestTime(5) === 40000);
  check('snapshot isolato dalle mutazioni', () => {
    const snap = Leaderboard.snapshot();
    snap.rapida.push({ id: 'x', nome: 'X', tempoMs: 1, data: new Date().toISOString() });
    return Leaderboard.snapshot().rapida.length === 3;
  });
  const beforeAuto = savedFileContent;
  Leaderboard.record(5, 'Automatica', 30000);
  await wait(60);
  check('salvataggio automatico con Admin chiuso', () => {
    return savedFileContent !== beforeAuto && JSON.parse(savedFileContent).rapida[0].nome === 'Automatica';
  });
  check('backup scaricabile da Admin', () => {
    doc.getElementById('admin-open').click();
    doc.getElementById('admin-password').value = 'Password.0';
    doc.getElementById('admin-login').onsubmit({ preventDefault() {} });
    doc.getElementById('lb-export').click();
    return doc.getElementById('admin-status').textContent.includes('Backup richiesto');
  });
  doc.getElementById('lb-reset').click();
  await wait(80);
  check('azzeramento classifiche', () => {
    const snap = Leaderboard.snapshot();
    const onDisk = JSON.parse(fileContent());
    return snap.rapida.length === 0 && snap.completa.length === 0 && onDisk.rapida.length === 0;
  });
  doc.getElementById('admin-close').click();

  /* ---- game.js ---- */
  console.log('\nMotore di gioco');
  loadScript('js/game.js');
  windowMock.showStartScreen();
  await wait(80);

  check('schermata iniziale con selettore modalità', () => {
    const html = doc.getElementById('game-body').innerHTML;
    return html.includes('Inserimento registro agenti') && html.includes('mode5') && html.includes('mode8');
  });
  check('nome obbligatorio per iniziare', () => {
    doc.getElementById('nameInput').value = '';
    windowMock.startGame();
    return doc.getElementById('game-body').innerHTML.includes('Inserimento registro agenti');
  });
  check('nome valido avvia il livello 1 in modalità completa', () => {
    doc.getElementById('nameInput').value = 'Cyber Ninja';
    doc.getElementById('mode8').click();
    windowMock.startGame();
    const html = doc.getElementById('game-body').innerHTML;
    return doc.getElementById('player-display').textContent === 'Cyber Ninja'
      && html.includes('Crittografia') && html.includes('Livello');
  });
  check('timer avviato a 17 minuti', () => doc.getElementById('timer').textContent === '17:00');
  check('hint del cifrario di Cesare con chiave III', () => {
    windowMock.openHint();
    const text = doc.getElementById('hintText').innerHTML;
    return text.includes('cifrario di Cesare') && text.includes('III')
      && doc.getElementById('hintModal').classes.includes('open');
  });
  check('chiusura hint', () => {
    windowMock.closeHint();
    return !doc.getElementById('hintModal').classes.includes('open');
  });

  function currentVariant(level) {
    const code = doc.getElementById('screen-code-display').textContent;
    const variant = LEVELS.variants[level].find(v => v.code === code);
    assert(variant, 'variante non trovata per ' + code);
    return variant;
  }

  function submitText(value) {
    doc.getElementById('userInput').value = value;
    windowMock.checkTextAnswer();
  }

  check('risposta errata applica la penalità', () => {
    windowMock.openHint();
    windowMock.closeHint();
    submitText('RISPOSTA_SBAGLIATA');
    return doc.getElementById('errors-display').textContent === '1'
      && doc.getElementById('feedback-area').innerHTML.includes('Risposta errata');
  });
  await wait(60);

  check('dopo l’errore compare una nuova variante dello stesso livello', () => {
    const html = doc.getElementById('game-body').innerHTML;
    return html.includes('Crittografia') && !doc.getElementById('feedback-area').innerHTML.includes('Risposta errata');
  });

  check('risposta corretta al livello 1', () => {
    const variant = currentVariant(1);
    submitText(variant.ans.toLowerCase());
    return true;
  });
  await wait(80);

  check('passaggio al livello 2 con codice da ispezionare', () => {
    const html = doc.getElementById('game-body').innerHTML;
    return html.includes('Sviluppo Web') && html.includes('inspect-code-button') && html.includes('userInput');
  });
  check('ispezione codice mostra 28 righe con TOKEN', () => {
    doc.getElementById('inspect-code-button').click();
    const html = doc.getElementById('source-lines').innerHTML;
    const lines = (html.match(/class="source-line"/g) || []).length;
    assert(lines === 28, 'righe mostrate: ' + lines);
    assert(html.includes('TOKEN'), 'commento TOKEN assente');
    return doc.getElementById('source-panel').hidden === false;
  });
  check('token del livello 2 accettato', () => {
    submitText(currentVariant(2).ans);
    return true;
  });
  await wait(80);

  check('livello 3: conversione binaria', () => doc.getElementById('game-body').innerHTML.includes('Sistemi numerici'));

  const remainingLevels = [3, 4, 5, 6, 7, 8];
  for (const level of remainingLevels) {
    check(`completamento livello ${level}`, () => {
      const variant = currentVariant(level);
      if (variant.opts) {
        const index = variant.opts.indexOf(variant.ans);
        assert(index !== -1, 'risposta non presente nelle opzioni');
        windowMock.checkOption(index);
      } else {
        submitText(variant.ans);
      }
      return true;
    });
    await wait(80);
  }

  check('schermata di vittoria con badge e logo', () => {
    const html = doc.getElementById('game-body').innerHTML;
    return html.includes('Escape room completata') && html.includes('Badge ufficiale hacker')
      && html.includes('assets/logo-fassicomo.svg') && html.includes('Cyber Ninja');
  });
  check('tempo registrato nella classifica completa', () => {
    const list = Leaderboard.snapshot().completa;
    return list.length === 1 && list[0].nome === 'Cyber Ninja' && list[0].tempoMs > 0;
  });
  check('classifica aggiornata a schermo', () => doc.getElementById('lb-cards').innerHTML.includes('Cyber Ninja'));
  check('record salvato anche su file', () => {
    const disk = JSON.parse(fileContent());
    return disk.completa.length === 1 && disk.completa[0].nome === 'Cyber Ninja';
  });
  check('podi visibili dopo la vittoria', () => doc.getElementById('leaderboard-area').hidden === false);

  check('nuova partita azzera errori e giocatore', () => {
    windowMock.showStartScreen();
    return doc.getElementById('errors-display').textContent === '0'
      && doc.getElementById('player-display').textContent === '--'
      && doc.getElementById('timer').textContent === '--:--';
  });

  check('game over allo scadere del tempo', () => {
    doc.getElementById('nameInput').value = 'Team Lockdown';
    doc.getElementById('mode5').click();
    windowMock.startGame();
    assert(doc.getElementById('timer').textContent === '12:00', 'timer: ' + doc.getElementById('timer').textContent);
    clockOffset = 13 * 60 * 1000;
    doc.getElementById('userInput').value = 'QUALCOSA';
    windowMock.checkTextAnswer();
    const html = doc.getElementById('game-body').innerHTML;
    return html.includes('System lockdown') && doc.getElementById('timer').textContent === '00:00';
  });
  check('sconfitta non aggiunge record', () => Leaderboard.snapshot().rapida.length === 0);
  clockOffset = 0;

  check('modalità rapida: cinque livelli', () => {
    windowMock.showStartScreen();
    doc.getElementById('nameInput').value = 'Team Rapido';
    doc.getElementById('mode5').click();
    windowMock.startGame();
    return doc.getElementById('game-body').innerHTML.includes('/ 5');
  });

  /* ---- livello 2: nessun crash senza partita ---- */
  check('toggleSource innocuo fuori partita', () => {
    windowMock.showStartScreen();
    windowMock.toggleSource(true);
    return true;
  });
  check('openHint innocuo fuori partita', () => {
    windowMock.openHint();
    return !doc.getElementById('hintModal').classes.includes('open');
  });

  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log(`\nRisultato: ${passed} superati, ${failed} falliti su ${results.length}\n`);

  fs.writeFileSync(
    path.join(ROOT, 'tests', 'risultati.json'),
    JSON.stringify({
      data: new Date().toISOString(),
      passed,
      failed,
      total: results.length,
      tests: results.map(r => ({ nome: r.name, esito: r.ok ? 'superato' : 'fallito', errore: r.error || null }))
    }, null, 2)
  );

  process.exit(failed ? 1 : 0);
})();
