/* Sfondo Matrix verde: caratteri che cadono sul canvas #matrixCanvas. */
(function () {
  'use strict';

  const canvas = document.getElementById('matrixCanvas');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const FONT_SIZE = 16;
  let drops = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    drops = Array(Math.ceil(canvas.width / FONT_SIZE)).fill(1);
  }

  function draw() {
    ctx.fillStyle = 'rgba(7, 3, 10, 0.08)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#00ff41';
    ctx.font = FONT_SIZE + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
      const text = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
      ctx.fillText(text, i * FONT_SIZE, drops[i] * FONT_SIZE);
      if (drops[i] * FONT_SIZE > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  resize();
  window.addEventListener('resize', resize);
  setInterval(function () {
    if (!document.hidden) draw();
  }, 40);
})();
