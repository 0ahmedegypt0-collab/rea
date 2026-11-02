# Android porting matrix

## Objective

Ship REA as a self-contained Android application. The installed APK must contain the REA engine, its JavaScript runtime, its Android-compatible dependencies, its tool catalog, and every tool payload that can legally and technically be bundled. The normal user flow must not require a second computer, a user-supplied IP address, a browser page, or a separately hosted REA server.

This matrix is an engineering register, not a claim that every capability already runs on Android. A capability is marked complete only after an Android-device test exercises its real implementation and records its result.

## What the repository proves today

- REA is a Node.js MCP server/CLI. Its root package requires Node.js 22.23.4+, 24.22.1+, or 26.12.1+.
- The repository has a dedicated `build:termux` compilation path (`compile:termux`) and a real-Termux emulator workflow.
- The Termux verification installs Android's Termux Node.js LTS and Chromium packages, builds REA inside the Android app sandbox, runs `rea mcp doctor`, and exercises a real Chromium browser capture.
- The real-Termux workflow is manually dispatched. Its existence is evidence of a supported Android/Termux route, not proof that all REA providers run on Android or that the current Expo APK contains the engine.
- The current `mobile/` project is only a remote MCP client prototype. It asks for an HTTP endpoint and therefore does **not** meet the standalone-app requirement. It is not the final architecture.

## Capability inventory

The source-of-truth capability declarations currently contain 66 groups. No group is to be silently removed from the Android edition. Each group must end in one of these explicit states:

- **Native** — runs inside the APK using Android/JVM/NDK or portable JavaScript.
- **Ported** — original provider adapted to Android/Bionic and Android process, filesystem, and permission semantics.
- **Bundled engine** — a third-party engine is packaged for supported Android ABIs and invoked locally.
- **Device bridge** — requires a compatible connected Android device or a documented Android permission/ADB/Frida bridge.
- **Restricted** — retained and visible, but Android's security model, a missing vendor runtime, or a license prevents local execution; the app explains the exact limitation and offers an approved local alternative where possible.
- **Not assessed** — no Android-device proof yet. This is the current default.

| Capability group | Initial audit focus | Status |
|---|---|---|
| adbDevice | Android SDK platform tools, USB/Wi-Fi debugging, device permissions | Not assessed |
| analysisView | Evidence projection and retained analysis views | Not assessed |
| android | JADX engine, Java bridge, DEX/APK input, workspace | Not assessed |
| androidApplicationGraph | APK/manifest/resource graph | Not assessed |
| apkSignature | APK signing-block and certificate parsing | Not assessed |
| apktool | Apktool Java runtime and framework resources | Not assessed |
| appleApplicationGraph | Mach-O/iOS application formats; no iOS execution assumed | Not assessed |
| appleIps | Apple IPS crash reports and format-only analysis | Not assessed |
| applicationWorkflows | Portable workflow/evidence logic | Not assessed |
| artifactGraph | Local artifact graph and persistence | Not assessed |
| artifactResources | Sandboxed files, lifecycle and cleanup | Not assessed |
| binaryLayout | Binary parsing and native helper dependencies | Not assessed |
| browserObservation | Chromium/WebView debugging and CDP | Not assessed |
| browserScenarioCapture | Chromium package, process model and capture | Not assessed |
| byteEntropy | Portable byte analysis | Not assessed |
| cutter | Cutter/Rizin desktop UI and headless engine availability | Not assessed |
| desktopApplication | Desktop application formats; analysis-only paths | Not assessed |
| devicetree | Portable device-tree parsers | Not assessed |
| electronActiveObservation | Electron-specific live runtime; desktop-only boundary | Not assessed |
| electronFuses | ASAR/Electron metadata parsing | Not assessed |
| electronObservation | Electron/CDP runtime availability | Not assessed |
| elfNotes | ELF parsing | Not assessed |
| erlangBeam | BEAM parser/runtime dependencies | Not assessed |
| evmInterface | EVM bytecode/interface analysis | Not assessed |
| firmwareAnalysis | Binwalk/unblob and native helper binaries | Not assessed |
| flutter | Flutter snapshot/kernel/AOT parsers and helper binaries | Not assessed |
| fridaInstrumentation | Android Frida server/gadget, ABI, root/debuggable targets | Not assessed |
| gdbSessions | GDB Android build, ptrace policy and debug permissions | Not assessed |
| ghidra | Ghidra headless, JVM, memory/storage footprint and license | Not assessed |
| goBinary | Go binary metadata parsing | Not assessed |
| gpuCodeObjects | GPU vendor formats and unavailable desktop SDKs | Not assessed |
| harmonyApplicationGraph | HarmonyOS package formats | Not assessed |
| hopper | Hopper macOS-only provider; preserve analysis contract and report platform restriction | Not assessed |
| ida | IDA vendor runtime/license and Android availability | Not assessed |
| il2cppMetadata | Portable metadata parsing and native helper dependencies | Not assessed |
| javascriptApplication | Portable JS/ASAR static analysis | Not assessed |
| javascriptRecovery | JavaScript recovery tools and Node compatibility | Not assessed |
| javascriptRuntimeObservation | V8 inspector and process/runtime availability | Not assessed |
| javascriptRuntimeReconciliation | Portable evidence reconciliation | Not assessed |
| jeb | JEB vendor runtime/license and Android availability | Not assessed |
| kernelModule | Linux/Android kernel module formats; no kernel loading assumed | Not assessed |
| kuna | Vendor runtime/license and platform availability | Not assessed |
| managedStatic | .NET metadata/IL parsers and runtime dependencies | Not assessed |
| managedWorkflow | Portable managed-code workflows | Not assessed |
| modelArtifact | Model metadata and artifact parsing | Not assessed |
| nativeExports | ELF/PE/Mach-O export parsing | Not assessed |
| nativeMacOS | macOS-only runtime operations; retain static format analysis where possible | Not assessed |
| packetCapture | Android VPNService capture, pcap parsing and user consent | Not assessed |
| pcap | Portable PCAP parsing; live capture permission boundary | Not assessed |
| peCertificates | Portable PE certificate parsing | Not assessed |
| peImports | Portable PE import parsing | Not assessed |
| peLoadConfig | Portable PE load-config parsing | Not assessed |
| peResources | Portable PE resource parsing | Not assessed |
| pythonPyc | Python bytecode parsing and Python runtime | Not assessed |
| recordedCrash | Portable crash dump parsing | Not assessed |
| reverseEngineering | Core orchestration and evidence services | Not assessed |
| rizinDebugSessions | Rizin build, ptrace and debugger permissions | Not assessed |
| rustBinary | Rust binary metadata parsing | Not assessed |
| signalRecording | USB/OTG hardware and Android device permissions | Not assessed |
| sqliteDatabase | SQLite parsing/querying in app sandbox | Not assessed |
| wasmArtifact | WASM parsing and WABT native binaries | Not assessed |
| webModuleTrace | Portable web bundle/source-map analysis | Not assessed |
| webNetworkCapture | Android VPNService/PCAP permissions and capture | Not assessed |
| webRuntime | Embedded Chromium/WebView and inspector access | Not assessed |
| webScriptExport | Portable JavaScript extraction | Not assessed |
| webSourceLocation | Portable source-map and location analysis | Not assessed |

## Required application architecture

1. **One installed application.** Replace the remote-endpoint prototype with an Android-native host and an embedded engine. No LAN IP or separately running MCP server in the normal flow.
2. **Embedded runtime.** Package a pinned Android/Bionic Node runtime for each shipped ABI (initial target: arm64-v8a), the compiled REA runtime, production dependencies, generated tool catalog, and required data files. Validate Node's actual version against the repository engine range.
3. **Native process adapter.** Replace desktop process-group/job assumptions with Android process ownership, cancellation, bounded output capture, cleanup, and app lifecycle handling. Never shell out to an assumed Windows executable.
4. **Provider adapters.** Every external provider must declare Android ABI support, bundled/runtime dependency, permission needs, license, readiness probe, and tested operations.
5. **Private workspace.** Use app-private storage for APK imports, extracted workspaces, temporary files, evidence, and logs. Integrate Android's Storage Access Framework for user-selected files; do not request broad storage access without need.
6. **Tool UX.** Build forms from the original JSON input schemas, show all original tool names/descriptions, provider readiness, progress/cancellation, evidence, errors and export.
7. **No fake green checks.** Unsupported providers stay visible as Restricted/Not assessed with a precise explanation. Tool calls must return real provider results or real capability errors.
8. **Supply chain.** Pin runtime/tool versions, preserve upstream MIT notices, record third-party licenses and checksums, and exclude any binary that cannot legally be redistributed.

## Porting order

- **Stage A — runtime foundation:** Android app host, embedded Node, local engine lifecycle, app-private workspaces, tool catalog, process/cleanup adapter.
- **Stage B — portable analysis:** core workflows, evidence/artifacts, APK/DEX, signatures, SQLite, PE/ELF/Mach-O format readers, JS/ASAR, WASM, firmware parsers that do not require unsupported native executables.
- **Stage C — Android-native integrations:** ADB, JADX bridge, Frida, Chromium/WebView, VPNService packet capture and supported hardware interfaces.
- **Stage D — large/vendor engines:** Ghidra, Rizin, GDB, Binwalk, WABT, Python and other native runtimes; validate each engine's Android build, ABI, license and resource cost before inclusion.
- **Stage E — desktop/vendor-only providers:** preserve schemas and static-analysis portions; implement an Android-equivalent only when technically and legally possible. Otherwise label the exact restriction rather than pretending the desktop binary can run.

## Acceptance criteria

- Fresh install on a physical Android device; airplane mode enabled after install.
- No IP/endpoint setup, external web page, second device, Termux app, or remote server needed for local capabilities.
- Engine starts from the app and reports its exact Node/runtime build.
- All 66 capability groups and the full original tool catalog remain discoverable.
- A test matrix records pass/fail/restricted per operation, ABI, Android API level and provider version.
- Import and analyze a real APK using local tools; cancel an operation; relaunch; verify workspace cleanup and retained evidence.
- APK size, memory, CPU, battery and storage are measured. Optional large engines may be separate in-app downloadable packs only if they remain installed and managed by the app; core operation must not require a remote engine.
- CI builds a signed/debug APK and runs device/emulator smoke tests. No APK is declared ready until these checks pass.
