# REA Android application

## Product requirement

The target is a **standalone Android application**. The normal app must start its own REA engine from files packaged inside the APK (or app-managed, locally installed engine packs). It must not ask the user for a server IP, connect to a separate computer, open a website, or require a separately installed Termux app.

The complete REA tool catalog must remain present. A Windows/macOS/Linux provider is not to be deleted because it is not Android-compatible: it must be ported, replaced with a functionally equivalent Android implementation where possible, or retained with an explicit platform restriction and its original contract.

See [ANDROID_PORTING_MATRIX.md](./ANDROID_PORTING_MATRIX.md) for the 66-group inventory, technical plan, platform boundaries and acceptance criteria. See [ANDROID_RUNTIME_SPIKE.md](./ANDROID_RUNTIME_SPIKE.md) for the verified Node 24/Bionic build route and the app-specific runtime packaging investigation.

## Honest current state

**This directory is not yet the standalone product and no APK is declared ready.**

The Expo/React Native screen is a local-only workspace: it imports selected files through Android's document picker and copies them into app-private storage. A local Expo native module now exposes app-private Node runtime inspection and a real `node --version` process probe. Imported targets live under the Expo persistent document root at `rea-workspace/targets`; the local MCP child process uses `rea-workspace` as its working directory so relative target paths resolve consistently. The Node executable and its libraries are not packaged in the APK yet, so the module reports the runtime as unavailable until the candidate build is verified and integrated. No analysis tool is advertised as working before device tests.

The upstream engine is a Node.js 22+ MCP server/CLI. The repository already has a dedicated `build:termux` path and a real-Termux emulator workflow. That workflow installs Android's Termux Node.js LTS and Chromium packages, builds REA inside the Android app sandbox, runs the engine doctor, and exercises browser capture. This is useful Android evidence, but it does not prove that all 66 capability groups run on Android or that the current mobile prototype embeds the runtime.

## Required implementation

The final app must own:

- An Android-compatible Node runtime and the compiled REA engine.
- The original generated tool catalog and production JS dependencies.
- Android-native process launch, cancellation, bounded logs and cleanup.
- App-private target/workspace/evidence storage and Android's Storage Access Framework file picker.
- Schema-driven forms for the original tool contracts.
- Provider readiness and capability status for every tool.
- Android ports or bundled engines for providers that can legally and technically run on Android.

The initial ABI target is `arm64-v8a`. Additional ABIs must be built and tested before being advertised.

## Runtime and provider policy

- Do not use a remote MCP endpoint as the normal app runtime.
- Do not enable cleartext traffic as a workaround.
- Do not claim that a desktop executable can run on Android without a tested Android/Bionic build.
- Do not remove tools from the catalog. Use the explicit states Native, Ported, Bundled engine, Device bridge, Restricted, or Not assessed.
- Keep upstream and third-party license notices with redistributed components.
- A provider is marked working only after a real Android-device test.

## Build status

The GitHub Actions workflow under `.github/workflows/android-apk.yml` builds the Expo app and checks the local native module. It is not yet a validated standalone REA build. A workspace-shell debug APK has successfully built for `arm64-v8a` only (about 37 MB); it contains no bundled Node runtime, REA engine, or toolchain assets and is not the deliverable APK. The new `.github/workflows/android-node-runtime.yml` builds an app-ID-specific Node 24/Bionic runtime candidate from pinned Termux recipes and inspects its ELF dependencies; this candidate is not considered integrated until it is launched from the installed REA APK. The Termux emulator workflow now also runs an Android Node runtime smoke test for the REA Node version range, filesystem access, child-process execution, worker threads, crypto and localhost HTTP. The APK release gate will be replaced by the standalone engine/device tests described in [ANDROID_PORTING_MATRIX.md](./ANDROID_PORTING_MATRIX.md).
