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

## Important refinement: app-specific Termux package builds

The Termux build system explicitly supports changing `TERMUX_APP__PACKAGE_NAME`, `TERMUX_APP__DATA_DIR` and `TERMUX__PREFIX` when forking its package build configuration for another Android application. The documented default prefix is `/data/data/com.termux/files/usr`; the package name and data directory determine the private prefix. Termux also explicitly warns that packages built for one app package name cannot be mixed with packages built for another.

This gives REA a much stronger candidate than copying the public Termux binary: build the required Termux packages from source with REA's Android application ID (`tools.rea.mobile`) and an REA-owned private prefix, then package only the required runtime files into the REA APK. Official prebuilt Termux packages must **not** be reused unchanged for this custom prefix.

The remaining proof is to pin a Termux packages commit, override its build properties reproducibly, build Node and every required dependency for that custom app ID, inspect all embedded paths/ELF dependencies, and launch it from the REA process. The package-build documentation states that custom app IDs require rebuilding packages rather than mixing in the official repository binaries.

Sources:
- [Termux package build configuration](https://github.com/termux/termux-packages/wiki/Building-packages)
- [Termux build properties and app data/prefix variables](https://github.com/termux/termux-packages/blob/master/scripts/properties.sh)
- [Termux private prefix layout](https://github.com/termux/termux-packages/wiki/Termux-file-system-layout)


## Reproducible runtime-candidate build

The repository now contains `.github/workflows/android-node-runtime.yml` and `scripts/android/package-termux-runtime.sh`.

The workflow checks out Termux package recipes at commit `d4e5b905c5582a33cd77922a9b7bb4f05b80104c`, changes the Termux app ID in the build properties to the REA Android application ID `tools.rea.mobile`, and invokes the official Termux package-builder container to build `nodejs-lts` plus its Bionic dependencies for `aarch64`. The package outputs are unpacked into the exact app-private prefix `/data/data/tools.rea.mobile/files/usr`, then the Node ELF header, Android linker interpreter, dynamic dependencies and old default Termux prefix references are checked. The workflow uploads the runtime archive and inspection evidence.

This workflow is a **candidate-build stage**, not proof of runtime execution inside the APK. The next required stage is to place the archive in an Android test host, extract it under the REA app's actual private files directory, launch Node under the REA application UID/SELinux domain, and run the REA CLI/MCP smoke tests. The runtime is not wired into the current Expo UI until that Android process test passes.
