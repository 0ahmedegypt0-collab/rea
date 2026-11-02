import ReaRuntime from "../modules/rea-runtime/src";

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
  async connect(): Promise<void> {
    await ReaRuntime.startMcp();
  }

  async listTools(): Promise<McpTool[]> {
    const response = JSON.parse(await ReaRuntime.listTools()) as { tools?: McpTool[] };
    return response.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpReply> {
    const result = JSON.parse(await ReaRuntime.callTool(name, JSON.stringify(args)));
    return { result };
  }

  async disconnect(): Promise<void> {
    await ReaRuntime.stopMcp();
  }
}
