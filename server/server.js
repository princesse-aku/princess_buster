// Serveur de test web : fichiers statiques + API de sauvegarde SQLite (node:sqlite, aucune dépendance npm).
// Lancer : node server/server.js  ->  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..', 'public');
const DB_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DB_DIR, 'princess-buster.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS progress (
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    best_score INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (player_id, level)
  );
`);

const q = {
  findPlayer: db.prepare('SELECT id, name FROM players WHERE name = ?'),
  insertPlayer: db.prepare('INSERT INTO players (name) VALUES (?)'),
  touchPlayer: db.prepare('UPDATE players SET last_played_at = CURRENT_TIMESTAMP WHERE id = ?'),
  progress: db.prepare('SELECT level, best_score AS bestScore, attempts, completed FROM progress WHERE player_id = ? ORDER BY level'),
  upsertProgress: db.prepare(`
    INSERT INTO progress (player_id, level, best_score, attempts, completed) VALUES (?, ?, ?, 1, ?)
    ON CONFLICT(player_id, level) DO UPDATE SET
      best_score = MAX(best_score, excluded.best_score),
      attempts = attempts + 1,
      completed = MAX(completed, excluded.completed),
      updated_at = CURRENT_TIMESTAMP`),
  leaderboard: db.prepare(`
    SELECT p.name, SUM(g.best_score) AS total, SUM(g.completed) AS levels
    FROM progress g JOIN players p ON p.id = g.player_id
    GROUP BY p.id ORDER BY total DESC, levels DESC LIMIT 10`),
};

function playerPayload(player) {
  return { id: Number(player.id), name: player.name, progress: q.progress.all(player.id).map((r) => ({ ...r })) };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}

async function api(req, res, url) {
  try {
    if (req.method === 'POST' && url.pathname === '/api/player') {
      const name = String((await readBody(req)).name || '').trim().slice(0, 20);
      if (!name) return send(res, 400, { error: 'Nom requis' });
      let player = q.findPlayer.get(name);
      if (!player) { q.insertPlayer.run(name); player = q.findPlayer.get(name); }
      q.touchPlayer.run(player.id);
      return send(res, 200, playerPayload(player));
    }
    if (req.method === 'POST' && url.pathname === '/api/progress') {
      const { playerId, level, score, won } = await readBody(req);
      if (!Number.isInteger(playerId) || !Number.isInteger(level) || level < 1 || level > 250) return send(res, 400, { error: 'Paramètres invalides' });
      q.upsertProgress.run(playerId, level, won ? Math.max(0, score | 0) : 0, won ? 1 : 0);
      const player = db.prepare('SELECT id, name FROM players WHERE id = ?').get(playerId);
      if (!player) return send(res, 404, { error: 'Joueur inconnu' });
      return send(res, 200, playerPayload(player));
    }
    if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
      return send(res, 200, q.leaderboard.all().map((r) => ({ ...r })));
    }
    send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Erreur serveur' });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`PBuster -> http://localhost:${PORT}`));
