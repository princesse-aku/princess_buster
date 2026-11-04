# Compile l'APK Android de Princess Buster avec Tauri, l'aligne et le signe.
#   powershell -ExecutionPolicy Bypass -File tools/build-android.ps1 [-Target aarch64|armv7|x86_64|i686|all]
#
# Prérequis (voir docs/ANDROID.md) : Rust + cibles Android, Android SDK/NDK, JDK 17+ (21 conseillé), npm install.
# La clé de signature est lue dans ~/.princess-buster/keystore.properties (jamais dans le dépôt).
param(
  [string]$Target = 'aarch64',
  [string]$KeystoreDir = "$env:USERPROFILE\.princess-buster"
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# --- environnement (détecté automatiquement si non défini) ---
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
if (-not $env:NDK_HOME) { $env:NDK_HOME = (Get-ChildItem "$env:ANDROID_HOME\ndk" | Sort-Object Name -Descending | Select-Object -First 1).FullName }
if (-not $env:JAVA_HOME) {
  $jdk = Get-ChildItem "C:\Program Files\Android\openjdk", "C:\Program Files\Java", "C:\Program Files\Eclipse Adoptium" -Directory -ErrorAction SilentlyContinue | Where-Object Name -match 'jdk-?(17|21)' | Select-Object -First 1
  if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
}
if ($env:JAVA_HOME) { $env:Path = "$env:JAVA_HOME\bin;$env:Path" }

# --- environnement MSVC (éditeur de liens + Windows SDK) : on charge vcvars64.bat d'une installation complète ---
$vcvars = @(
  "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat",
  "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat",
  "${env:ProgramFiles}\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($vcvars) {
  cmd /c "`"$vcvars`" >nul && set" | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] } }
} else { Write-Warning "vcvars64.bat introuvable : installe les Build Tools Visual Studio (charge de travail C++)." }

# --- Gradle (plugin Rust de Tauri) lance « npm.bat » : sous Windows npm est un npm.cmd, on fournit un petit relais ---
$npmCmd = (Get-Command npm.cmd -ErrorAction Stop).Source
$shimDir = Join-Path $env:TEMP 'princess-buster-shim'
New-Item -ItemType Directory -Force $shimDir | Out-Null
"@echo off`r`ncall `"$npmCmd`" %*" | Set-Content -Encoding ascii (Join-Path $shimDir 'npm.bat')
$env:Path = "$shimDir;$env:Path"

# --- compilation ---
$tauriArgs = @('tauri', 'android', 'build', '--apk')
if ($Target -ne 'all') { $tauriArgs += @('--target', $Target) }
npx @tauriArgs
if ($LASTEXITCODE -ne 0) { throw "Échec de la compilation Tauri" }

# --- alignement + signature ---
$apkDir = Join-Path $root 'src-tauri\gen\android\app\build\outputs\apk'
$unsigned = Get-ChildItem $apkDir -Recurse -Filter '*release-unsigned.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $unsigned) { throw "APK non signé introuvable dans $apkDir" }

$props = @{}
Get-Content "$KeystoreDir\keystore.properties" | ForEach-Object { if ($_ -match '^(\w+)=(.*)$') { $props[$Matches[1]] = $Matches[2] } }
$bt = (Get-ChildItem "$env:ANDROID_HOME\build-tools" | Sort-Object Name -Descending | Select-Object -First 1).FullName
$version = (Get-Content src-tauri\tauri.conf.json | ConvertFrom-Json).version
$dist = Join-Path $root 'dist'; New-Item -ItemType Directory -Force $dist | Out-Null
$aligned = Join-Path $dist 'aligned.tmp.apk'
$out = Join-Path $dist "PrincessBuster-$version-$Target.apk"

& "$bt\zipalign.exe" -p -f 4 $unsigned.FullName $aligned
& "$bt\apksigner.bat" sign --ks $props.storeFile --ks-key-alias $props.keyAlias --ks-pass "pass:$($props.storePassword)" --key-pass "pass:$($props.keyPassword)" --out $out $aligned
Remove-Item $aligned -Force
& "$bt\apksigner.bat" verify --print-certs $out | Select-Object -First 2
"APK prêt : $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) Mo)"
