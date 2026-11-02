# REA Android application

## Product requirement

The target is a **standalone Android application**. The normal app must start its own REA engine from files packaged inside the APK (or app-managed, locally installed engine packs). It must not ask the user for a server IP, connect to a separate computer, open a website, or require a separately installed Termux app.

The complete REA tool catalog must remain present. A Windows/macOS/Linux provider is not to be deleted because it is not Android-compatible: it must be ported, replaced with a functionally equivalent Android implementation where possible, or retained with an explicit platform restriction and its original contract.

See [ANDROID_PORTING_MATRIX.md](./ANDROID_PORTING_MATRIX.md) for the 66-group inventory, technical plan, platform boundaries and acceptance criteria.

## Honest current state

**This directory is not yet the standalone product and no APK is declared ready.**

The current Expo/React Native files are an early MCP-over-HTTP prototype. That prototype asks for an external endpoint and does not embed the REA engine. It therefore does not satisfy the product requirement and must not be treated as the final architecture.

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

The existing GitHub Actions workflow under `.github/workflows/android-apk.yml` builds the early Expo prototype. It is not yet a validated standalone REA build. The APK release gate will be replaced by the standalone engine/device tests described in [ANDROID_PORTING_MATRIX.md](./ANDROID_PORTING_MATRIX.md).
