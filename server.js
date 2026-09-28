/**
 * server.js — Serveur statique minimal, sans dépendance externe.
 *
 * Le jeu est un site 100% statique (HTML/CSS/JS), mais un hébergeur comme
 * Railway a besoin d'un process qui écoute sur le port qu'il fournit
 * (process.env.PORT). Ce petit serveur sert simplement les fichiers du
 * dossier courant, avec les bons types MIME pour que les modules ES
 * (js/main.js etc.) se chargent correctement dans le navigateur.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 3000;

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

server.listen(PORT, () => {
  console.log(`10 000 — serveur statique prêt sur le port ${PORT}`);
});
