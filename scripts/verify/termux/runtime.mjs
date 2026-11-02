#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { Worker } from "node:worker_threads";

const packageJson = JSON.parse(
  await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
);
const version = process.versions.node;
const [major, minor, patch] = version.split(".").map(Number);
const supported =
  (major === 22 && (minor > 23 || (minor === 23 && patch >= 4))) ||
  (major === 24 && (minor > 22 || (minor === 22 && patch >= 1))) ||
  major > 26 ||
  (major === 26 && (minor > 12 || (minor === 12 && patch >= 1)));
assert.equal(process.platform, "android", "Expected the Android/Bionic Node build");
assert.ok(supported, `Node ${version} is outside REA's engine range`);
assert.match(packageJson.engines.node, /22\.23\.4/);
assert.ok(["arm64", "x64", "arm", "ia32"].includes(process.arch));

const workspace = await mkdtemp(join(tmpdir(), "rea-android-runtime-"));
try {
  const file = join(workspace, "runtime-check.txt");
  await writeFile(file, randomUUID(), "utf8");
  assert.match(await readFile(file, "utf8"), /^[0-9a-f-]{36}$/i);

  const child = spawn(
    process.execPath,
    ["-e", "process.stdout.write('child-process-ok')"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => (stdout += chunk));
  const [code, signal] = await once(child, "exit");
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(stdout, "child-process-ok");

  const worker = new Worker(
    "const { parentPort } = require('node:worker_threads'); parentPort.postMessage('worker-ok')",
    { eval: true },
  );
  const [workerMessage] = await once(worker, "message");
  assert.equal(workerMessage, "worker-ok");
  await worker.terminate();

  const server = createServer((_request, response) => response.end("loopback-ok"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(await response.text(), "loopback-ok");
  } finally {
    server.close();
    await once(server, "close");
  }

  console.log(
    JSON.stringify({
      status: "passed",
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      checks: [
        "REA engine-version range",
        "Bionic filesystem access",
        "child_process spawn and exit",
        "worker_threads",
        "localhost HTTP",
        "crypto.randomUUID",
      ],
    }),
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}
