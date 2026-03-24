/**
 * Tool definitions for server-side managed agent loop.
 *
 * These mirror the extension's tool definitions but are used by the server
 * when driving the agent loop via Vertex AI. The extension receives
 * tool execution requests and returns results.
 */
import type { Tool } from "../llm/client.js";
export declare const AGENT_TOOLS: Tool[];
