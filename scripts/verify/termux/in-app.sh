#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

report="$HOME/rea-ci"
exec > "$report/run.log" 2>&1
# Publish the result only after all commands have settled. The host reads it as
# root; no shared-storage permission or helper Android application is needed.
trap 'result=$?; printf "%s\n" "$result" > "$report/status"' EXIT
set -x
[[ "$(id -u)" != 0 ]]
export DEBIAN_FRONTEND=noninteractive
export HUSKY=0
pkg update -y
pkg upgrade -y
pkg install -y nodejs-lts npm git binutils x11-repo termux-exec
pkg install -y chromium
mkdir -p "$report/source"
tar -xf "$report/source.tar" -C "$report/source"
cd "$report/source"
node -e 'if (process.platform !== "android") throw new Error("Expected Android Node.js")'
node -e 'const expected = require("node:fs").readFileSync(".nvmrc", "utf8").trim().replace(/^v/, ""); if (process.versions.node !== expected) throw new Error(`Termux Node ${process.versions.node} differs from .nvmrc ${expected}`)'
# Android uses Termux's Bionic-linked Node distribution; the desktop .nvmrc
# binary cannot run here. Keep npm at the repository's exact pinned version.
npm install --prefix "$report/toolchain" --no-package-lock --ignore-scripts \
  "$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).packageManager')"
export PATH="$report/toolchain/node_modules/.bin:$PATH"
node --version
npm --version
dpkg-query -W nodejs-lts chromium termux-exec binutils
npm ci
npm run build:termux
node scripts/verify/termux/runtime.mjs
unset PLAYWRIGHT_BROWSERS_PATH npm_config_playwright_browsers_path npm_package_config_playwright_browsers_path
node scripts/verify/termux/browser.mjs
node scripts/android/package-rea-engine.sh "$report/engine-artifact"

# The emulator is x86_64 while the APK runtime target is arm64-v8a. Preserve
# the native-addon inventory, but exclude emulator-ABI .node files from the
# portable JavaScript engine payload until an arm64 Android build is available.
engine_filter="$report/engine-filter"
rm -rf "$engine_filter"
mkdir -p "$engine_filter"
tar -xzf "$report/engine-artifact/rea-engine-js.tar.gz" -C "$engine_filter"
find "$engine_filter/package" -type f -exec grep -I -l "/data/data/com.termux/files/usr" {} + > "$report/termux-prefix-leaks.txt" || true
while IFS= read -r file; do
  sed -i 's#/data/data/com.termux/files/usr#/data/data/tools.rea.mobile/files/usr#g' "$file"
done < "$report/termux-prefix-leaks.txt"
if find "$engine_filter/package" -type f -exec grep -I -n "/data/data/com.termux/files/usr" {} + | grep -q .; then
  echo "The REA engine bundle still contains Termux-specific absolute paths" >&2
  exit 1
fi
: > "$report/engine-artifact/native-addons-excluded.txt"
while IFS= read -r -d '' file; do
  if readelf -h "$file" >/dev/null 2>&1; then
    machine="$(readelf -h "$file" | awk -F: '/Machine:/ { sub(/^[[:space:]]+/, "", $2); print $2; exit }')"
    if [[ "$machine" != "AArch64" ]]; then
      printf '%s\n' "${file#"$engine_filter/package/"}" >> "$report/engine-artifact/native-addons-excluded.txt"
      rm -f "$file"
    fi
  fi
done < <(find "$engine_filter/package/node_modules" -type f -print0)
node --input-type=module - "$engine_filter/package/android-engine-manifest.json" "$report/engine-artifact/native-addons-excluded.txt" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
const path = process.argv[2];
const manifest = JSON.parse(readFileSync(path, "utf8"));
manifest.nativeAddonsExcludedFromArm64Bundle = true;
manifest.excludedNativeFiles = readFileSync(process.argv[3], "utf8").split(/\r?\n/).filter(Boolean);
writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
NODE
REA_MCP_PACKAGE_ROOT="$engine_filter/package" node scripts/verify/termux/mcp-stdio.mjs
tar -czf "$report/engine-artifact/rea-engine-js.tar.gz" -C "$engine_filter" package
(cd "$report/engine-artifact" && sha256sum rea-engine-js.tar.gz > rea-engine-js.sha256)
cp "$engine_filter/package/android-engine-manifest.json" "$report/engine-artifact/android-engine-manifest.json"
rm -rf "$engine_filter"
