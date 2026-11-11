/* ============================================================
   scuola.js — animazione "SCUOLA FASSICOMO" sullo sfondo
   Versione 2.0.4 · font 32px, spaziatura 35px, velocità 90–175 px/s
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('schoolCanvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  const TEXT = 'SCUOLA FASSICOMO';
  const FONT = 32;
  const SPACING = 35;
  const MIN_SPEED = 90;
  const MAX_SPEED = 175;
  const PHRASE_HEIGHT = TEXT.length * SPACING;

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const paused = () => document.hidden || (reduceMotion && reduceMotion.matches);

  let streams = [];
  let previous = null;

  const randomSpeed = () => MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);

  function chooseX(except) {
    const limit = Math.max(0, canvas.width - FONT - 4);
    const minimum = FONT * 1.45;
    let best = limit / 2;
    let bestDistance = -1;
    for (let i = 0; i < 36; i++) {
      const x = Math.random() * limit;
      const others = streams.filter(s => s !== except);
      const distance = others.length ? Math.min(...others.map(s => Math.abs(s.x - x))) : Infinity;
      if (distance >= minimum) return x;
      if (distance > bestDistance) { best = x; bestDistance = distance; }
    }
    return best;
  }

  function makeStream(except) {
    return {
      x: chooseX(except || null),
      y: -PHRASE_HEIGHT + Math.random() * (canvas.height + PHRASE_HEIGHT),
      speed: randomSpeed(),
      alpha: 0.72 + Math.random() * 0.28
    };
  }

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.max(2, Math.min(12, Math.round(canvas.width / 150)));
    streams = [];
    for (let i = 0; i < count; i++) streams.push(makeStream(null));
    previous = null;
  }

  function draw(now) {
    window.requestAnimationFrame(draw);

    if (paused()) { previous = null; return; }

    const dt = previous === null ? 0 : Math.max(0, Math.min(0.08, (now - previous) / 1000));
    previous = now;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold ' + FONT + 'px monospace';
    ctx.textBaseline = 'alphabetic';

    for (const stream of streams) {
      ctx.globalAlpha = stream.alpha;
      for (let i = 0; i < TEXT.length; i++) {
        const y = stream.y + i * SPACING;
        if (y < -FONT || y > canvas.height + FONT) continue;
        ctx.fillStyle = i === 0 ? '#e2ffed' : '#8dffb0';
        ctx.fillText(TEXT[i], stream.x, y);
      }
      stream.y += stream.speed * dt;
      if (stream.y > canvas.height + FONT) {
        stream.y = -PHRASE_HEIGHT - Math.random() * 120;
        stream.x = chooseX(stream);
        stream.speed = randomSpeed();
        stream.alpha = 0.72 + Math.random() * 0.28;
      }
    }
    ctx.globalAlpha = 1;
  }

  resize();
  window.addEventListener('resize', resize);
  window.requestAnimationFrame(draw);
})();
