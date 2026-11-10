#!/usr/bin/env node
/* ============================================================
   server.js — server statico minimale per l'Escape Room
   Nessuna dipendenza esterna. Serve i file del progetto e
   consente l'accesso all'host di preview (0.0.0.0 + CORS).
   Uso:  node server.js  [--port 3000] [--host 0.0.0.0]
   ============================================================ */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = __dirname;

function readArg(name, fallback) {
  const index = process.argv.indexOf('--' + name);
  if (index !== -1 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

const PORT = Number(process.env.PORT || readArg('port', '3000'));
const HOST = process.env.HOST || readArg('host', '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2'
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-cache'
  }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    return send(res, 204, '', { 'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS' });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Metodo non consentito');
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.parse(req.url).pathname || '/');
  } catch (e) {
    return send(res, 400, 'Richiesta non valida');
  }

  if (pathname === '/') pathname = '/index.html';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    return send(res, 403, 'Accesso negato');
  }
  if (filePath.includes(path.sep + '.git' + path.sep) || filePath.includes(path.sep + 'node_modules' + path.sep)) {
    return send(res, 403, 'Accesso negato');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return send(res, 404, 'File non trovato', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stats.size,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Escape Room Fassicomo in ascolto su http://${HOST}:${PORT}`);
  console.log('Premi Ctrl+C per fermare il server.');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Porta ${PORT} già in uso. Prova: node server.js --port 3001`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
