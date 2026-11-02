#!/usr/bin/env bash
set -euo pipefail

readonly APP_ID="tools.rea.mobile"
readonly DEB_DIR="${1:-../termux-packages/output}"
readonly OUTPUT_DIR="${2:-mobile/android/runtime}"
readonly EXPECTED_PREFIX="/data/data/${APP_ID}/files/usr"

command -v dpkg-deb >/dev/null || { echo "dpkg-deb is required" >&2; exit 1; }
command -v readelf >/dev/null || { echo "readelf is required" >&2; exit 1; }
[[ -d "$DEB_DIR" ]] || { echo "Termux package output directory not found: $DEB_DIR" >&2; exit 1; }

mapfile -t packages < <(find "$DEB_DIR" -maxdepth 1 -type f -name '*.deb' -print | sort)
(( ${#packages[@]} > 0 )) || { echo "No .deb packages were produced" >&2; exit 1; }

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
for package in "${packages[@]}"; do
  echo "Extracting $(basename "$package")"
  dpkg-deb --extract "$package" "$stage"
done

readonly prefix="$stage/data/data/${APP_ID}/files/usr"
[[ -x "$prefix/bin/node" ]] || {
  echo "Node executable missing at app-specific prefix: $prefix/bin/node" >&2
  find "$stage" -maxdepth 7 -type f -name node -print >&2
  exit 1
}

# Verify that the package was built for the app ID, not the public Termux prefix.
if grep -R -a -l --exclude='*.a' --exclude='*.o' "/data/data/com.termux" "$prefix" >/dev/null 2>&1; then
  echo "Found a hard-coded public Termux prefix in packaged runtime files" >&2
  exit 1
fi

readelf -h "$prefix/bin/node" | grep -q 'AArch64'
readelf -l "$prefix/bin/node" | grep -q '/system/bin/linker64'
readelf -d "$prefix/bin/node" > "$stage/node.dynamic.txt"
readelf -h "$prefix/bin/node" > "$stage/node.elf.txt"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/node-runtime-arm64.tar.gz" "$OUTPUT_DIR/node-runtime-arm64.sha256" "$OUTPUT_DIR/node-runtime-packages.txt"
tar -czf "$OUTPUT_DIR/node-runtime-arm64.tar.gz" -C "$stage/data/data/${APP_ID}/files" usr
(cd "$OUTPUT_DIR" && sha256sum node-runtime-arm64.tar.gz > node-runtime-arm64.sha256)
printf '%s\n' "${packages[@]##*/}" > "$OUTPUT_DIR/node-runtime-packages.txt"
cp "$stage/node.dynamic.txt" "$OUTPUT_DIR/node.dynamic.txt"
cp "$stage/node.elf.txt" "$OUTPUT_DIR/node.elf.txt"

echo "Packaged Android/Bionic Node runtime candidate:"
echo "  app id: $APP_ID"
echo "  prefix: $EXPECTED_PREFIX"
echo "  archive: $OUTPUT_DIR/node-runtime-arm64.tar.gz"
echo "  packages: ${#packages[@]}"
echo "This is a packaging/ELF check only; execution inside the REA APK is still required."
