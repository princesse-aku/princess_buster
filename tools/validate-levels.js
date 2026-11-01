// Vérifie tous les niveaux de public/levels/ (utilisé par `npm test` et la CI GitHub).
// Règles : champs requis, technos connues, pièces dans la grille, pas de chevauchement dans une même rangée,
// deux rangées au plus (layer 0 devant, 1 derrière), et AUCUNE pièce suspendue (chaque pièce repose entièrement sur des pièces de sa rangée ou sur la table).
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public', 'levels');
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
const known = new Set(index.techs.map((t) => t.key));
const themes = new Set(index.themes);
let errors = 0;
const fail = (file, msg) => { errors++; console.error(`✗ ${file}: ${msg}`); };

for (const { id, file } of index.levels) {
  const l = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (l.id !== id) fail(file, `id ${l.id} différent de l'index (${id})`);
  if (!(l.balls > 0)) fail(file, 'balls doit être > 0');
  if (!themes.has(l.theme)) fail(file, `thème inconnu « ${l.theme} »`);
  if (!(l.rows > 0 && l.cols > 0)) fail(file, 'rows et cols requis');
  if (!Array.isArray(l.pieces) || !l.pieces.length) { fail(file, 'pieces requis'); continue; }

  const layers = {};
  for (const [i, p] of l.pieces.entries()) {
    const at = `pièce #${i}`;
    if (!known.has(p.tech)) fail(file, `${at}: techno inconnue « ${p.tech} »`);
    if (![p.col, p.row, p.w, p.h].every(Number.isInteger) || p.w < 1 || p.h < 1) { fail(file, `${at}: col/row/w/h invalides`); continue; }
    if (p.col < 0 || p.row < 0 || p.col + p.w > l.cols || p.row + p.h > l.rows) { fail(file, `${at}: hors de la grille`); continue; }
    const layer = p.layer || 0;
    if (layer !== 0 && layer !== 1) fail(file, `${at}: deux rangées au plus (layer 0 ou 1), trouvé ${layer}`);
    const grid = (layers[layer] = layers[layer] || Array.from({ length: l.rows }, () => Array(l.cols).fill(false)));
    for (let r = p.row; r < p.row + p.h; r++) for (let c = p.col; c < p.col + p.w; c++) {
      if (grid[r][c]) fail(file, `${at}: chevauchement en (${r},${c}) rangée ${layer}`);
      grid[r][c] = true;
    }
  }
  for (const [layer, grid] of Object.entries(layers)) {
    for (let r = 0; r < l.rows - 1; r++) for (let c = 0; c < l.cols; c++) {
      if (grid[r][c] && !grid[r + 1][c]) fail(file, `cube suspendu en (${r},${c}) rangée ${layer} : rien en dessous`);
    }
  }
}

if (errors) { console.error(`\n${errors} erreur(s)`); process.exit(1); }
console.log(`✓ ${index.levels.length} niveaux valides`);
