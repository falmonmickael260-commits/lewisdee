import { nodeObserver } from './admin-observer/server.mjs';
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
import { verifyPlatformToken } from './net/platform-token.js';
import { nodeConnector } from './platform-connector/server.mjs';

// Charge .env.local si présent (développement uniquement — en production,
// l'hébergeur fournit ses propres variables d'environnement). `loadEnvFile`
// est disponible depuis Node 20.6 ; silencieusement ignoré sinon.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(new URL('.env.local', import.meta.url));
  } catch {
    /* pas de .env.local — normal en production */
  }
}

const ROOT = fileURLToPath(new URL('.', import.meta.url));
// 8744 par défaut pour coller au port utilisé par l'aperçu local de ce
// projet ; Railway (et tout hébergeur sérieux) fournit de toute façon sa
// propre variable PORT, qui prime toujours sur ce repli.
const PORT = process.env.PORT || 8744;

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
    if(await nodeObserver(req,res,'10000',(code,instance)=>rooms.adminSnapshot(code,instance)))return;
    if (await nodeConnector(req, res, '10000', rooms.platformConnector())) return;
    const url = new URL(req.url, 'http://local');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok', game: '10000', uptimeSeconds: Math.floor(process.uptime()),
        rooms: rooms.rooms.size, connectedPlayers: [...rooms.rooms.values()].reduce((sum, room) => sum + room.members.filter(m => m.connected && m.ws.readyState === 1).length, 0) }));
      return;
    }
    const decoded = decodeURIComponent(url.pathname);
    if (decoded.split('/').some(segment => segment.startsWith('.')) || !/^\/(?:$|index\.html$|(?:js|css|assets|sounds|images|fonts)\/)/.test(decoded)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Ressource introuvable.'); return;
    }
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
      // "no-cache" (et non "no-store") : le navigateur garde une copie mais
      // revalide toujours avant de l'utiliser — pas de risque de servir du
      // JS/CSS périmé après une mise à jour, sans perdre le bénéfice du cache.
      'Cache-Control': 'no-cache',
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
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;
    try {
    switch (msg.type) {
      case 'resume':
        rooms.resume(ws, msg.code, msg.token);
        break;
      case 'leave':
        rooms.leave(ws);
        break;
      case 'create': {
        const identity = verifyPlatformToken(msg.rgToken);
        rooms.create(ws, identity?.username || msg.name, identity?.uid ?? null);
        break;
      }
      case 'join': {
        const identity = verifyPlatformToken(msg.rgToken);
        rooms.join(ws, msg.code, identity?.username || msg.name, identity?.uid ?? null);
        break;
      }
      case 'startGame':
        rooms.start(ws);
        break;
      case 'action':
        rooms.action(ws, msg);
        break;
      default:
        break;
    }
    } catch {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message: 'Cette action ne peut pas être effectuée. Réessayez.' }));
      console.error('10000: commande refusée sans interruption du serveur.');
    }
  });
  ws.on('close', () => rooms.handleClose(ws));
  ws.on('error', () => rooms.handleClose(ws));
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);
heartbeat.unref?.();
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`10 000 — serveur prêt sur le port ${PORT} (HTTP + WebSocket /ws)`);
});
