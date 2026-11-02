# REA Mobile

An Android-first React Native client for the **original REA MCP engine**. This is not a replacement or mock implementation of REA: it connects to the real REA HTTP transport and reads the live tool catalog with `tools/list`, then invokes selected original tools with `tools/call`.

## Current state

- Android application shell with Arabic RTL-oriented UI.
- Connects to REA's Streamable HTTP MCP endpoint (`/mcp`).
- Initializes an MCP session, retrieves the complete advertised tool catalog, and invokes tools using their original JSON input contracts.
- Displays the actual tool response, including structured content when returned.
- Search/filter over the live catalog.

## Important architecture constraint

The REA repository is a Node.js 22+ MCP server and CLI. The Android app is the native mobile client; the analysis engine remains the original REA process. Start REA in HTTP mode in a trusted environment:

```bash
npx rea-agents@latest mcp --http --host 0.0.0.0 --port 3000 --allowed-hosts <PHONE_OR_LAN_HOST>
```

Then enter the reachable endpoint in the app, for example `http://192.168.1.20:3000/mcp`. The exact allowed host configuration must match the Host/Origin checks described in the root `docs/mcp-contracts.md`.

**Security:** REA's current HTTP transport is plain HTTP without authentication or TLS. Do not expose it to the public internet. Use a private trusted network or a properly secured tunnel/gateway. Do not put credentials or sensitive target data on an untrusted connection.

## Run the Android app

Requires Node.js/npm and Android build tooling or Expo Go for development.

```bash
cd mobile
npm install
npx expo start
```

Scan the Expo QR code with Expo Go, or use an Android emulator. For the Android emulator, `10.0.2.2` maps to the host computer's localhost.

## Capability boundaries

The app exposes the original REA tool catalog; a tool only succeeds when its required target, provider, permissions and host software are available to the REA engine. Some REA workflows depend on external desktop tools such as Ghidra, Hopper, IDA, JADX, Frida, or platform-specific bridges. A phone UI cannot make those host dependencies run natively on Android by itself. Those capabilities must be provided by a compatible REA host or separately validated Android/Termux support. Unsupported tools must report their real REA diagnostic rather than pretend to have completed analysis.

The next mobile milestones are guided target import, schema-driven forms for tool inputs, progress/cancellation, evidence browsing/export, provider readiness/doctor screens, and secure authenticated transport.
