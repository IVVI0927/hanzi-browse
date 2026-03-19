/**
 * Managed API Server
 *
 * REST API for external clients to run browser tasks.
 * Enforces: API key auth, workspace ownership, browser session validation.
 *
 * Endpoints:
 *   POST   /v1/browser-sessions/pair     - Create a pairing token
 *   POST   /v1/browser-sessions/register - Exchange pairing token for session
 *   GET    /v1/browser-sessions          - List sessions for workspace
 *   POST   /v1/tasks                     - Start a task (requires browser_session_id)
 *   GET    /v1/tasks/:id                 - Get task status/result
 *   POST   /v1/tasks/:id/cancel          - Cancel a running task
 *   GET    /v1/tasks                     - List tasks for workspace
 *   GET    /v1/usage                     - Get usage summary
 *   POST   /v1/api-keys                  - Create an API key (self-serve)
 *   GET    /v1/api-keys                  - List API keys for workspace
 *   DELETE /v1/api-keys/:id              - Delete an API key
 *   GET    /v1/health                    - Health check (no auth)
 */

import { createServer, IncomingMessage, ServerResponse } from "http";
import { randomUUID } from "crypto";
import {
  runAgentLoop,
  type AgentLoopResult,
  type ToolResult,
} from "../agent/loop.js";
import type { WebSocketClient } from "../ipc/websocket-client.js";
import * as fileStore from "./store.js";
import type { ApiKey } from "./store.js";
import { createAuth, resolveSessionToWorkspace } from "./auth.js";
import { initBilling, isBillingEnabled, createCheckoutSession, handleWebhook } from "./billing.js";

// Active store module — defaults to file store, can be swapped to Postgres via setStoreModule()
let S: typeof fileStore = fileStore;

/**
 * Swap the backing store (e.g., to Postgres). Called by deploy.ts when DATABASE_URL is set.
 */
export function setStoreModule(storeModule: typeof fileStore): void {
  S = storeModule;
}

let isSessionConnectedFn: ((id: string) => boolean) | null = null;

// --- State ---

let relayConnection: WebSocketClient | null = null;
const taskAborts = new Map<string, AbortController>();
/** Maps taskRunId → { workspaceId, startedAt } for concurrent task counting + stuck detection */
const taskWorkspaceMap = new Map<string, { workspaceId: string; startedAt: number }>();
const pendingToolExec = new Map<
  string,
  {
    resolve: (result: ToolResult) => void;
    reject: (err: Error) => void;
    timeout: NodeJS.Timeout;
    browserSessionId: string;
    createdAt: number;
  }
>();

// --- Rate Limiting ---

/** Per-workspace rate limit: max task creations in a sliding window */
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_TASKS = 10;     // max 10 task creations per minute per workspace
const MAX_CONCURRENT_TASKS = 5;      // max 5 running tasks per workspace simultaneously

interface RateBucket {
  timestamps: number[];
}

const rateBuckets = new Map<string, RateBucket>();

function checkRateLimit(workspaceId: string): boolean {
  const now = Date.now();
  let bucket = rateBuckets.get(workspaceId);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateBuckets.set(workspaceId, bucket);
  }
  // Purge old entries outside the window
  bucket.timestamps = bucket.timestamps.filter(
    (t) => now - t <= RATE_LIMIT_WINDOW_MS
  );
  if (bucket.timestamps.length >= RATE_LIMIT_MAX_TASKS) {
    return false; // Rate limit exceeded
  }
  bucket.timestamps.push(now);
  return true;
}

function countConcurrentTasks(workspaceId: string): number {
  let count = 0;
  for (const [, entry] of taskWorkspaceMap) {
    if (entry.workspaceId === workspaceId) count++;
  }
  return count;
}

// Periodic cleanup of stale rate limit buckets (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, bucket] of rateBuckets) {
    bucket.timestamps = bucket.timestamps.filter(
      (t) => now - t < RATE_LIMIT_WINDOW_MS
    );
    if (bucket.timestamps.length === 0) rateBuckets.delete(id);
  }
}, 5 * 60_000);

// Periodic cleanup of stale pendingToolExec entries (orphans from crashed tasks/disconnects)
const MAX_PENDING_AGE_MS = 2 * 35_000; // 2× max tool timeout (70s)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [requestId, pending] of pendingToolExec) {
    if (now - pending.createdAt > MAX_PENDING_AGE_MS) {
      clearTimeout(pending.timeout);
      pendingToolExec.delete(requestId);
      pending.reject(new Error(`Tool execution orphaned (cleanup sweep): ${requestId}`));
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.error(`[API] Cleaned up ${cleaned} orphaned pending tool executions`);
  }
}, 30_000); // Run every 30s

// Stuck-task janitor: abort and mark tasks that have been running longer than the timeout.
// Catches: leaked abort controllers, updateTaskRun failures, agent loop hangs.
const STUCK_TASK_THRESHOLD_MS = 35 * 60 * 1000; // 35 minutes (TASK_TIMEOUT_MS=30m + 5m buffer)
setInterval(async () => {
  try {
    const now = Date.now();
    for (const [taskId, entry] of taskWorkspaceMap) {
      if (now - entry.startedAt > STUCK_TASK_THRESHOLD_MS) {
        // Task has been running too long — abort and mark as error
        const abort = taskAborts.get(taskId);
        if (abort) abort.abort();
        try {
          await S.updateTaskRun(taskId, {
            status: "error",
            answer: "Task exceeded maximum duration (janitor cleanup).",
            completedAt: now,
          });
        } catch {}
        taskAborts.delete(taskId);
        taskWorkspaceMap.delete(taskId);
        console.error(`[API] Janitor: cleaned up stuck task ${taskId} (running ${Math.round((now - entry.startedAt) / 60000)}m)`);
      } else if (!taskAborts.has(taskId)) {
        // Task finished but map entry leaked — clean up
        taskWorkspaceMap.delete(taskId);
      }
    }
  } catch (err: any) {
    console.error("[API] Stuck-task janitor error:", err.message);
  }
}, 5 * 60_000); // Run every 5 minutes

/**
 * Fail all pending tool executions for a disconnected browser session.
 * Called by the relay when a managed session WebSocket closes.
 * This avoids the agent loop waiting up to 15-35s for a timeout on each tool.
 */
export function onSessionDisconnected(browserSessionId: string): void {
  let failed = 0;
  for (const [requestId, pending] of pendingToolExec) {
    if (pending.browserSessionId === browserSessionId) {
      clearTimeout(pending.timeout);
      pendingToolExec.delete(requestId);
      pending.reject(new Error(`Browser session ${browserSessionId} disconnected`));
      failed++;
    }
  }
  if (failed > 0) {
    console.error(`[API] Failed ${failed} pending tool executions for disconnected session ${browserSessionId}`);
  }
}

/**
 * Initialize the managed API.
 */
export function initManagedAPI(
  relay: WebSocketClient,
  sessionConnectedCheck?: (id: string) => boolean
): void {
  relayConnection = relay;
  if (sessionConnectedCheck) {
    isSessionConnectedFn = sessionConnectedCheck;
  }
}

/**
 * Handle incoming relay messages (tool results from extension).
 */
export function handleRelayMessage(message: any): boolean {
  if (message?.type === "tool_result" && message.requestId) {
    const pending = pendingToolExec.get(message.requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      pendingToolExec.delete(message.requestId);

      // Persist tab context if reported by extension — only if the browserSessionId
      // matches the session that initiated this tool execution (prevents cross-session writes).
      if (message.tabContext?.tabId && message.tabContext.browserSessionId === pending.browserSessionId) {
        try {
          void Promise.resolve(
            S.updateSessionContext(
              pending.browserSessionId,
              message.tabContext.tabId,
              message.tabContext.windowId
            )
          ).catch(() => {});
        } catch {}
      }

      pending.resolve({
        success: !message.error,
        output: message.result ?? message.output,
        error: message.error,
        screenshot: message.screenshot
          ? { data: message.screenshot, mediaType: "image/jpeg" }
          : undefined,
      });
      return true;
    }
  }
  return false;
}

/**
 * Execute a tool on a specific browser session via the relay.
 * Uses targetSessionId for session-based routing.
 */
async function executeToolViaRelay(
  toolName: string,
  toolInput: Record<string, any>,
  browserSessionId: string
): Promise<ToolResult> {
  if (!relayConnection) {
    throw new Error("Relay not connected");
  }

  const requestId = randomUUID();

  // Per-tool timeout: wait/navigate can take longer; most tools should be fast
  const toolTimeoutMs =
    toolName === "computer" && toolInput?.action === "wait"
      ? 35_000 // wait action: up to 30s + buffer
      : toolName === "navigate"
      ? 30_000 // navigation can be slow on heavy pages
      : 15_000; // default: 15s for read_page, find, form_input, etc.

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingToolExec.delete(requestId);
      reject(new Error(`Tool execution timed out after ${toolTimeoutMs / 1000}s: ${toolName}`));
    }, toolTimeoutMs);

    pendingToolExec.set(requestId, { resolve, reject, timeout, browserSessionId, createdAt: Date.now() });

    // Route to the specific browser session, not "the extension"
    // targetSessionId = relay routing key (consumed by relay)
    // browserSessionId = included in payload so extension knows which session context to use
    relayConnection!.send({
      type: "mcp_execute_tool",
      requestId,
      targetSessionId: browserSessionId,
      browserSessionId,
      tool: toolName,
      input: toolInput,
    } as any);
  });
}

// --- Auth ---

function extractApiKey(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

async function authenticate(req: IncomingMessage): Promise<ApiKey | null> {
  // Try API key first (developer SDK path)
  const key = extractApiKey(req);
  if (key) {
    return S.validateApiKey(key) as any;
  }

  // Try Better Auth session cookie (first-party app path)
  const sessionInfo = await resolveSessionToWorkspace(req);
  if (sessionInfo) {
    // Return a synthetic ApiKey-like object for the session user
    return {
      id: sessionInfo.userId,
      key: "",
      name: "session",
      workspaceId: sessionInfo.workspaceId,
      createdAt: Date.now(),
    };
  }

  return null;
}

// --- Handlers ---

const MAX_TASK_LEN = 10_000;
const MAX_CONTEXT_LEN = 50_000;
const MAX_URL_LEN = 2048;
const TASK_TIMEOUT_MS = 30 * 60 * 1000; // 30-minute max per task

async function handleCreateTask(
  body: any,
  apiKey: ApiKey
): Promise<{ status: number; data: any }> {
  const { task, url, context, browser_session_id } = body;

  // --- Input validation first (400 errors don't burn rate limit quota) ---
  if (!task?.trim()) {
    return { status: 400, data: { error: "task is required" } };
  }
  if (typeof task !== "string" || task.length > MAX_TASK_LEN) {
    return { status: 400, data: { error: `task must be a string of 1-${MAX_TASK_LEN} characters` } };
  }
  if (context !== undefined && (typeof context !== "string" || context.length > MAX_CONTEXT_LEN)) {
    return { status: 400, data: { error: `context must be a string under ${MAX_CONTEXT_LEN} characters` } };
  }
  if (url !== undefined) {
    if (typeof url !== "string" || url.length > MAX_URL_LEN) {
      return { status: 400, data: { error: `url must be a string under ${MAX_URL_LEN} characters` } };
    }
    try {
      new URL(url);
    } catch {
      return { status: 400, data: { error: "url must be a valid URL" } };
    }
  }

  // browser_session_id is REQUIRED for managed tasks
  if (!browser_session_id) {
    return {
      status: 400,
      data: { error: "browser_session_id is required. Create one via POST /v1/browser-sessions/pair" },
    };
  }

  // --- Rate limit + concurrency (checked AFTER validation so bad requests don't burn quota) ---
  if (!checkRateLimit(apiKey.workspaceId)) {
    return {
      status: 429,
      data: { error: `Rate limit exceeded. Max ${RATE_LIMIT_MAX_TASKS} tasks per minute.` },
    };
  }

  const running = countConcurrentTasks(apiKey.workspaceId);
  if (running >= MAX_CONCURRENT_TASKS) {
    return {
      status: 429,
      data: { error: `Concurrent task limit reached (${MAX_CONCURRENT_TASKS}). Wait for running tasks to complete.` },
    };
  }

  // Validate session exists and belongs to this workspace
  const session = await S.getBrowserSession(browser_session_id);
  if (!session) {
    return { status: 404, data: { error: "Browser session not found" } };
  }
  if (session.workspaceId !== apiKey.workspaceId) {
    return { status: 403, data: { error: "Browser session does not belong to your workspace" } };
  }

  // Validate session is connected
  const connected = isSessionConnectedFn
    ? isSessionConnectedFn(browser_session_id)
    : session.status === "connected";
  if (!connected) {
    return {
      status: 409,
      data: { error: "Browser session is not connected. The extension must be running and registered." },
    };
  }

  // Check session hasn't expired (relay connectivity alone isn't enough)
  if (session.expiresAt && session.expiresAt < Date.now()) {
    return {
      status: 409,
      data: { error: "Browser session has expired. Re-pair the extension." },
    };
  }

  const taskRun = await S.createTaskRun({
    workspaceId: apiKey.workspaceId,
    apiKeyId: apiKey.id,
    task,
    url,
    context,
    browserSessionId: browser_session_id,
  });

  const abort = new AbortController();
  taskAborts.set(taskRun.id, abort);
  taskWorkspaceMap.set(taskRun.id, { workspaceId: apiKey.workspaceId, startedAt: Date.now() });

  // Task-level timeout — abort if agent loop exceeds max duration
  const taskTimeout = setTimeout(() => {
    abort.abort();
    console.error(`[API] Task ${taskRun.id} timed out after ${TASK_TIMEOUT_MS / 60000} min`);
  }, TASK_TIMEOUT_MS);

  // Run agent loop in background
  runAgentLoop({
    task,
    url,
    context,
    executeTool: (toolName, toolInput) =>
      executeToolViaRelay(toolName, toolInput, browser_session_id),
    onStep: (step) => {
      S.updateTaskRun(taskRun.id, { steps: step.step });
    },
    maxSteps: 50,
    signal: abort.signal,
  })
    .then(async (result: AgentLoopResult) => {
      const status = result.status === "complete" ? "complete" : "error";
      // Record usage BEFORE marking task complete — if this fails, we retry or log.
      // This ordering prevents "complete task with no billing event" scenarios.
      try {
        await S.recordUsage({
          workspaceId: apiKey.workspaceId,
          apiKeyId: apiKey.id,
          taskRunId: taskRun.id,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          apiCalls: result.usage.apiCalls,
          model: result.model || "gemini-2.5-flash",
        });
      } catch (usageErr: any) {
        console.error(`[API] Task ${taskRun.id} usage recording failed:`, usageErr.message);
        // Continue — don't block task completion, but log for reconciliation
      }
      // Retry-safe task status update — if first attempt fails, retry once.
      // Without this, a DB hiccup leaves the task permanently "running".
      let updated = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await S.updateTaskRun(taskRun.id, {
            status,
            answer: result.answer,
            steps: result.steps,
            usage: result.usage,
            completedAt: Date.now(),
          });
          updated = true;
          break;
        } catch (updateErr: any) {
          if (attempt === 0) {
            console.error(`[API] Task ${taskRun.id} status update failed (retrying):`, updateErr.message);
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.error(`[API] Task ${taskRun.id} status update FAILED permanently — task may be stuck in "running":`, updateErr.message);
          }
        }
      }
      if (updated) {
        console.error(`[API] Task ${taskRun.id} ${status}: ${result.steps} steps`);
      }
    })
    .catch(async (err: any) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await S.updateTaskRun(taskRun.id, {
            status: "error",
            answer: `Agent loop crashed: ${err.message}`,
            completedAt: Date.now(),
          });
          break;
        } catch (updateErr: any) {
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 1000));
          } else {
            console.error(`[API] Task ${taskRun.id} error status update FAILED permanently:`, updateErr.message);
          }
        }
      }
      console.error(`[API] Task ${taskRun.id} crashed:`, err.message);
    })
    .finally(() => {
      clearTimeout(taskTimeout);
      taskAborts.delete(taskRun.id);
      taskWorkspaceMap.delete(taskRun.id);
    });

  return {
    status: 201,
    data: {
      id: taskRun.id,
      status: "running",
      task,
      browser_session_id,
      created_at: taskRun.createdAt,
    },
  };
}

// --- HTTP Server ---

const MAX_BODY_BYTES = 128 * 1024; // 128 KB max request body

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    let bytes = 0;
    req.on("data", (chunk: Buffer | string) => {
      bytes += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// Explicit allow-list of origins — production only in production, includes localhost in dev
const ALLOWED_ORIGINS = [
  "https://browse.hanzilla.co",
  "https://api.hanzilla.co",
  ...(process.env.NODE_ENV === "production" ? [] : [
    "http://localhost:3000",
    "http://localhost:5173", // Vite dev server
  ]),
];

/**
 * Send a JSON response with CORS headers.
 * `req` is passed explicitly — no global mutable state. This is safe under concurrent requests.
 */
function sendJson(req: IncomingMessage, res: ServerResponse, status: number, data: any): void {
  const origin = req.headers?.origin || "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Vary: Origin tells caches that the response depends on the Origin header.
    // Without this, a shared cache could serve one origin's CORS headers to another.
    "Vary": "Origin",
  };
  // CORS: only echo back origins from the explicit allow-list.
  // Never use `*` with credentials — browsers reject it per the CORS spec.
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Workspace-Id";
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const { method, url } = req;

  if (method === "OPTIONS") {
    // CORS preflight — return headers with empty body (204 No Content)
    const origin = req.headers?.origin || "";
    const headers: Record<string, string> = { "Vary": "Origin" };
    if (ALLOWED_ORIGINS.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
      headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS";
      headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Workspace-Id";
      headers["Access-Control-Allow-Credentials"] = "true";
      headers["Access-Control-Max-Age"] = "86400";
    }
    res.writeHead(204, headers);
    res.end();
    return;
  }

  try {
    // --- Better Auth routes (/api/auth/*) ---
    if (url?.startsWith("/api/auth")) {
      const auth = createAuth();
      if (auth) {
        // Convert Node.js req/res to Web Request/Response for Better Auth
        const body = await parseBody(req).catch(() => undefined);
        const headers = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (val) headers.set(key, Array.isArray(val) ? val[0] : val);
        }
        const webReq = new Request(`${req.headers.host ? `https://${req.headers.host}` : "http://localhost"}${url}`, {
          method: method || "GET",
          headers,
          body: method !== "GET" && method !== "HEAD" && body ? JSON.stringify(body) : undefined,
        });
        const webRes = await auth.handler(webReq);
        res.writeHead(webRes.status, Object.fromEntries(webRes.headers.entries()));
        const resBody = await webRes.text();
        res.end(resBody);
        return;
      }
      sendJson(req, res, 503, { error: "Auth not configured. Set DATABASE_URL and Google OAuth credentials." });
      return;
    }

    // --- No-auth endpoints ---

    if (method === "GET" && url === "/v1/health") {
      // Check DB connectivity if using Postgres store
      let dbOk = true;
      try {
        // Quick check: list workspaces is a lightweight query
        await S.getWorkspace("health-check-probe");
      } catch {
        dbOk = false;
      }
      const allOk = !!relayConnection && dbOk;
      sendJson(req, res, allOk ? 200 : 503, {
        status: allOk ? "ok" : "degraded",
        relay_connected: !!relayConnection,
        database_connected: dbOk,
        active_tasks: taskAborts.size,
        pending_tool_executions: pendingToolExec.size,
      });
      return;
    }

    // Stripe webhook (no API key — uses Stripe signature verification)
    if (method === "POST" && url === "/v1/billing/webhook") {
      if (!isBillingEnabled()) {
        sendJson(req, res, 503, { error: "Billing not configured" });
        return;
      }
      const rawBody = await new Promise<string>((resolve, reject) => {
        let body = "";
        req.on("data", (chunk: string) => (body += chunk));
        req.on("end", () => resolve(body));
        req.on("error", reject);
      });
      const sig = req.headers["stripe-signature"] as string;
      if (!sig) {
        sendJson(req, res, 400, { error: "Missing stripe-signature header" });
        return;
      }
      const result = await handleWebhook(rawBody, sig);
      sendJson(req, res, result.handled ? 200 : 400, { received: result.handled, event: result.event });
      return;
    }

    // Browser session registration (uses pairing token, not API key)
    if (method === "POST" && url === "/v1/browser-sessions/register") {
      const body = await parseBody(req);
      const { pairing_token } = body;
      if (!pairing_token) {
        sendJson(req, res, 400, { error: "pairing_token is required" });
        return;
      }
      const session = await S.consumePairingToken(pairing_token);
      if (!session) {
        sendJson(req, res, 401, { error: "Invalid, expired, or already consumed pairing token" });
        return;
      }
      sendJson(req, res, 201, {
        browser_session_id: session.id,
        session_token: session.sessionToken,
        workspace_id: session.workspaceId,
      });
      return;
    }

    // --- Authenticated endpoints ---

    const apiKey = await authenticate(req);
    if (!apiKey) {
      sendJson(req, res, 401, {
        error: "Authentication required. Use Authorization: Bearer hic_live_xxx (API key) or sign in at /api/auth/sign-in/social",
      });
      return;
    }

    // --- Browser Sessions ---

    // Create pairing token
    if (method === "POST" && url === "/v1/browser-sessions/pair") {
      const body = await parseBody(req);
      const label = typeof body.label === "string" ? body.label.slice(0, 200) : undefined;
      const externalUserId = typeof body.external_user_id === "string" ? body.external_user_id.slice(0, 200) : undefined;
      const token = await S.createPairingToken(apiKey.workspaceId, apiKey.id, { label, externalUserId });
      sendJson(req, res, 201, {
        pairing_token: token._plainToken,
        expires_at: token.expiresAt,
        expires_in_seconds: Math.round((token.expiresAt - Date.now()) / 1000),
      });
      return;
    }

    // List browser sessions
    if (method === "GET" && url === "/v1/browser-sessions") {
      const sessions = await S.listBrowserSessions(apiKey.workspaceId);
      sendJson(req, res, 200, {
        sessions: sessions.map((s) => ({
          id: s.id,
          status: isSessionConnectedFn ? (isSessionConnectedFn(s.id) ? "connected" : "disconnected") : s.status,
          connected_at: s.connectedAt,
          last_heartbeat: s.lastHeartbeat,
          label: s.label || null,
          external_user_id: s.externalUserId || null,
        })),
      });
      return;
    }

    // --- Tasks ---

    if (method === "POST" && url === "/v1/tasks") {
      const body = await parseBody(req);
      const result = await handleCreateTask(body, apiKey);
      sendJson(req, res, result.status, result.data);
      return;
    }

    if (method === "GET" && url === "/v1/tasks") {
      const tasks = await S.listTaskRuns(apiKey.workspaceId);
      sendJson(req, res, 200, { tasks });
      return;
    }

    const taskMatch = url?.match(/^\/v1\/tasks\/([^/]+)(\/cancel)?$/);
    if (taskMatch) {
      const taskId = taskMatch[1];
      const run = await S.getTaskRun(taskId);

      if (!run) {
        sendJson(req, res, 404, { error: "Task not found" });
        return;
      }

      // Enforce workspace ownership
      if (run.workspaceId !== apiKey.workspaceId) {
        sendJson(req, res, 404, { error: "Task not found" }); // 404, not 403 — don't leak existence
        return;
      }

      if (method === "GET" && !taskMatch[2]) {
        sendJson(req, res, 200, {
          id: run.id,
          status: run.status,
          task: run.task,
          answer: run.answer,
          steps: run.steps,
          usage: run.usage,
          browser_session_id: run.browserSessionId,
          created_at: run.createdAt,
          completed_at: run.completedAt,
        });
        return;
      }

      if (method === "POST" && taskMatch[2] === "/cancel") {
        if (run.status !== "running") {
          sendJson(req, res, 400, { error: "Task is not running" });
          return;
        }
        const abort = taskAborts.get(taskId);
        if (abort) abort.abort();
        await S.updateTaskRun(taskId, { status: "cancelled", completedAt: Date.now() });
        taskAborts.delete(taskId);
        taskWorkspaceMap.delete(taskId);
        sendJson(req, res, 200, { id: taskId, status: "cancelled" });
        return;
      }
    }

    // --- Usage ---

    if (method === "GET" && url === "/v1/usage") {
      const summary = await S.getUsageSummary(apiKey.workspaceId);
      sendJson(req, res, 200, summary);
      return;
    }

    // --- API Keys (self-serve) ---

    if (method === "POST" && url === "/v1/api-keys") {
      const body = await parseBody(req);
      const name = body.name?.trim();
      if (!name || typeof name !== "string" || name.length > 100) {
        sendJson(req, res, 400, { error: "name is required (string, max 100 chars)" });
        return;
      }
      const newKey = await S.createApiKey(apiKey.workspaceId, name);
      sendJson(req, res, 201, {
        id: newKey.id,
        key: newKey.key, // plaintext — shown once
        name: newKey.name,
        created_at: newKey.createdAt,
        workspace_id: newKey.workspaceId,
        _warning: "Save this key now. It will not be shown again.",
      });
      return;
    }

    if (method === "GET" && url === "/v1/api-keys") {
      const keys = await S.listApiKeys(apiKey.workspaceId);
      sendJson(req, res, 200, {
        api_keys: keys.map((k) => ({
          id: k.id,
          key_prefix: k.keyPrefix ? k.keyPrefix + "..." : k.key.slice(0, 12) + "...",
          name: k.name,
          created_at: k.createdAt,
          last_used_at: k.lastUsedAt,
        })),
      });
      return;
    }

    const apiKeyMatch = url?.match(/^\/v1\/api-keys\/([^/]+)$/);
    if (apiKeyMatch && method === "DELETE") {
      const keyId = apiKeyMatch[1];
      const deleted = await S.deleteApiKey(keyId, apiKey.workspaceId);
      if (!deleted) {
        sendJson(req, res, 404, { error: "API key not found" });
        return;
      }
      sendJson(req, res, 200, { id: keyId, deleted: true });
      return;
    }

    // --- Billing ---

    if (method === "POST" && url === "/v1/billing/checkout") {
      if (!isBillingEnabled()) {
        sendJson(req, res, 503, { error: "Billing not configured" });
        return;
      }
      const body = await parseBody(req);
      const session = await createCheckoutSession({
        workspaceId: apiKey.workspaceId,
        userId: apiKey.id,
        email: body.email,
        successUrl: body.success_url || "https://browse.hanzilla.co?checkout=success",
        cancelUrl: body.cancel_url || "https://browse.hanzilla.co?checkout=cancel",
      });
      sendJson(req, res, 200, session);
      return;
    }

    sendJson(req, res, 404, { error: "Not found" });
  } catch (err: any) {
    console.error("[API] Request error:", err.message);
    sendJson(req, res, 500, { error: err.message });
  }
}

export function startManagedAPI(port = 3456): void {
  const host = process.env.NODE_ENV === "production" ? "127.0.0.1" : "0.0.0.0";
  const server = createServer(handleRequest);
  server.listen(port, host, () => {
    console.error(`[Managed API] Listening on http://${host}:${port}`);
  });
}

/**
 * Graceful shutdown: abort all running tasks and update their status.
 * Called on SIGTERM/SIGINT to avoid leaving tasks in a permanent "running" state.
 */
export async function shutdownManagedAPI(): Promise<void> {
  const runningCount = taskAborts.size;
  if (runningCount === 0) return;

  console.error(`[API] Shutting down: aborting ${runningCount} running tasks...`);

  const shutdownPromises: Promise<void>[] = [];
  for (const [taskId, abort] of taskAborts) {
    abort.abort();
    shutdownPromises.push(
      (async () => {
        try {
          await Promise.resolve(
            S.updateTaskRun(taskId, {
              status: "error",
              answer: "Task interrupted by server shutdown.",
              completedAt: Date.now(),
            })
          );
        } catch (err: any) {
          console.error(`[API] Failed to update task ${taskId} on shutdown:`, err.message);
        }
      })()
    );
  }

  await Promise.allSettled(shutdownPromises);
  taskAborts.clear();
  taskWorkspaceMap.clear();
  console.error(`[API] Shutdown complete: ${runningCount} tasks aborted.`);
}
