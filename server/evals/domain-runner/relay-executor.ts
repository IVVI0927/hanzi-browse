import WebSocket from "ws";
import { randomUUID } from "crypto";
import type { ToolResult } from "../../src/agent/loop.js";

export interface RelayExecutorOptions {
  relayUrl?: string;          // default ws://localhost:7862
  browserSessionId: string;   // paired session id
  timeoutMs?: number;         // per-tool timeout, default 30s
}

export interface RelayExecutor {
  executeTool: (name: string, input: Record<string, any>) => Promise<ToolResult>;
  close: () => Promise<void>;
}

export async function createRelayExecutor(
  opts: RelayExecutorOptions
): Promise<RelayExecutor> {
  const url = opts.relayUrl ?? "ws://localhost:7862";
  const ws = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });

  const pending = new Map<
    string,
    { resolve: (r: ToolResult) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();

  ws.on("message", (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const { requestId, tool_result } = msg;
    if (!requestId || !pending.has(requestId)) return;
    const p = pending.get(requestId)!;
    clearTimeout(p.timer);
    pending.delete(requestId);
    p.resolve(tool_result ?? { success: false, error: "no tool_result field" });
  });

  return {
    async executeTool(tool, input) {
      const requestId = randomUUID();
      return new Promise<ToolResult>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            pending.delete(requestId);
            reject(new Error(`Tool ${tool} timed out`));
          },
          opts.timeoutMs ?? 30_000
        );
        pending.set(requestId, { resolve, reject, timer });
        ws.send(
          JSON.stringify({
            type: "mcp_execute_tool",
            requestId,
            targetSessionId: opts.browserSessionId,
            browserSessionId: opts.browserSessionId,
            tool,
            input,
          })
        );
      });
    },
    async close() {
      ws.close();
    },
  };
}
