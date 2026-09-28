/**
 * server.js — Serveur statique + salons multijoueur en temps réel.
 *
 * Sert les fichiers du jeu (HTML/CSS/JS) et, sur le même port, un serveur
 * WebSocket pour les salons en ligne (voir net/rooms.js). Railway n'a besoin
 * que d'un seul process écoutant process.env.PORT — c'est celui-ci.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager } from './net/rooms.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// 8743 par défaut pour coller au port utilisé par l'aperçu local de ce
// projet ; Railway (et tout hébergeur sérieux) fournit de toute façon sa
// propre variable PORT, qui prime toujours sur ce repli.
const PORT = process.env.PORT || 8743;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '') path = '/index.html';

    let filePath = join(ROOT, path);
    let info;
    try {
      info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
        info = await stat(filePath);
      }
    } catch {
      // Route inconnue (ex: navigation côté client) : on retombe sur
      // index.html plutôt que de renvoyer une 404 brute.
      filePath = join(ROOT, 'index.html');
      info = await stat(filePath);
    }

    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': path === '/index.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Erreur serveur.');
    console.error(err);
  }
});

// ---------------------------------------------------------------------------
// Salons multijoueur en temps réel (WebSocket)
// ---------------------------------------------------------------------------

const rooms = new RoomManager();
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg.type) {
      case 'create':
        rooms.create(ws, msg.name);
        break;
      case 'join':
        rooms.join(ws, msg.code, msg.name);
        break;
      case 'startGame':
        rooms.start(ws);
        break;
      case 'action':
        rooms.action(ws, msg);
        break;
      default:
        break;
    }
  });
  ws.on('close', () => rooms.handleClose(ws));
  ws.on('error', () => rooms.handleClose(ws));
});

server.listen(PORT, () => {
  console.log(`10 000 — serveur prêt sur le port ${PORT} (HTTP + WebSocket /ws)`);
});
