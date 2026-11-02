import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";

const packageRoot = resolve(process.env.REA_MCP_PACKAGE_ROOT ?? process.cwd());
const entry = resolve(packageRoot, "scripts/rea.mjs");
const processCwd = resolve(process.env.REA_MCP_CWD ?? packageRoot);
const child = spawn(process.execPath, [entry, "mcp"], {
  cwd: processCwd,
  env: {
    ...process.env,
    REA_MCP_INPUT_SCHEMA_PROFILE: "full",
    REA_MCP_OUTPUT_SCHEMA_PROFILE: "full",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let nextId = 0;
let stderr = "";
const pending = new Map();
const early = new Map();
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    stderr += `\n[unexpected stdout] ${line}`;
    return;
  }
  if (message.id === undefined) return;
  const key = String(message.id);
  const waiter = pending.get(key);
  if (waiter) {
    pending.delete(key);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  } else {
    early.set(key, message);
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk).slice(-16000);
});

child.on("exit", (code, signal) => {
  for (const [key, waiter] of pending) {
    clearTimeout(waiter.timer);
    waiter.reject(
      new Error(
        `MCP process exited before response ${key} (code=${code}, signal=${signal})\n${stderr}`,
      ),
    );
  }
  pending.clear();
});

function request(method, params) {
  const id = ++nextId;
  const key = String(id);
  const response = early.get(key);
  if (response) {
    early.delete(key);
    return Promise.resolve(response);
  }
  const promise = new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      pending.delete(key);
      rejectPromise(
        new Error(`Timed out waiting for MCP ${method}\n${stderr}`),
      );
    }, 60000);
    pending.set(key, { resolve: resolvePromise, reject: rejectPromise, timer });
  });
  child.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
  );
  return promise;
}

try {
  const initialized = await request("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "rea-termux-mcp-smoke", version: "1.0.0" },
  });
  if (initialized.error) throw new Error(JSON.stringify(initialized.error));
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }) + "\n",
  );

  const tools = [];
  let cursor;
  do {
    const listed = await request("tools/list", cursor ? { cursor } : {});
    if (listed.error) throw new Error(JSON.stringify(listed.error));
    const page = listed.result?.tools;
    if (!Array.isArray(page))
      throw new Error(
        "The local REA MCP process returned an invalid tools page",
      );
    tools.push(...page);
    cursor = listed.result?.nextCursor ?? undefined;
  } while (cursor);
  if (tools.length === 0)
    throw new Error("The local REA MCP process returned no tools");
  const names = tools.map((tool) => tool.name);
  if (new Set(names).size !== names.length) {
    throw new Error("The local REA MCP process returned duplicate tool names");
  }
  if (!names.includes("inspect_analysis_settings")) {
    throw new Error(
      "The provider-free REA settings diagnostic tool is missing",
    );
  }
  const diagnostic = await request("tools/call", {
    name: "inspect_analysis_settings",
    arguments: {},
  });
  if (diagnostic.error || diagnostic.result?.isError) {
    throw new Error(
      `The provider-free MCP tool call failed: ${JSON.stringify(diagnostic.error ?? diagnostic.result)}`,
    );
  }
  if (
    !Array.isArray(diagnostic.result?.content) ||
    diagnostic.result.content.length === 0
  ) {
    throw new Error("The provider-free MCP tool call returned no content");
  }

  const catalog = JSON.parse(
    await readFile(resolve(packageRoot, "dist/mcp-catalog-full.json"), "utf8"),
  );
  if (tools.length !== catalog.tools.length) {
    throw new Error(
      `MCP tools/list returned ${tools.length}; full catalog records ${catalog.tools.length}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        status: "passed",
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        protocolVersion: initialized.result?.protocolVersion,
        toolCount: tools.length,
        firstTool: names[0],
      },
      null,
      2,
    ),
  );
} catch (cause) {
  child.kill("SIGTERM");
  throw cause;
} finally {
  child.stdin.end();
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([
      once(child, "exit"),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
    ]);
  }
  if (child.exitCode === null && child.signalCode === null)
    child.kill("SIGKILL");
}
