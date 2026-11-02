# Android Node runtime feasibility spike

**Status: investigation only — no embedded Node runtime has been built or packaged yet.**  
**Review date:** 2026-11-02  
**Initial ABI:** `arm64-v8a`

## Verified candidate: Termux Node.js LTS

The current Termux `nodejs-lts` build recipe declares Node.js **24.22.2**, which satisfies this repository's `^24.22.1` engine range. The recipe is MIT-licensed and builds upstream Node for Android/Bionic with `--dest-os=android`; it maps Termux `aarch64` to Node `arm64`.

The recipe's runtime dependencies are:

- `libc++`
- `openssl`
- `c-ares`
- `libicu`
- `libsqlite`
- `zlib`

The recipe deliberately does **not** use shared libuv because of an Android linker issue involving symbol resolution for `dlopen()`. It builds host ICU and LLVM tooling, uses Ninja, and configures Node with shared OpenSSL, c-ares, SQLite and zlib. This is a real Android/Bionic build route, but it is not a small prebuilt executable that can safely be copied into an unrelated APK.

Sources:
- [Termux nodejs-lts build recipe](https://github.com/termux/termux-packages/blob/master/packages/nodejs-lts/build.sh)
- [Termux package build process](https://github.com/termux/termux-packages/wiki/Building-packages)

## Blocking issue: package prefix and runtime dependencies

The Termux recipe configures Node with `--prefix=$TERMUX_PREFIX` and installs the runtime and its libraries into that prefix. In the standard Termux app, that prefix belongs to Termux's private app sandbox. Copying the resulting executable and libraries unchanged into `tools.rea.mobile` would therefore be an unsafe assumption: package-prefix paths, module lookup, shared-library lookup, helper scripts and native add-ons all need to be audited.

A standalone REA APK must not depend on `/data/data/com.termux/files/usr`, the Termux app, or a Termux service. The build must instead produce an app-owned runtime layout and prove it works under the REA application's UID and SELinux domain.

## Required spike before integrating a native bridge

1. Pin the exact Termux packages commit and all source checksums; do not build from a moving `master` branch in release CI.
2. Build Node 24.22.2 for `aarch64` with a controlled app-owned prefix strategy. Determine whether a relocatable prefix can be achieved safely or whether a dedicated Node/NDK build is required.
3. Produce an ELF inventory with `readelf`: interpreter, DT_NEEDED entries, SONAMEs, RPATH/RUNPATH, text relocations and unresolved symbols.
4. Package every permitted shared dependency inside the APK and resolve it from the app's private/native library locations without relying on Termux paths.
5. Run the binary from the REA app process on an Android emulator and physical arm64 device. Verify `process.platform`, Node version, filesystem, `child_process`, `worker_threads`, crypto, localhost IPC, signal handling and app lifecycle.
6. Run the actual compiled REA MCP entrypoint and `rea mcp doctor` from the embedded app-owned runtime.
7. Only after these tests pass, implement the Kotlin/React Native process adapter and expose the original tool catalog.

## Decision

**Do not integrate `nodejs-mobile-react-native` based on its Node 18 runtime**, and do not copy Termux's installed Node binary into the APK as-is. Continue with a pinned Android/Bionic Node build and an app-owned prefix. If that prefix cannot be made robust, switch to a custom Android NDK Node build (including a JNI/libnode embedding only after proving the full Node API and worker/process requirements).

This spike does not mark any capability group as Native or Ported. The existing 66-group matrix remains the source of truth, and every capability still requires real Android execution evidence.
