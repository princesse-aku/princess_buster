# Contribuer à Princess Buster

Merci de t'intéresser à Princess Buster ! Ce guide explique comment proposer des corrections, des niveaux, des technologies ou des fonctionnalités. Tout le monde est le bienvenu, débutant ou expérimenté.

En participant, tu acceptes le [code de conduite](CODE_OF_CONDUCT.md).

## Sommaire

- [Façons de contribuer](#façons-de-contribuer)
- [Mise en place](#mise-en-place)
- [Workflow Git](#workflow-git)
- [Style de code](#style-de-code)
- [Ajouter ou modifier un niveau](#ajouter-ou-modifier-un-niveau)
- [Ajouter une technologie](#ajouter-une-technologie)
- [Tester ses changements](#tester-ses-changements)
- [Règles pour les images et les sons](#règles-pour-les-images-et-les-sons)
- [Pull requests et revue](#pull-requests-et-revue)
- [Signaler un bug ou proposer une idée](#signaler-un-bug-ou-proposer-une-idée)
- [Licence de tes contributions](#licence-de-tes-contributions)

## Façons de contribuer

- 🐞 **Signaler un bug** (en précisant appareil, navigateur, niveau)
- 💡 **Proposer une idée** : pièces spéciales, bonus, effets, modes de jeu
- 🧩 **Créer des niveaux** ou équilibrer la difficulté
- 🧱 **Ajouter une technologie** (Go, Rust, Kotlin, Swift…)
- 🌍 **Traduire** le jeu (il est en français ; l'internationalisation est sur la [feuille de route](README.md#feuille-de-route))
- ♿ **Accessibilité** : contrastes, tailles tactiles, alternatives au son, mode daltonien
- 📚 **Documentation** : README, commentaires, tutoriels
- 📱 **Tester** sur de vrais téléphones et tablettes, en portrait et en paysage

Pour un gros changement (nouvelle mécanique, refonte), **ouvre d'abord une issue** pour en discuter avant de coder : ça évite du travail perdu.

## Mise en place

Prérequis : [Node.js](https://nodejs.org) **22.5 ou plus**, Git et un navigateur récent. Il n'y a **aucune dépendance npm à installer**.

```bash
# 1. Fork le dépôt sur GitHub, puis clone ton fork
git clone https://github.com/<ton-compte>/princess_buster.git
cd princess_buster

# 2. Lance le jeu
npm start            # http://localhost:3000

# 3. Vérifie que tout est vert
npm test
```

Raccourcis utiles pour développer (voir le [README](README.md#raccourcis-de-développement)) :

```text
http://localhost:3000/?name=Dev&level=12              # ouvre directement un niveau
http://localhost:3000/?name=Dev&level=12&autoplay=1   # un robot joue à ta place
```

Les fichiers de `public/` sont servis tels quels (sans cache) : modifie, puis recharge la page.

## Workflow Git

1. Mets ton fork à jour : `git remote add upstream https://github.com/princesse-aku/princess_buster.git` puis `git pull upstream main`.
2. Crée une branche **à partir de `main`**, avec un nom parlant :
   - `fix/canon-visee-tactile`
   - `feat/piece-explosive`
   - `level/niveau-201-rust`
   - `docs/traduction-anglais`
3. Fais des commits **petits et ciblés**. Message au format [Conventional Commits](https://www.conventionalcommits.org/fr/) :
   `feat: ajoute la pièce explosive`, `fix: corrige le plein écran sur iOS`, `docs: précise le format des niveaux`, `level: ajoute le niveau 201 (Rust)`.
4. Pousse ta branche sur ton fork et ouvre une **pull request vers `main`**.
5. Ne réécris pas l'historique d'une PR déjà relue (pas de `force push` sans prévenir).

## Style de code

Le projet est volontairement **simple** : JavaScript « vanilla », sans bundler ni framework.

- **Pas de nouvelle dépendance** sans discussion préalable (le projet doit rester utilisable avec Node.js seul).
- JavaScript moderne (ES2022), `const`/`let`, pas de `var`. Indentation de **2 espaces**, guillemets simples, points-virgules.
- Garde la séparation des rôles :
  - `public/js/game.js` : moteur et rendu. **Aucune** référence au DOM de l'interface.
  - `public/js/ui.js` : écrans, entrées, navigation.
  - `public/js/storage.js` : toute la persistance (pour pouvoir la remplacer par Tauri/SQL plus tard).
  - `public/js/audio.js` : sons.
- Les commentaires expliquent le **pourquoi**, pas le quoi. Le code et les commentaires existants sont en français : écris en français ou en anglais, mais reste cohérent dans un même fichier.
- Les couleurs viennent des variables CSS de `public/css/style.css` (charte tirée du logo : indigo, or, magenta, violet, cyan). Ne code pas de couleurs en dur dans le CSS si une variable existe.
- Pense **mobile d'abord** : cibles tactiles confortables, aucun survol obligatoire, test en portrait **et** paysage.
- Les performances comptent : évite les allocations dans la boucle de rendu (`render`) et dans `step`.

## Ajouter ou modifier un niveau

Un niveau est un fichier `public/levels/levelNNN.json` (le format complet est décrit dans le [README](README.md#créer-ou-modifier-un-niveau)). Il peut être écrit à la main ou généré par `tools/generate-levels.js`.

**Règles obligatoires** (contrôlées par `npm test`, donc par la CI) :

1. Les champs `id`, `theme`, `balls` (> 0), `rows`, `cols` et `pieces` sont présents (`theme` = un des thèmes de `index.json`) ; `id` correspond à `public/levels/index.json`.
2. Chaque `tech` existe dans `index.json`.
3. Chaque pièce est **entièrement dans la grille** (`col + w ≤ cols`, `row + h ≤ rows`).
4. **Pas de chevauchement** entre deux pièces d'une même rangée (`layer`).
5. **Aucun cube suspendu dans le vide** : chaque pièce repose sur une pièce de la même rangée, ou sur la table (dernière ligne). C'est une règle de design essentielle du jeu.

**Conseils d'équilibrage** :

- Le score vaut le nombre de balles restantes : donne assez de balles pour qu'un bon joueur gagne avec des balles de reste, mais pas un niveau trivial.
- Teste avec le robot (`?autoplay=1`) pour avoir un ordre de grandeur, puis joue le niveau toi-même plusieurs fois.
- Le poids (`cubeWeight`) et la taille des pièces augmentent le nombre de tirs nécessaires ; les rangées `layer: 1` cachées derrière rendent le niveau nettement plus dur.
- La difficulté doit rester **croissante** d'un niveau au suivant.

Si tu modifies `tools/generate-levels.js`, régénère les niveaux (`npm run levels`) et commite les JSON obtenus **dans la même PR**.

## Ajouter une technologie

1. Ajoute un logo **SVG** libre de droits dans `public/assets/tech/<cle>.svg`. Les logos de [Devicon](https://devicon.dev) conviennent (licence MIT) ; vérifie que la marque autorise cet usage. Le SVG doit avoir une `viewBox`.
2. Déclare la techno (clé, nom, couleur d'accent) dans le tableau `TECHS` de `tools/generate-levels.js`.
3. Régénère (`npm run levels`) ou ajoute-la à la main dans `public/levels/index.json` et dans un niveau.
4. `npm test` doit rester vert.

## Tester ses changements

Il n'y a pas (encore) de tests automatiques du moteur de jeu : la validation passe par `npm test` pour les niveaux et par **un vrai test manuel**. Avant d'ouvrir une PR, vérifie :

- [ ] `npm test` passe
- [ ] Le jeu démarre (`npm start`) et on peut jouer un niveau complet, gagner **et** perdre
- [ ] La sauvegarde fonctionne (rejoue après rechargement : niveaux débloqués et score conservés)
- [ ] Aucun message d'erreur dans la console du navigateur
- [ ] Si tu touches à l'affichage : portrait **et** paysage, petit téléphone **et** tablette (outils développeur → mode appareil)
- [ ] Si tu touches au son : on peut toujours couper la musique et les bruitages

Si tu ajoutes un outil ou un script, documente-le dans le README.

## Règles pour les images et les sons

- N'ajoute **que** des fichiers que tu as créés ou dont la licence autorise la redistribution sous une licence compatible avec MIT (CC0, CC BY, MIT…). Indique la **source et la licence** dans la description de la PR.
- N'ajoute **aucun asset** extrait d'autres jeux (graphismes, sons, musiques, captures).
- Pas d'image de personne réelle sans son accord écrit.
- Le logo « Princess Buster » reste la propriété de l'auteur du projet (voir [LICENSE](LICENSE)) : ne le modifie pas et ne le réutilise pas dans un autre projet sans accord.
- Garde les fichiers légers : SVG ou WebP pour les images, et évite les fichiers audio volumineux (le son est actuellement synthétisé).

## Pull requests et revue

- Une PR = **un sujet**. Décris ce qui change et pourquoi, lie l'issue (`Closes #12`), ajoute des **captures ou une vidéo** pour tout changement visuel.
- Remplis la checklist du modèle de PR.
- La CI doit être verte.
- Un mainteneur relit dès que possible (généralement sous quelques jours). Des changements peuvent être demandés : c'est normal et bienveillant.
- Les PR sont fusionnées en **squash merge** avec un message au format Conventional Commits.
- Une PR inactive depuis plus de 30 jours peut être fermée ; tu pourras la rouvrir quand tu veux.

## Signaler un bug ou proposer une idée

Utilise les [modèles d'issues](https://github.com/princesse-aku/princess_buster/issues/new/choose). Avant de créer une issue, cherche si elle n'existe pas déjà.

Pour un bug, indique : le niveau, les étapes pour reproduire, ce que tu attendais, l'appareil/OS/navigateur, l'orientation de l'écran, et une capture ou une vidéo si possible.

**Failles de sécurité** : ne les publie pas dans une issue publique, suis [SECURITY.md](SECURITY.md).

## Licence de tes contributions

En ouvrant une pull request, tu acceptes que ta contribution soit publiée sous la [licence MIT](LICENSE) du projet (à l'exception des éléments réservés mentionnés dans ce fichier de licence), et tu confirmes avoir le droit de la partager.

Merci de faire grandir Princess Buster ! 👑
