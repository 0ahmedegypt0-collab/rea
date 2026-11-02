#!/usr/bin/env bash
set -euo pipefail

readonly OUTPUT_DIR="${1:-$HOME/rea-ci/engine-artifact}"
readonly PACKAGE_NAME="rea-agents"

[[ -f dist/mcp-catalog-full.json ]] || {
  echo "The full MCP catalog is missing; run npm run build:termux first" >&2
  exit 1
}
[[ -f scripts/rea.mjs && -f npm-shrinkwrap.json ]] || {
  echo "The compiled REA package root is incomplete" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
rm -rf "$OUTPUT_DIR/staging"
mkdir -p "$OUTPUT_DIR/staging"

# Remove build/test-only dependencies only after the Android TypeScript build
# and catalog generation have completed.
npm prune --omit=dev --ignore-scripts --no-audit --no-fund

# Use npm's canonical package file allowlist so the app gets the same runtime
# source, skills, bridge contracts and license notices as the published package.
packed_name="$(npm pack --silent --ignore-scripts --pack-destination "$OUTPUT_DIR")"
[[ -n "$packed_name" && -f "$OUTPUT_DIR/$packed_name" ]] || {
  echo "npm pack did not produce the REA runtime package" >&2
  exit 1
}
tar -xzf "$OUTPUT_DIR/$packed_name" -C "$OUTPUT_DIR/staging"
[[ -d "$OUTPUT_DIR/staging/package" ]] || {
  echo "The REA package archive has an unexpected layout" >&2
  exit 1
}

# Keep the exact production dependency tree installed by Android's own Node.
cp -a node_modules "$OUTPUT_DIR/staging/package/node_modules"

find "$OUTPUT_DIR/staging/package/node_modules" -type f -name '*.node' -print \
  | sed "s#^$OUTPUT_DIR/staging/package/##" \
  > "$OUTPUT_DIR/native-addons.txt"

node --input-type=module - "$OUTPUT_DIR/staging/package" "$OUTPUT_DIR/native-addons.txt" <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2];
const addons = readFileSync(process.argv[3], "utf8").split(/\r?\n/).filter(Boolean);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(root, "dist/mcp-catalog-full.json"), "utf8"));
if (!Array.isArray(catalog.tools) || catalog.tools.length === 0) {
  throw new Error("The packaged full MCP catalog is empty");
}
if (new Set(catalog.tools.map((tool) => tool.name)).size !== catalog.tools.length) {
  throw new Error("The packaged MCP catalog contains duplicate tool names");
}
if (!readFileSync(join(root, "skills/reverse-engineer-anything/SKILL.md"), "utf8")) {
  throw new Error("The generated REA skill bundle is missing");
}
const manifest = {
  packageName: pkg.name,
  packageVersion: pkg.version,
  buildPlatform: process.platform,
  buildArchitecture: process.arch,
  nodeVersion: process.versions.node,
  mcpToolCount: catalog.tools.length,
  nativeAddonFiles: addons,
  nativeAddonCount: addons.length,
  engineEntry: "scripts/rea.mjs",
  catalog: "dist/mcp-catalog-full.json",
};
writeFileSync(join(root, "android-engine-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
NODE

node "$OUTPUT_DIR/staging/package/scripts/rea.mjs" --version
tar -czf "$OUTPUT_DIR/rea-engine-js.tar.gz" -C "$OUTPUT_DIR/staging" package
(cd "$OUTPUT_DIR" && sha256sum rea-engine-js.tar.gz > rea-engine-js.sha256)
cp "$OUTPUT_DIR/staging/package/android-engine-manifest.json" "$OUTPUT_DIR/android-engine-manifest.json"

echo "Packaged REA Android engine bundle:"
echo "  archive: $OUTPUT_DIR/rea-engine-js.tar.gz"
echo "  catalog: $(node -p 'JSON.parse(require("node:fs").readFileSync("dist/mcp-catalog-full.json","utf8")).tools.length') tools"
echo "  native add-ons: $(wc -l < "$OUTPUT_DIR/native-addons.txt")"
echo "Native add-ons listed above require separate ABI/linker verification before they can be enabled."
