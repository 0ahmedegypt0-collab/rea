export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpReply = {
  result?: {
    tools?: McpTool[];
    content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  error?: { code?: number; message?: string; data?: unknown };
};

export class ReaMcpClient {
  private sessionId?: string;
  private requestId = 0;
  constructor(private endpoint: string) {}

  private async post(message: Record<string, unknown>, initializing = false): Promise<McpReply> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };
    if (this.sessionId && !initializing) headers["Mcp-Session-Id"] = this.sessionId;

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(message)
    });
    if (!response.ok && response.status !== 202) {
      const detail = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }
    const id = response.headers.get("Mcp-Session-Id");
    if (id) this.sessionId = id;
    if (response.status === 202) return {};

    const body = await response.text();
    if (!body.trim()) return {};
    if (body.includes("event:") || body.includes("data:")) {
      const data = body.split(/\r?\n/).filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trim()).filter(Boolean).join("\n");
      if (!data || data === "[DONE]") return {};
      return JSON.parse(data) as McpReply;
    }
    return JSON.parse(body) as McpReply;
  }

  private nextId(): number {
    this.requestId += 1;
    return this.requestId;
  }

  async connect(): Promise<void> {
    await this.post({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "rea-mobile", version: "0.1.0" }
      }
    }, true);
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listTools(): Promise<McpTool[]> {
    const reply = await this.post({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: "tools/list",
      params: {}
    });
    if (reply.error) throw new Error(reply.error.message ?? "تعذر تحميل قائمة الأدوات");
    return reply.result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpReply> {
    const reply = await this.post({
      jsonrpc: "2.0",
      id: this.nextId(),
      method: "tools/call",
      params: { name, arguments: args }
    });
    if (reply.error) throw new Error(reply.error.message ?? "فشل تنفيذ الأداة");
    return reply;
  }

  async disconnect(): Promise<void> {
    if (!this.sessionId) return;
    await fetch(this.endpoint, {
      method: "DELETE",
      headers: { "Mcp-Session-Id": this.sessionId }
    }).catch(() => undefined);
    this.sessionId = undefined;
  }
}
