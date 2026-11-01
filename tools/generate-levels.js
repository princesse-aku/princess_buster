// Génère public/levels/levelNNN.json (250 niveaux) + index.json  (node tools/generate-levels.js)
// Les niveaux sont ensuite éditables à la main : ce sont de simples fichiers JSON.
const fs = require('fs');
const path = require('path');

const TOTAL = 250;

const TECHS = [
  ['html5', 'HTML5', '#e44d26'], ['css3', 'CSS3', '#2965f1'], ['sass', 'Sass', '#cc6699'], ['bootstrap', 'Bootstrap', '#7952b3'],
  ['javascript', 'JavaScript', '#f7df1e'], ['typescript', 'TypeScript', '#3178c6'], ['jquery', 'jQuery', '#0769ad'], ['tailwindcss', 'Tailwind CSS', '#38bdf8'],
  ['php', 'PHP', '#777bb4'], ['laravel', 'Laravel', '#ff2d20'], ['nodejs', 'Node.js', '#6cc24a'], ['express', 'Express', '#9ca3af'],
  ['react', 'React', '#61dafb'], ['vuejs', 'Vue.js', '#42b883'], ['angular', 'Angular', '#dd0031'], ['python', 'Python', '#3776ab'],
  ['django', 'Django', '#44b78b'], ['mysql', 'MySQL', '#f29111'], ['mongodb', 'MongoDB', '#47a248'], ['docker', 'Docker', '#2496ed'],
  ['git', 'Git', '#f05032'],
  // technologies débloquées ensuite, dans l'ordre, une par palier de 5 niveaux
  ['go', 'Go', '#00add8'], ['rust', 'Rust', '#ce412b'], ['kotlin', 'Kotlin', '#7f52ff'], ['swift', 'Swift', '#f05138'],
  ['java', 'Java', '#e76f00'], ['csharp', 'C#', '#68217a'], ['cplusplus', 'C++', '#00599c'], ['ruby', 'Ruby', '#cc342d'],
  ['flutter', 'Flutter', '#02569b'], ['dart', 'Dart', '#0175c2'], ['nextjs', 'Next.js', '#6b7280'], ['svelte', 'Svelte', '#ff3e00'],
  ['redis', 'Redis', '#dc382d'], ['postgresql', 'PostgreSQL', '#336791'], ['graphql', 'GraphQL', '#e10098'], ['kubernetes', 'Kubernetes', '#326ce5'],
  ['firebase', 'Firebase', '#ffca28'], ['nginx', 'Nginx', '#009639'], ['bash', 'Bash', '#4eaa25'],
  // intelligences artificielles (dernières technologies débloquées)
  ['openai', 'ChatGPT', '#10a37f'], ['claude', 'Claude', '#d97757'], ['gemini', 'Gemini', '#4285f4'], ['grok', 'Grok', '#3b3b4f'],
  ['mistral', 'Mistral AI', '#fa520f'], ['perplexity', 'Perplexity', '#20808d'], ['huggingface', 'Hugging Face', '#ffb000'],
  ['copilot', 'GitHub Copilot', '#6e40c9'], ['ollama', 'Ollama', '#4b5563'], ['llama', 'Llama', '#0866ff'],
].map(([key, name, color]) => ({ key, name, color }));

// Une nouvelle technologie est débloquée tous les 5 niveaux (récompense du coffre) :
// les niveaux d'un palier n'utilisent que les technologies déjà débloquées.
// On démarre avec HTML5 + CSS3 uniquement, puis JavaScript (niveau 6), PHP (niveau 11), etc. dans l'ordre ci-dessous.
// 2 au départ + 48 déblocages (niveaux 5 à 240) = les 50 technologies jouables à partir du niveau 241.
const ORDER = ['html5', 'css3', 'javascript', 'php', 'sass', 'bootstrap', 'typescript', 'jquery', 'tailwindcss', 'laravel', 'nodejs', 'express',
  'react', 'vuejs', 'angular', 'python', 'django', 'mysql', 'mongodb', 'docker', 'git',
  'openai', 'claude', 'gemini', 'grok', 'mistral', 'perplexity', 'huggingface', 'copilot', 'ollama', 'llama',
  'go', 'rust', 'kotlin', 'swift', 'java', 'csharp', 'cplusplus', 'ruby', 'flutter', 'dart',
  'nextjs', 'svelte', 'redis', 'postgresql', 'graphql', 'kubernetes', 'firebase', 'nginx', 'bash'];
TECHS.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
const START_TECHS = 2, BLOCK = 5;

// Fonds (définis dans public/js/game.js) : un thème différent d'un niveau au suivant
const THEMES = ['meadow', 'night', 'sunset', 'snow', 'desert', 'ocean', 'candy', 'forest', 'space', 'autumn', 'volcano', 'neon'];

// --- formes : hauteurs de colonnes -> masque (rangées du haut vers le bas, 'x' = cube) ---
const fromHeights = (hs, h) => Array.from({ length: h }, (_, r) => hs.map((c) => (h - r <= c ? 'x' : '.')).join(''));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const shapes = {
  wall: (w, h) => fromHeights(Array(w).fill(h), h),
  pyramid: (w) => {
    const rows = [];
    for (let n = w % 2 ? 1 : 2; n <= w; n += 2) rows.push('x'.repeat(n).padStart((w + n) / 2, '.').padEnd(w, '.'));
    return rows;
  },
  stairs: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => Math.min(h, c + 1)), h),
  columns: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c % 2 === 0 ? h : 0)), h),
  checker: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c % 2 ? Math.ceil(h / 2) : h)), h),
  arch: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c === 0 || c === w - 1 ? h : Math.ceil(h / 3))), h),
  tower: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c === Math.floor((w - 1) / 2) ? h : 0)), h),
  tower2: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (Math.abs(c - (w - 1) / 2) < 1 ? h : 0)), h),
  letterH: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c === 0 || c === w - 1 ? h : Math.ceil(h / 2))), h),
  diamond: (w) => {
    const half = Math.ceil(w / 2), rows = [];
    for (let i = 1; i <= half; i++) { const n = i * 2 - 1; rows.push('x'.repeat(n).padStart(((w + n) / 2) | 0, '.').padEnd(w, '.')); }
    return rows;
  },
  twin: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c === Math.floor((w - 1) / 2) ? 0 : h)), h),
  cross: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c === Math.floor(w / 2) ? h : Math.ceil(h / 2))), h),
  ziggurat: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => clamp(Math.ceil(Math.min(c + 1, w - c) * (h / Math.ceil(w / 2))), 1, h)), h),
  valley: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => clamp(1 + Math.round((h - 1) * Math.abs(c - (w - 1) / 2) / ((w - 1) / 2 || 1)), 1, h)), h),
  sawtooth: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c % 2 ? Math.ceil(h / 2) : h)), h),
  fortress: (w, h) => fromHeights(Array.from({ length: w }, (_, c) => (c === 0 || c === w - 1 ? h : c % 2 ? Math.ceil(h * 0.6) : Math.ceil(h * 0.4))), h),
  islands: (w, h, rand) => fromHeights(Array.from({ length: w }, (_, c) => (c % 3 === 2 ? 0 : 1 + Math.floor(rand() * h))), h),
  skyline: (w, h, rand) => {
    const hs = []; let cur = Math.ceil(h / 2);
    for (let c = 0; c < w; c++) { cur = clamp(cur + Math.floor(rand() * 3) - 1, 1, h); hs.push(cur); }
    hs[Math.floor(rand() * w)] = h;
    return fromHeights(hs, h);
  },
};
const SHAPE_NAMES = Object.keys(shapes);

// niveaux 1..20 : plan d'origine, soigneusement calibré
const PLAN = [
  ['wall', 3, 3], ['pyramid', 5, 3], ['wall', 4, 4], ['columns', 5, 4], ['stairs', 5, 5],
  ['tower', 5, 6], ['arch', 5, 4], ['pyramid', 7, 4], ['checker', 6, 5], ['twin', 7, 4],
  ['letterH', 5, 5], ['diamond', 7, 4], ['tower2', 6, 6], ['wall', 6, 5], ['cross', 7, 5],
  ['columns', 7, 5], ['arch', 7, 6], ['checker', 7, 6], ['pyramid', 7, 6], ['wall', 7, 6],
];

// pseudo-aléatoire déterministe
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// Aucun cube suspendu : chaque cube repose sur un cube (ou sur la table). Chaque colonne retombe vers le bas.
function dropToSupport(rows) {
  const cols = Math.max(...rows.map((r) => r.length));
  const out = rows.map(() => Array(cols).fill('.'));
  for (let c = 0; c < cols; c++) {
    let put = rows.length - 1;
    for (let r = rows.length - 1; r >= 0; r--) if (rows[r][c] === 'x') out[put--][c] = 'x';
  }
  return out.map((r) => r.join(''));
}

// Remplit le masque avec des pièces de formats variés [largeur, hauteur, poids de tirage].
// On remplit de bas en haut : chaque pièce repose donc entièrement sur d'autres pièces ou sur la table.
function allowedSizes(id) {
  const sizes = [[1, 1, 4]];
  if (id >= 2) sizes.push([2, 1, 2]);
  if (id >= 4) sizes.push([1, 2, 2]);
  if (id >= 7) sizes.push([2, 2, 1.5]);
  if (id >= 10) sizes.push([3, 1, 1.5]);
  if (id >= 14) sizes.push([3, 2, 1]);
  return sizes;
}

function fillPieces(mask, id, rand) {
  const R = mask.length, C = Math.max(...mask.map((r) => r.length));
  const free = mask.map((r) => Array.from({ length: C }, (_, c) => r[c] === 'x'));
  const sizes = allowedSizes(id), pieces = [];
  for (let r = R - 1; r >= 0; r--) {
    for (let c = 0; c < C;) {
      if (!free[r][c]) { c++; continue; }
      const fits = ([w, h]) => {
        if (c + w > C || r - h + 1 < 0) return false;
        for (let y = r - h + 1; y <= r; y++) for (let x = c; x < c + w; x++) if (!free[y][x]) return false;
        return true;
      };
      const cand = sizes.filter(fits);
      let pick = rand() * cand.reduce((t, s2) => t + s2[2], 0), size = cand[0];
      for (const s2 of cand) { pick -= s2[2]; if (pick <= 0) { size = s2; break; } }
      const [w, h] = size;
      for (let y = r - h + 1; y <= r; y++) for (let x = c; x < c + w; x++) free[y][x] = false;
      pieces.push({ col: c, row: r - h + 1, w, h });
      c += w;
    }
  }
  return pieces;
}

// JSON lisible : une pièce par ligne
function formatLevel(l) {
  const { pieces, ...rest } = l;
  const head = JSON.stringify(rest, null, 2).slice(0, -2);
  return head + ',\n  "pieces": [\n' + pieces.map((p) => '    ' + JSON.stringify(p)).join(',\n') + '\n  ]\n}\n';
}

const outDir = path.join(__dirname, '..', 'public', 'levels');
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (/^level\d+\.json$/.test(f)) fs.unlinkSync(path.join(outDir, f));
const index = [];

const DENSE = SHAPE_NAMES.filter((n) => !['tower', 'tower2', 'islands'].includes(n));

for (let id = 1; id <= TOTAL; id++) {
  let level, shape, w, h, back, pieces, balls, theme, pool, newTech;
  for (let attempt = 0; attempt < 14; attempt++) {
  const rand = rng(id * 7919 + attempt * 104729);
  const block = Math.floor((id - 1) / BLOCK), poolSize = Math.min(TECHS.length, START_TECHS + block);
  pool = TECHS.slice(0, poolSize).map((t) => t.key);
  // récompense du coffre (dernier niveau du palier) : la prochaine technologie à débloquer
  newTech = id % BLOCK === 0 && id < TOTAL && poolSize < TECHS.length ? TECHS[poolSize].key : null;
  const focus = pool[pool.length - 1];                    // la dernière débloquée revient souvent

  // forme et taille
  if (id <= PLAN.length) [shape, w, h] = PLAN[id - 1];
  else {
    shape = DENSE[(id * 7 + Math.floor(rand() * 5) + attempt) % DENSE.length];
    w = clamp(Math.round(4 + id / 30 + (rand() * 2 - 1)), 4, 9);
    h = clamp(Math.round(3.5 + id / 28 + (rand() * 2 - 1)), 4, 8);
  }
  const mask = dropToSupport(shapes[shape](w, h, rand));
  const cols = Math.max(...mask.map((r) => r.length));
  const pick = () => (rand() < 0.3 ? focus : pool[Math.floor(rand() * pool.length)]);

  // rangée devant (layer 0)
  const front = fillPieces(mask, id, rand).map((p) => ({ tech: pick(), layer: 0, ...p }));
  let rowsTotal = mask.length;
  const heights = Array.from({ length: cols }, (_, c) => mask.filter((r) => r[c] === 'x').length);

  // rangées DERRIÈRE : des pièces cachées derrière les premières (il faut les faire tomber d'abord)
  back = [];
  const addLayer = (layer, share, maxHeights) => {
    const bh = maxHeights.map((hh) => (hh > 0 && rand() < share ? hh : 0));
    if (!bh.some(Boolean)) return bh;
    rowsTotal = Math.max(rowsTotal, ...bh);
    const bmask = Array.from({ length: rowsTotal }, (_, r) => Array.from({ length: cols }, (_, c) => (rowsTotal - r <= bh[c] ? 'x' : '.')).join(''));
    back.push(...fillPieces(bmask, id, rand).map((p) => ({ tech: pick(), layer, ...p })));
    return bh;
  };
  // UNE seule rangée cachée derrière la première (jamais plus de 2), et seulement sur certains niveaux (environ 6 sur 10 à partir du niveau 6)
  if (id >= 6 && (id * 7) % 10 < 6) addLayer(1, id < 12 ? 0.5 : id < 25 ? 0.75 : 1, heights);
  front.forEach((p) => { p.row += rowsTotal - mask.length; });

  pieces = [...front, ...back];
  pieces.sort((a, b) => a.layer - b.layer || a.row - b.row || a.col - b.col);
  // Une balle ne fait tomber que la pièce visée. Distance parcourue par coup = 14 x 0,8 / (masse x 0,06) avec
  // masse = racine(surface) x poids ; profondeur à franchir = 110 - 45 x rangée.
  const weight = +Math.min(2.0, 1 + id * 0.03).toFixed(2);
  const hits = pieces.reduce((t, p) => t + Math.max(1, Math.ceil((110 - 45 * p.layer) / (186.7 / (Math.sqrt(p.w * p.h) * weight)))), 0);
  const mass = hits;
  // marge de balles : serrée au début (le joueur est bon), plus généreuse quand 3 rangées de profondeur s'empilent
  const ratio = id <= 60 ? 1.05 - id * 0.0012 : id <= 100 ? 1.02 : 1.02 + (id - 100) * 0.0008;
  // une balle fait tomber une pièce ; l'effondrement en fait tomber d'autres, la marge se resserre donc au fil des niveaux
  const hasBack = back.length > 0;   // même calcul que ballsFor() dans public/js/game.js
  balls = Math.max(5, Math.min(Math.round(hits * ratio) + 2, Math.ceil(pieces.length * Math.max(hasBack ? 0.6 : 0.85, 1.15 - id * (hasBack ? 0.0025 : 0.0015))) + 3));
  theme = THEMES[(id - 1) % THEMES.length];
  // la difficulté (quantité de pièces) doit augmenter avec le niveau : on retire les tirages trop légers
  if (id > PLAN.length && mass < clamp(14 + id * 0.45, 14, 100) && attempt < 13) continue;

  level = {
    id,
    name: `Niveau ${id}`,
    theme,
    block,
    reward: newTech,
    balls,
    cubeWeight: weight,
    techs: pool,
    rows: rowsTotal,
    cols,
    pieces,
  };
  break;
  }
  const file = `level${String(id).padStart(3, '0')}.json`;
  fs.writeFileSync(path.join(outDir, file), formatLevel(level));
  index.push({ id, file, theme, reward: newTech, icon: pool[(id * 5) % pool.length] });
  if (id <= 20 || id % 20 === 0) console.log(`niveau ${id}: ${shape} ${w}x${h} ${theme} pièces=${pieces.length} (derrière ${back.length}) balles=${balls}`);
}

fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify({ startTechs: START_TECHS, blockSize: BLOCK, techs: TECHS, themes: THEMES, levels: index }, null, 1));
console.log(`${TOTAL} niveaux générés`);
