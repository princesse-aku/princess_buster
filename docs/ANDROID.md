# Compiler l'APK Android (Tauri v2)

Princess Buster utilise [Tauri v2](https://tauri.app) pour produire l'application Android (et desktop). Le jeu reste la page web de `public/` ; Tauri l'embarque dans une WebView et fournit une **vraie base SQLite locale** via `tauri-plugin-sql` (mêmes tables `players` / `progress` que le serveur de test, voir `public/js/storage.js`).

## Prérequis (Windows)

| Outil | Version | Remarque |
| --- | --- | --- |
| [Rust](https://rustup.rs) | stable | `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android` |
| Visual Studio Build Tools | 2022 | charge de travail « Développement Desktop en C++ » (éditeur de liens MSVC + Windows SDK). Le script charge lui-même `vcvars64.bat` ; une installation Visual Studio « incomplète » (sans SDK) ferait échouer l'édition de liens |
| JDK | 17 ou 21 | `JAVA_HOME` (le JDK 21 d'Android Studio convient). Évite les JDK trop récents pour Gradle |
| Android SDK + NDK | SDK 34+, NDK r26+ | via Android Studio ; `ANDROID_HOME` et `NDK_HOME` |
| Node.js | 22.5+ | `npm install` installe le CLI Tauri |

> Les scripts détectent automatiquement `ANDROID_HOME`, `NDK_HOME` et `JAVA_HOME` dans les emplacements standards.

## Compiler

> Sous Windows, Gradle appelle `npm.bat` : le script crée automatiquement un petit relais temporaire. `npm run android:build` lance le même script.

```powershell
npm install
powershell -ExecutionPolicy Bypass -File tools/build-android.ps1          # arm64 (la plupart des téléphones)
powershell -ExecutionPolicy Bypass -File tools/build-android.ps1 -Target all   # toutes les architectures (plus long, plus gros)
```

Le script compile, aligne (`zipalign`), **signe** (`apksigner`) et dépose l'APK dans `dist/` (ignoré par git) :
`dist/PrincessBuster-<version>-aarch64.apk`.

Équivalent manuel : `npx tauri android build --apk --target aarch64`, puis signature de l'APK « unsigned » (Android refuse d'installer un APK non signé).

## Clé de signature

La clé est créée une fois dans `%USERPROFILE%\.princess-buster\` (hors du dépôt) :

```powershell
keytool -genkeypair -v -keystore $env:USERPROFILE\.princess-buster\release.keystore -alias princessbuster -keyalg RSA -keysize 2048 -validity 10000
```

Puis un fichier `keystore.properties` à côté (`storeFile`, `keyAlias`, `storePassword`, `keyPassword`). **Sauvegarde ce dossier** : sans la même clé, impossible de publier des mises à jour d'une application déjà installée. Ne le committe jamais.

## Installer sur un téléphone

1. Copie l'APK sur le téléphone (ou `adb install dist/PrincessBuster-0.1.0-aarch64.apk`).
2. Autorise l'installation depuis cette source (« sources inconnues »).
3. Lance « Princess Buster ».

## Développer sur Android

```powershell
npx tauri android dev      # téléphone branché en USB (débogage USB activé) ou émulateur
```

Les données (joueurs, scores) sont stockées dans la base SQLite privée de l'application.

## Desktop

```powershell
npx tauri dev       # fenêtre de développement
npx tauri build     # installeurs Windows (MSI / NSIS)
```

## Dépannage

- **`failed to run custom build command` / `link.exe` introuvable** : installe les Visual Studio Build Tools (C++).
- **Gradle échoue avec une erreur de version Java** : utilise un JDK 17 ou 21 dans `JAVA_HOME`.
- **`NDK_HOME` introuvable** : installe le NDK dans Android Studio (SDK Manager → SDK Tools → NDK).
- **Erreur de lien symbolique (Windows)** : active le *Mode développeur* (Paramètres → Confidentialité et sécurité → Pour les développeurs).
- **L'APK ne s'installe pas** : il doit être signé (le script s'en charge) et l'architecture doit correspondre au téléphone (arm64 = `aarch64`).
