// Couche de sauvegarde. Quatre moteurs, mêmes données (players / progress) :
//  0. Firebase (connexion Google, ou compte anonyme pour l'invité, + Firestore) : progression dans le cloud et classement général
//     (si js/firebase-config.js est renseigné)
//  1. Tauri (APK, desktop) : vraie base SQLite locale via tauri-plugin-sql
//  2. Web : API SQLite du serveur de test (server/server.js)
//  3. Repli : localStorage si rien d'autre n'est disponible
const Storage = (() => {
  const KEY = 'pb_local_players';
  const tauri = window.__TAURI__ && window.__TAURI__.core ? window.__TAURI__.core : null;
  let player = null; // { id, name, progress: [{level,bestScore,attempts,completed}], offline }

  // ---------- 0. Firebase (Firestore) ----------
  //  players/{uid}            : { name, totalScore, levelsDone, createdAt, updatedAt }
  //  players/{uid}/progress/{niveau} : { level, bestScore, attempts, completed, updatedAt }
  const FB_CONFIG = tauri ? null : (window.PB_FIREBASE || null);      // l'appli Tauri garde sa base SQLite locale
  const FB_VERSION = '10.14.1', APP_VERSION = 'v0.1.0', AVATAR_COUNT = 15;      // AVATAR_COUNT : nombre de portraits (assets/avatars)
  let fbReady = null;
  function openFb() {
    if (!fbReady) {
      fbReady = (async () => {
        const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
        const [app, auth, fs] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
        const a = app.initializeApp(FB_CONFIG), au = auth.getAuth(a), db = fs.getFirestore(a);
        await au.authStateReady();
        return { fs, db, auth, au, get uid() { return au.currentUser && au.currentUser.uid; } };
      })().catch((e) => { fbReady = null; throw e; });
    }
    return fbReady;
  }
  async function fbProgress(f) {
    const snap = await f.fs.getDocs(f.fs.collection(f.db, 'players', f.uid, 'progress'));
    return snap.docs.map((d) => { const r = d.data(); return { level: r.level, bestScore: r.bestScore || 0, stars: r.stars || 0, attempts: r.attempts || 0, completed: r.completed ? 1 : 0 }; }).sort((x, y) => x.level - y.level);
  }
  // écrit un résultat (transaction : la ligne du niveau, les totaux publics et le profil privé restent cohérents)
  async function fbWrite(f, level, score, won, attempts, extra = {}) {
    const { fs, db, uid } = f, pRef = fs.doc(db, 'players', uid), gRef = fs.doc(db, 'players', uid, 'progress', String(level)), vRef = fs.doc(db, 'players', uid, 'private', 'profile');
    await fs.runTransaction(db, async (tx) => {
      const [p, g, v] = await Promise.all([tx.get(pRef), tx.get(gRef), tx.get(vRef)]);
      const old = g.exists() ? g.data() : { bestScore: 0, stars: 0, ballsLeft: 0, attempts: 0, wins: 0, completed: 0 };
      const best = Math.max(old.bestScore || 0, won ? Math.max(0, score | 0) : 0), done = old.completed || won ? 1 : 0;
      const stars = Math.max(old.stars || 0, won ? Math.min(3, extra.stars | 0) : 0), ballsLeft = Math.max(old.ballsLeft || 0, won ? Math.max(0, extra.ballsLeft | 0) : 0);
      tx.set(gRef, { level, bestScore: best, stars, ballsLeft, attempts: (old.attempts || 0) + attempts, wins: (old.wins || 0) + (won && attempts ? 1 : 0), completed: done, updatedAt: fs.serverTimestamp() });
      const pd = p.data() || {};
      tx.update(pRef, {
        totalScore: (pd.totalScore || 0) + (best - (old.bestScore || 0)),
        levelsDone: (pd.levelsDone || 0) + (done && !old.completed ? 1 : 0),
        maxLevel: Math.max(pd.maxLevel || 0, done ? level : 0),
        totalStars: (pd.totalStars || 0) + (stars - (old.stars || 0)),
        updatedAt: fs.serverTimestamp(),
      });
      if (attempts) {                       // statistiques privées (visibles par le joueur seul)
        const vd = v.exists() ? v.data() : {};
        tx.set(vRef, { plays: (vd.plays || 0) + attempts, wins: (vd.wins || 0) + (won ? 1 : 0), losses: (vd.losses || 0) + (won ? 0 : 1), lastLevel: level, lastPlayedAt: fs.serverTimestamp() }, { merge: true });
      }
    });
  }
  // utilisateur connecté (session conservée par Firebase) ou null. Un invité a un compte anonyme (anon: true).
  async function cloudUser() {
    if (!FB_CONFIG) return null;
    try { const f = await openFb(), u = f.au.currentUser; return u ? { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '', anon: u.isAnonymous } : null; } catch (e) { return null; }
  }
  // Connexion Google. Un invité (compte anonyme) est RELIÉ au compte Google : même identifiant, pseudo, scores et classement gardés.
  // Si ce compte Google existe déjà, la progression de l'invité est mise de côté sur l'appareil puis reprise dans ce compte (voir fbPlayer).
  async function googleSignIn() {
    const f = await openFb(), provider = new f.auth.GoogleAuthProvider(), cur = f.au.currentUser;
    provider.setCustomParameters({ prompt: 'select_account' });
    const redirectOnly = (e) => e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment');
    if (cur && cur.isAnonymous) {
      try { await f.auth.linkWithPopup(cur, provider); return cloudUser(); }
      catch (e) {
        if (redirectOnly(e)) { await f.auth.linkWithRedirect(cur, provider); return null; }
        if (!e || (e.code !== 'auth/credential-already-in-use' && e.code !== 'auth/email-already-in-use')) throw e;
        const cred = f.auth.GoogleAuthProvider.credentialFromError(e);
        if (!cred) throw e;
        await stashGuest(f);
        await f.auth.signInWithCredential(f.au, cred);
        return cloudUser();
      }
    }
    try { await f.auth.signInWithPopup(f.au, provider); }
    catch (e) {
      if (redirectOnly(e)) { await f.auth.signInWithRedirect(f.au, provider); return null; }
      throw e;
    }
    return cloudUser();
  }
  // l'invité rejoint un compte Google existant : sa progression passe par la sauvegarde locale, son entrée quitte le classement
  async function stashGuest(f) {
    const name = (player && player.name) || lastNameOf(), key = name.toLowerCase(), db = readLocal();
    const rec = db[key] || { id: 0, name, progress: [] };
    for (const r of await fbProgress(f)) {
      const c = rec.progress.find((x) => x.level === r.level);
      if (!c) rec.progress.push({ level: r.level, bestScore: r.bestScore, attempts: r.attempts, completed: r.completed });
      else { c.bestScore = Math.max(c.bestScore, r.bestScore); c.completed = c.completed || r.completed; }
    }
    db[key] = rec; writeLocal(db);
    try { await f.fs.deleteDoc(f.fs.doc(f.db, 'players', f.uid)); } catch (e) { console.warn('Entrée invitée non retirée du classement', e); }
  }
  const lastNameOf = () => { try { return localStorage.getItem('pb_last_name') || 'Joueur'; } catch (e) { return 'Joueur'; } };
  async function cloudSignOut() { try { const f = await openFb(); await f.au.signOut(); } catch (e) { /* ignore */ } player = null; }

  async function fbPlayer(wanted, mergeFrom) {
    const f = await openFb();
    if (!f.uid) throw new Error('non connecté');
    const g = f.au.currentUser, ref = f.fs.doc(f.db, 'players', f.uid), snap = await f.fs.getDoc(ref);
    const first = ((g.displayName || '').trim().split(/\s+/)[0] || 'Joueur').slice(0, 20);
    const name = (wanted || (snap.exists() && snap.data().name) || first).slice(0, 20);
    // avatar : celui déjà enregistré, sinon celui choisi sur l'appareil, sinon un avatar par défaut (stable, tiré de l'identifiant du compte)
    let avatar = snap.exists() && Number.isInteger(snap.data().avatar) ? snap.data().avatar : undefined;
    const hadAvatar = avatar !== undefined;
    if (!hadAvatar) {
      let local = NaN; try { local = parseInt(localStorage.getItem('pb_avatar_' + name.toLowerCase()), 10); } catch (e) { /* ignore */ }
      avatar = Number.isInteger(local) && local >= 0 ? local : [...f.uid].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) % AVATAR_COUNT;
    }
    if (!snap.exists()) await f.fs.setDoc(ref, { name, avatar, totalScore: 0, levelsDone: 0, maxLevel: 0, totalStars: 0, createdAt: f.fs.serverTimestamp(), updatedAt: f.fs.serverTimestamp() });
    else if (snap.data().name !== name || !hadAvatar) await f.fs.updateDoc(ref, { name, avatar, updatedAt: f.fs.serverTimestamp() });
    // profil privé : informations du compte et de l'appareil (lisibles par le joueur seul)
    const vRef = f.fs.doc(f.db, 'players', f.uid, 'private', 'profile'), vSnap = await f.fs.getDoc(vRef), vd = vSnap.exists() ? vSnap.data() : {};
    const info = {
      email: g.email || '', displayName: g.displayName || '', photoURL: g.photoURL || '',
      locale: (navigator.language || '').slice(0, 12), timezone: (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 40),
      platform: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop', userAgent: (navigator.userAgent || '').slice(0, 200),
      screen: `${screen.width}x${screen.height}`, appVersion: APP_VERSION, installed: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches),
      logins: (vd.logins || 0) + 1, lastLoginAt: f.fs.serverTimestamp(),
    };
    if (!vSnap.exists()) info.firstLoginAt = f.fs.serverTimestamp();
    await f.fs.setDoc(vRef, info, { merge: true });
    const settings = vd.settings || null;
    let progress = await fbProgress(f);
    // reprise de la progression déjà jouée sur cet appareil (hors ligne / ancienne version) : on garde le meilleur
    const local = readLocal()[(mergeFrom || name).toLowerCase()];
    if (local && local.progress && local.progress.length) {
      let changed = false;
      for (const r of local.progress) {
        const c = progress.find((x) => x.level === r.level);
        if (!c || r.bestScore > c.bestScore || (r.completed && !c.completed)) { await fbWrite(f, r.level, r.bestScore, !!r.completed, c ? 0 : r.attempts || 0); changed = true; }
      }
      if (changed) progress = await fbProgress(f);
    }
    return { id: f.uid, name, avatar, settings, progress, offline: false, cloud: true, anon: !!g.isAnonymous };
  }
  async function fbSave(level, score, won, extra) {
    const f = await openFb();
    await fbWrite(f, level, score, won, 1, extra);
    return { ...player, progress: await fbProgress(f), offline: false, cloud: true };
  }
  // avatar (public) et réglages (privés) du joueur connecté
  async function syncProfile(part) {
    if (!player || !player.cloud) return;
    try {
      const f = await openFb(), { fs } = f;
      if (Number.isInteger(part.avatar)) { player.avatar = part.avatar; await fs.updateDoc(fs.doc(f.db, 'players', f.uid), { avatar: part.avatar, updatedAt: fs.serverTimestamp() }); }
      if (part.settings) { player.settings = part.settings; await fs.setDoc(fs.doc(f.db, 'players', f.uid, 'private', 'profile'), { settings: part.settings }, { merge: true }); }
    } catch (e) { console.warn('Synchronisation du profil impossible', e); }
  }
  async function fbLeaderboard(max = 50) {
    const f = await openFb(), { fs } = f;
    const snap = await fs.getDocs(fs.query(fs.collection(f.db, 'players'), fs.orderBy('totalScore', 'desc'), fs.limit(max)));
    return snap.docs.map((d) => { const r = d.data(); return { name: r.name, avatar: Number.isInteger(r.avatar) ? r.avatar : null, total: r.totalScore || 0, levels: r.levelsDone || 0, me: d.id === f.uid }; }).filter((r) => r.total > 0);
  }

  // ---------- 1. SQLite natif (Tauri) ----------
  const DB = 'sqlite:princess-buster.db';
  let dbReady = null;
  const exec = (query, values = []) => tauri.invoke('plugin:sql|execute', { db: DB, query, values });
  const select = (query, values = []) => tauri.invoke('plugin:sql|select', { db: DB, query, values });

  function openDb() {
    if (!dbReady) {
      dbReady = (async () => {
        await tauri.invoke('plugin:sql|load', { db: DB });
        await exec(`CREATE TABLE IF NOT EXISTS players (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        await exec(`CREATE TABLE IF NOT EXISTS progress (
          player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
          level INTEGER NOT NULL,
          best_score INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          completed INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (player_id, level))`);
      })().catch((e) => { dbReady = null; throw e; });
    }
    return dbReady;
  }

  async function sqlPlayer(name) {
    await openDb();
    await exec('INSERT OR IGNORE INTO players (name) VALUES ($1)', [name]);
    const [row] = await select('SELECT id, name FROM players WHERE name = $1', [name]);
    await exec('UPDATE players SET last_played_at = CURRENT_TIMESTAMP WHERE id = $1', [row.id]);
    return sqlProgress(row);
  }
  async function sqlProgress(row) {
    const progress = await select('SELECT level, best_score AS bestScore, attempts, completed FROM progress WHERE player_id = $1 ORDER BY level', [row.id]);
    return { id: row.id, name: row.name, progress, offline: false };
  }
  async function sqlSave(level, score, won) {
    await openDb();
    await exec(`INSERT INTO progress (player_id, level, best_score, attempts, completed) VALUES ($1, $2, $3, 1, $4)
      ON CONFLICT(player_id, level) DO UPDATE SET
        best_score = MAX(best_score, excluded.best_score),
        attempts = attempts + 1,
        completed = MAX(completed, excluded.completed),
        updated_at = CURRENT_TIMESTAMP`, [player.id, level, won ? Math.max(0, score | 0) : 0, won ? 1 : 0]);
    return sqlProgress({ id: player.id, name: player.name });
  }
  async function sqlLeaderboard() {
    await openDb();
    return select(`SELECT p.name, SUM(g.best_score) AS total, SUM(g.completed) AS levels
      FROM progress g JOIN players p ON p.id = g.player_id
      GROUP BY p.id ORDER BY total DESC, levels DESC LIMIT 10`);
  }

  // ---------- 2. API web ----------
  async function api(path, body) {
    const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    if (!res.ok) throw new Error('API ' + res.status);
    return res.json();
  }

  // ---------- 3. localStorage ----------
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const writeLocal = (db) => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* ignore */ } };

  async function login(name, mergeFrom) {
    if (FB_CONFIG) {
      try {
        const f = await openFb();
        // invité : un compte anonyme Firebase, il figure au classement sous son pseudo (relié plus tard à Google, voir googleSignIn)
        if (!f.uid && name) await f.auth.signInAnonymously(f.au);
        player = await fbPlayer(name, mergeFrom);
      } catch (e) { if (!name) throw e; console.warn('Firebase indisponible, repli', e); }
    }
    if (player && player.cloud) { /* connecté au cloud */ }
    else if (tauri) {
      try { player = await sqlPlayer(name); } catch (e) { console.warn('SQLite indisponible, repli localStorage', e); }
    } else {
      try { player = await api('/api/player', { name }); player.offline = false; } catch (e) { /* repli ci-dessous */ }
    }
    if (!player) {
      const db = readLocal();
      const key = name.toLowerCase();
      db[key] = db[key] || { id: 0, name, progress: [] };
      writeLocal(db);
      player = { ...db[key], offline: true };
    }
    try { localStorage.setItem('pb_last_name', player.name); } catch (e) { /* ignore */ }
    return player;
  }

  // Changer de nom : avec un compte, c'est le même profil renommé (une seule écriture), l'écran est mis à jour tout de suite
  async function rename(name) {
    if (!player || !player.cloud) return login(name);
    const old = player.name;
    player = { ...player, name };
    try { localStorage.setItem('pb_last_name', name); } catch (e) { /* ignore */ }
    try {
      const f = await openFb();
      await Promise.race([f.fs.updateDoc(f.fs.doc(f.db, 'players', f.uid), { name, updatedAt: f.fs.serverTimestamp() }), new Promise((_, no) => setTimeout(() => no(new Error('délai dépassé')), 8000))]);
    } catch (e) { player = { ...player, name: old }; try { localStorage.setItem('pb_last_name', old); } catch (e2) { /* ignore */ } throw e; }
    return player;
  }

  async function saveResult(level, score, won, extra) {
    if (!player) return;
    if (!player.offline) {
      try {
        const p = player.cloud ? await fbSave(level, score, won, extra) : tauri ? await sqlSave(level, score, won) : await api('/api/progress', { playerId: player.id, level, score, won });
        player = { ...p, offline: false };
        return player;
      } catch (e) { player.offline = true; }
    }
    const db = readLocal();
    const key = player.name.toLowerCase();
    const rec = db[key] || { id: 0, name: player.name, progress: [] };
    let row = rec.progress.find((r) => r.level === level);
    if (!row) { row = { level, bestScore: 0, attempts: 0, completed: 0 }; rec.progress.push(row); }
    row.attempts++;
    if (won) { row.bestScore = Math.max(row.bestScore, score); row.completed = 1; }
    db[key] = rec; writeLocal(db);
    player = { ...rec, offline: true };
    return player;
  }

  // Sans serveur (hébergement statique) : classement des joueurs de CET appareil
  function localLeaderboard() {
    return Object.values(readLocal()).map((r) => ({ name: r.name, total: r.progress.reduce((s, p) => s + p.bestScore, 0), levels: r.progress.filter((p) => p.completed).length }))
      .sort((a, b) => b.total - a.total || b.levels - a.levels).slice(0, 10);
  }
  async function leaderboard(max = 50) {
    if (FB_CONFIG) { try { return await fbLeaderboard(max); } catch (e) { console.warn('Classement Firebase indisponible', e); } }
    try { return tauri ? await sqlLeaderboard() : await api('/api/leaderboard'); } catch (e) { return localLeaderboard(); }
  }

  return {
    login, rename, saveResult, leaderboard, cloudUser, googleSignIn, cloudSignOut, syncProfile,
    get cloudEnabled() { return !!FB_CONFIG; },
    get player() { return player; },
    lastName() { try { return localStorage.getItem('pb_last_name') || ''; } catch (e) { return ''; } },
    progressOf(level) { return (player && player.progress.find((r) => r.level === level)) || null; },
    isUnlocked(level) { return level === 1 || !!this.progressOf(level - 1)?.completed; },
    totalScore() { return player ? player.progress.reduce((s, r) => s + r.bestScore, 0) : 0; },
  };
})();
