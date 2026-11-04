# Déployer Princess Buster sur Vercel

Le jeu est un **site statique** : tout est dans le dossier `public/`. Vercel le sert tel quel (CDN mondial, HTTPS, déploiement automatique à chaque `git push`). Aucun serveur Node n'est nécessaire.

## Ce qui est déjà prêt dans le dépôt

| Fichier | Rôle |
| --- | --- |
| `vercel.json` | Sert `public/` (aucune installation, aucune compilation), en-têtes de sécurité et de cache |
| `.vercelignore` | N'envoie pas `src-tauri/`, `server/`, `docs/`, `tools/`… (inutiles pour le site) |
| `public/manifest.webmanifest` | Permet d'**installer le jeu comme une application** (Ajouter à l'écran d'accueil), en plein écran |
| `public/assets/og.jpg` + balises `<meta>` | Aperçu quand on partage le lien (WhatsApp, X, Discord…) |

## Ce que ça change côté sauvegarde

Vercel n'a **pas de disque persistant** : le serveur de test (`server/server.js`, SQLite) n'y tourne pas. Sur Vercel, le jeu utilise donc automatiquement le repli **`localStorage`** : profil, avatar, scores et progression sont gardés **sur l'appareil du joueur** (et le classement ne montre que les joueurs de cet appareil). C'est le même mécanisme que l'application hors-ligne.

> Besoin d'un classement partagé entre tous les joueurs ? Il faudra une base distante (par exemple [Turso](https://turso.tech), du SQLite hébergé, ou Vercel Postgres) et une petite API dans un dossier `api/`. Dis-le moi et je la prépare ; le jeu est déjà structuré pour ça (`public/js/storage.js`).

## Méthode 1 — depuis le site de Vercel (recommandée, 3 minutes)

1. Va sur <https://vercel.com/signup> et connecte-toi avec **GitHub** (compte `princesse-aku`).
2. **Add New… → Project**, puis **Import** le dépôt `princesse-aku/princess_buster` (autorise l'application GitHub de Vercel sur ce dépôt si on te le demande).
3. Sur l'écran de configuration :
   - **Framework Preset** : `Other` (déjà détecté grâce à `vercel.json`)
   - **Root Directory** : `./` (par défaut)
   - **Build / Install / Output** : laisse tel quel, ils viennent de `vercel.json` (`outputDirectory: public`)
   - **Environment Variables** : aucune
4. Clique **Deploy**. Après ~30 secondes tu obtiens une adresse du type `https://princess-buster.vercel.app`.

À partir de là :
- chaque **push sur `main`** redéploie le site en production ;
- chaque **pull request** reçoit une **URL de prévisualisation** automatique ;
- tu peux ajouter ton propre nom de domaine dans **Settings → Domains**.

## Méthode 2 — en ligne de commande

```bash
npx vercel login          # ouvre le navigateur pour te connecter
npx vercel                # premier déploiement (réponds aux questions : lier au projet, dossier ./ )
npx vercel --prod         # déploiement en production
```

Pour tester en local exactement comme sur Vercel : `npx vercel dev`.

## Après le premier déploiement

1. **Teste** l'adresse sur ton téléphone : l'écran d'accueil, un niveau, le plein écran, la rotation portrait/paysage.
2. **SEO et aperçu de partage** : `public/index.html`, `public/robots.txt` et `public/sitemap.xml` utilisent l'adresse `https://princess-buster.vercel.app`. Si ton adresse est différente, remplace-la partout (recherche `princess-buster.vercel.app`) puis `git push`. L'image d'aperçu est `public/assets/og.jpg` (1200×630). Teste le rendu avec le [Débogueur de partage Facebook](https://developers.facebook.com/tools/debug/) ou en collant le lien dans WhatsApp, puis déclare le site dans la [Search Console Google](https://search.google.com/search-console) (ajoute le `sitemap.xml`).
3. **Installer comme une application** : sur Android (Chrome) → menu ⋮ → *Installer l'application* ; sur iPhone (Safari) → Partager → *Sur l'écran d'accueil*.
4. Ajoute l'adresse dans le **README** (badge ou lien « Jouer en ligne ») et dans la description du dépôt GitHub (champ *Website*).

## Dépannage

- **Page 404 sur `/`** : vérifie dans *Settings → General* que **Output Directory** vaut `public` et que **Root Directory** est vide ou `./`.
- **Le déploiement tente d'installer des paquets** : *Settings → General → Install Command* doit rester celui de `vercel.json` (aucune installation nécessaire ; `@tauri-apps/cli` n'est utile que pour compiler l'APK).
- **Les niveaux ne se chargent pas** : ouvre la console du navigateur ; les fichiers `levels/*.json` doivent répondre en 200 (ils sont dans `public/levels/`).
- **Mise à jour pas visible** : les fichiers `js/` et `css/` sont servis avec `must-revalidate`, un rechargement forcé (Ctrl+F5) suffit ; les images sont mises en cache 24 h.
