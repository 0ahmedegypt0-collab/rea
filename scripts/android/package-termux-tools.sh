#!/usr/bin/env bash
set -euo pipefail

readonly OUTPUT_DIR="${1:-$GITHUB_WORKSPACE/mobile/android/toolchain}"
readonly APP_ID="tools.rea.mobile"
readonly DEB_DIR="$GITHUB_WORKSPACE/termux-packages/output"
readonly STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

shopt -s nullglob
packages=("$DEB_DIR"/*.deb)
(( ${#packages[@]} > 0 )) || {
  echo "No Android toolchain Debian packages were produced" >&2
  exit 1
}

for package in "${packages[@]}"; do
  dpkg-deb -x "$package" "$STAGE_DIR"
done

prefix="$STAGE_DIR/data/data/$APP_ID/files/usr"
[[ -x "$prefix/bin/bash" ]] || { echo "Missing app-private bash" >&2; exit 1; }
[[ -x "$prefix/bin/python" ]] || { echo "Missing app-private Python" >&2; exit 1; }
[[ -x "$prefix/bin/git" ]] || { echo "Missing app-private git" >&2; exit 1; }
[[ -x "$prefix/bin/adb" ]] || { echo "Missing app-private adb" >&2; exit 1; }
[[ -x "$prefix/bin/jq" ]] || { echo "Missing app-private jq" >&2; exit 1; }
[[ -x "$prefix/bin/readelf" ]] || { echo "Missing app-private readelf" >&2; exit 1; }
[[ -x "$prefix/bin/java" && -x "$prefix/bin/jadx" && -x "$prefix/bin/apktool" && -x "$prefix/bin/binwalk" && -x "$prefix/bin/apksigner" && -x "$prefix/bin/gdb" && -x "$prefix/bin/rizin" && -x "$prefix/bin/radare2" ]] || {
  echo "The Android Java/DEX/firmware toolchain is incomplete" >&2
  exit 1
}
[[ -x "$prefix/bin/grep" && -x "$prefix/bin/sed" && -x "$prefix/bin/find" ]] || {
  echo "The base shell/text utilities are incomplete" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR/rea-tools-arm64.tar.gz" "$OUTPUT_DIR/rea-tools-arm64.sha256"
tar -czf "$OUTPUT_DIR/rea-tools-arm64.tar.gz" -C "$STAGE_DIR/data/data/$APP_ID/files" usr
(cd "$OUTPUT_DIR" && sha256sum rea-tools-arm64.tar.gz > rea-tools-arm64.sha256)
printf '%s\n' "${packages[@]##*/}" > "$OUTPUT_DIR/rea-tools-packages.txt"
sha256sum "${packages[@]}" > "$OUTPUT_DIR/rea-tools-deb-checksums.txt"
find "$prefix/lib" -maxdepth 1 -type f -name 'libtermux-exec*.so*' -printf '%f\n' \
  | sort -u > "$OUTPUT_DIR/termux-exec-libraries.txt"

cat > "$OUTPUT_DIR/toolchain-manifest.json" <<EOF
{
  "applicationId": "$APP_ID",
  "architecture": "arm64-v8a",
  "prefix": "/data/data/$APP_ID/files/usr",
  "executables": ["bash", "python", "git", "adb", "jq", "readelf", "grep", "sed", "find", "java", "jadx", "apktool", "apksigner", "binwalk", "gdb", "rizin", "radare2"],
  "packageCount": ${#packages[@]}
}
EOF

echo "Packaged app-private Android toolchain: $OUTPUT_DIR/rea-tools-arm64.tar.gz"
