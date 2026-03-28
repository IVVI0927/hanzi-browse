# Sentry + PostHog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add error tracking (Sentry) and product analytics (PostHog) to the local MCP server, managed backend, and dashboard.

**Architecture:** Three telemetry modules — one for local MCP (anonymous, opt-out), one for managed backend (env-var gated), one for dashboard (client-side). All are no-ops when not configured. Local MCP hardcodes public DSNs; managed backend reads from env vars.

**Tech Stack:** `@sentry/node`, `posthog-node` (server), `@sentry/browser`, `posthog-js` (dashboard)

**Spec:** `docs/superpowers/specs/2026-03-28-sentry-posthog-design.md`

---

### Task 1: Install dependencies

**Files:**
- Modify: `server/package.json`
- Modify: `server/dashboard/package.json`

- [ ] **Step 1: Install server dependencies**

```bash
cd server && npm install @sentry/node posthog-node
```

- [ ] **Step 2: Install dashboard dependencies**

```bash
cd server/dashboard && npm install @sentry/browser posthog-js
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json server/dashboard/package.json server/dashboard/package-lock.json
git commit -m "deps: add Sentry and PostHog SDKs"
```

---

### Task 2: Create Sentry and PostHog projects

This task is manual — use the CLIs the user already has installed.

- [ ] **Step 1: Create Sentry projects**

```bash
# Create project for local MCP users
sentry projects create hanzi-mcp --org <your-org> --platform node

# Create project for managed backend
sentry projects create hanzi-managed --org <your-org> --platform node

# Create project for dashboard
sentry projects create hanzi-dashboard --org <your-org> --platform javascript-browser
```

Note the DSN for each project (shown in output or at Settings → Projects → Client Keys).

- [ ] **Step 2: Create PostHog project**

If not already created, create a single PostHog project called `hanzi`. Note the API key from Settings → Project → API Key.

- [ ] **Step 3: Record the keys**

You'll need these values for the next tasks:
- `SENTRY_DSN_MCP` — DSN for hanzi-mcp project (hardcoded in local telemetry)
- `SENTRY_DSN_MANAGED` — DSN for hanzi-managed project (env var on VPS)
- `SENTRY_DSN_DASHBOARD` — DSN for hanzi-dashboard project (hardcoded in dashboard)
- `POSTHOG_API_KEY` — single PostHog project key (hardcoded in local + dashboard, env var on managed)

---

### Task 3: Local MCP telemetry module

**Files:**
- Create: `server/src/telemetry.ts`

- [ ] **Step 1: Create telemetry module**

```typescript
/**
 * Anonymous telemetry for local MCP users.
 *
 * Collects error reports and usage stats to improve Hanzi.
 * Opt out: `hanzi-browse telemetry off` or set DO_NOT_TRACK=1
 *
 * Never sends: task content, URLs, API keys, file paths, PII.
 */

import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";
import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { version } from "../version.js";

const CONFIG_DIR = join(homedir(), ".hanzi-browse");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// Replace with actual DSNs after Task 2
const SENTRY_DSN = "__SENTRY_DSN_MCP__";
const POSTHOG_KEY = "__POSTHOG_API_KEY__";
const POSTHOG_HOST = "https://us.i.posthog.com"; // or eu.i.posthog.com

let posthog: PostHog | null = null;
let anonymousId: string | null = null;
let enabled = false;
let initialized = false;

interface TelemetryConfig {
  telemetry?: boolean;
  anonymousId?: string;
}

function readConfig(): TelemetryConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(config: TelemetryConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function isTelemetryEnabled(): boolean {
  // Env vars override everything
  if (process.env.DO_NOT_TRACK === "1") return false;
  if (process.env.HANZI_TELEMETRY === "0") return false;

  const config = readConfig();
  // Default to true if not explicitly set
  return config.telemetry !== false;
}

export function setTelemetryEnabled(value: boolean): void {
  const config = readConfig();
  config.telemetry = value;
  writeConfig(config);
}

function getAnonymousId(): string {
  const config = readConfig();
  if (config.anonymousId) return config.anonymousId;
  const id = randomUUID();
  config.anonymousId = id;
  if (config.telemetry === undefined) config.telemetry = true;
  writeConfig(config);
  return id;
}

export function initTelemetry(): void {
  if (initialized) return;
  initialized = true;

  enabled = isTelemetryEnabled();
  if (!enabled) return;

  anonymousId = getAnonymousId();

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: "local",
    release: `hanzi-browse@${version}`,
    beforeSend(event) {
      // Strip file paths from stack traces
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.stacktrace?.frames) {
            for (const frame of ex.stacktrace.frames) {
              if (frame.filename) {
                // Keep only the relative path from the package
                const match = frame.filename.match(/hanzi-browse\/(.+)/);
                frame.filename = match ? match[1] : "<scrubbed>";
              }
            }
          }
        }
      }
      // Strip user data
      delete event.user;
      delete event.server_name;
      // Add anonymous ID as tag
      event.tags = { ...event.tags, anonymousId };
      return event;
    },
  });

  Sentry.setTag("os", process.platform);
  Sentry.setTag("node_version", process.version);

  posthog = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 5, flushInterval: 30000 });
}

export function trackEvent(name: string, properties?: Record<string, any>): void {
  if (!enabled || !posthog || !anonymousId) return;
  posthog.capture({
    distinctId: anonymousId,
    event: name,
    properties: {
      version,
      os: process.platform,
      node_version: process.version,
      ...properties,
    },
  });
}

export function captureException(error: Error, context?: Record<string, string>): void {
  if (!enabled) return;
  if (context) Sentry.setContext("extra", context);
  Sentry.captureException(error);
}

export async function shutdownTelemetry(): Promise<void> {
  if (!enabled) return;
  await Promise.all([
    Sentry.close(2000),
    posthog?.shutdown(),
  ]);
}
```

- [ ] **Step 2: Create version export**

Check if `server/src/version.ts` exists. If not, create it:

```typescript
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
export const version: string = pkg.version;
```

- [ ] **Step 3: Commit**

```bash
git add server/src/telemetry.ts server/src/version.ts
git commit -m "feat: add anonymous telemetry module for local MCP"
```

---

### Task 4: Wire telemetry into MCP server

**Files:**
- Modify: `server/src/index.ts`

- [ ] **Step 1: Add init at the top of index.ts**

After the existing imports (around line 15, after the setup delegation block), add:

```typescript
import { initTelemetry, trackEvent, captureException, shutdownTelemetry } from "./telemetry.js";

// Init telemetry early — no-op if opted out
initTelemetry();
trackEvent("mcp_start");
```

- [ ] **Step 2: Add shutdown on process exit**

Find the existing process exit handling (or add at the end of the file):

```typescript
process.on("beforeExit", async () => {
  await shutdownTelemetry();
});
```

- [ ] **Step 3: Add error tracking to task completion**

Find where tasks complete/fail in index.ts. Wrap key error paths with `captureException`. For example, in the `browser_start` tool handler where errors are caught:

```typescript
// In catch blocks for task execution:
captureException(error, { tool: "browser_start" });
```

And for task completion:

```typescript
// After successful task:
trackEvent("task_completed", { steps: result.steps, duration_ms: Date.now() - startTime });

// After failed task:
trackEvent("task_failed", { error_category: categorizeError(error) });
```

Where `categorizeError` returns a generic category (not the full message):

```typescript
function categorizeError(error: Error): string {
  const msg = error.message.toLowerCase();
  if (msg.includes("timeout")) return "timeout";
  if (msg.includes("disconnected")) return "disconnected";
  if (msg.includes("not found")) return "not_found";
  return "unknown";
}
```

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: wire telemetry into MCP server lifecycle"
```

---

### Task 5: Add telemetry CLI commands

**Files:**
- Modify: `server/src/index.ts` (the setup delegation block at the top)

- [ ] **Step 1: Add telemetry subcommand handling**

At the top of `server/src/index.ts`, after the `setup` delegation (around line 4), add:

```typescript
if (process.argv[2] === 'telemetry') {
  const { isTelemetryEnabled, setTelemetryEnabled } = await import('./telemetry.js');
  const sub = process.argv[3];
  if (sub === 'on') {
    setTelemetryEnabled(true);
    console.log('Telemetry enabled. Anonymous usage stats help improve Hanzi.');
  } else if (sub === 'off') {
    setTelemetryEnabled(false);
    console.log('Telemetry disabled. No data will be collected.');
  } else {
    console.log(`Telemetry is ${isTelemetryEnabled() ? 'enabled' : 'disabled'}.`);
    console.log('Usage: hanzi-browse telemetry [on|off]');
  }
  process.exit(0);
}
```

- [ ] **Step 2: Add first-run notice**

In the `initTelemetry()` function in `server/src/telemetry.ts`, after the first config write (in `getAnonymousId` when config doesn't exist yet), print the notice:

```typescript
function getAnonymousId(): string {
  const config = readConfig();
  if (config.anonymousId) return config.anonymousId;
  const id = randomUUID();
  config.anonymousId = id;
  if (config.telemetry === undefined) {
    config.telemetry = true;
    // First run notice — only shown once
    console.error(
      '\x1b[2mHanzi collects anonymous error reports and usage stats to improve the tool.\n' +
      'Run "hanzi-browse telemetry off" to disable.\x1b[0m'
    );
  }
  writeConfig(config);
  return id;
}
```

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts server/src/telemetry.ts
git commit -m "feat: add telemetry CLI commands and first-run notice"
```

---

### Task 6: Managed backend telemetry

**Files:**
- Create: `server/src/managed/telemetry.ts`
- Modify: `server/src/managed/deploy.ts`
- Modify: `server/src/managed/api.ts`

- [ ] **Step 1: Create managed telemetry module**

```typescript
/**
 * Telemetry for the managed backend (api.hanzilla.co).
 * Gated by SENTRY_DSN and POSTHOG_API_KEY env vars — no-op in dev.
 */

import * as Sentry from "@sentry/node";
import { PostHog } from "posthog-node";

let posthog: PostHog | null = null;
let initialized = false;

export function initManagedTelemetry(): void {
  if (initialized) return;
  initialized = true;

  const sentryDsn = process.env.SENTRY_DSN;
  const posthogKey = process.env.POSTHOG_API_KEY;

  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.2,
    });
  }

  if (posthogKey) {
    posthog = new PostHog(posthogKey, {
      host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      flushAt: 10,
      flushInterval: 30000,
    });
  }
}

export function trackManagedEvent(
  name: string,
  workspaceId: string,
  properties?: Record<string, any>
): void {
  if (!posthog) return;
  posthog.capture({
    distinctId: workspaceId,
    event: name,
    properties,
  });
}

export function captureManagedError(
  error: Error,
  context?: Record<string, string>
): void {
  if (context) {
    Sentry.setContext("task", context);
  }
  Sentry.captureException(error);
}

export async function shutdownManagedTelemetry(): Promise<void> {
  await Promise.all([
    Sentry.close(2000),
    posthog?.shutdown(),
  ]);
}
```

- [ ] **Step 2: Wire into deploy.ts**

In `server/src/managed/deploy.ts`, add at the top with other imports:

```typescript
import { initManagedTelemetry, shutdownManagedTelemetry } from "./telemetry.js";
```

In the `main()` function, add as the very first line (before any other init):

```typescript
initManagedTelemetry();
```

Add shutdown on process exit:

```typescript
process.on("SIGTERM", async () => {
  await shutdownManagedTelemetry();
  process.exit(0);
});
```

- [ ] **Step 3: Wire events into api.ts**

In `server/src/managed/api.ts`, add import:

```typescript
import { trackManagedEvent, captureManagedError } from "./telemetry.js";
```

Add event tracking at key points:

In `handleCreateTask` after successful task creation:
```typescript
trackManagedEvent("task_created", apiKey.workspaceId, {
  has_url: !!url,
  has_context: !!context,
});
```

Where task completes (in the agent loop callback or result handler):
```typescript
trackManagedEvent("task_completed", run.workspaceId, {
  steps: run.steps,
  duration_ms: Date.now() - run.createdAt,
  input_tokens: run.inputTokens,
  output_tokens: run.outputTokens,
});
```

Where task fails:
```typescript
trackManagedEvent("task_failed", run.workspaceId, {
  error_category: "llm_error", // or "timeout", "disconnected", etc.
});
captureManagedError(error, {
  task_id: run.id,
  workspace_id: run.workspaceId,
});
```

In the API key creation handler:
```typescript
trackManagedEvent("api_key_created", apiKey.workspaceId);
```

In the pairing token creation handler:
```typescript
trackManagedEvent("pairing_link_generated", apiKey.workspaceId);
```

In the session registration handler:
```typescript
trackManagedEvent("browser_paired", session.workspaceId);
```

- [ ] **Step 4: Commit**

```bash
git add server/src/managed/telemetry.ts server/src/managed/deploy.ts server/src/managed/api.ts
git commit -m "feat: add Sentry + PostHog to managed backend"
```

---

### Task 7: Dashboard telemetry

**Files:**
- Modify: `server/dashboard/src/main.jsx`
- Modify: `server/dashboard/src/App.jsx`

- [ ] **Step 1: Init Sentry and PostHog in main.jsx**

Replace `server/dashboard/src/main.jsx`:

```jsx
import { render } from 'preact';
import * as Sentry from '@sentry/browser';
import posthog from 'posthog-js';
import { App } from './App';
import './style.css';

// Replace with actual values after Task 2
const SENTRY_DSN = '__SENTRY_DSN_DASHBOARD__';
const POSTHOG_KEY = '__POSTHOG_API_KEY__';

if (SENTRY_DSN && !SENTRY_DSN.startsWith('__')) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: location.hostname === 'localhost' ? 'development' : 'production',
  });
}

if (POSTHOG_KEY && !POSTHOG_KEY.startsWith('__')) {
  posthog.init(POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    autocapture: true,
    capture_pageview: true,
    persistence: 'localStorage',
    loaded: (ph) => {
      if (location.hostname === 'localhost') ph.opt_out_capturing();
    },
  });
}

export { posthog };

render(<App />, document.getElementById('app'));
```

- [ ] **Step 2: Identify user and track key events in App.jsx**

In `server/dashboard/src/App.jsx`, add import:

```jsx
import posthog from 'posthog-js';
```

After profile loads successfully (in the `loadProfile` callback or after `setProfile`), identify the user:

```jsx
const loadProfile = useCallback(async () => {
  const r = await api('GET', '/v1/me');
  if (r?.unauthorized) { setNeedsAuth(true); return; }
  if (r?.data) {
    setProfile(r.data);
    // Identify user in PostHog
    if (r.data.user?.email) {
      posthog.identify(r.data.user.id || r.data.user.email, {
        email: r.data.user.email,
        name: r.data.user.name,
      });
    }
  }
}, []);
```

Add event tracking to key user actions. In `GettingStartedTab`:

After copying integration prompt:
```jsx
posthog.capture('integration_prompt_copied');
```

After running a test task:
```jsx
posthog.capture('test_task_run');
```

After clicking "Connect this browser":
```jsx
posthog.capture('connect_browser_clicked');
```

- [ ] **Step 3: Commit**

```bash
git add server/dashboard/src/main.jsx server/dashboard/src/App.jsx
git commit -m "feat: add Sentry + PostHog to dashboard"
```

---

### Task 8: Fill in real DSNs and API keys

**Files:**
- Modify: `server/src/telemetry.ts`
- Modify: `server/dashboard/src/main.jsx`

- [ ] **Step 1: Replace placeholders with real values**

In `server/src/telemetry.ts`, replace:
- `__SENTRY_DSN_MCP__` with the actual DSN from Task 2
- `__POSTHOG_API_KEY__` with the actual PostHog API key

In `server/dashboard/src/main.jsx`, replace:
- `__SENTRY_DSN_DASHBOARD__` with the actual DSN from Task 2
- `__POSTHOG_API_KEY__` with the actual PostHog API key

- [ ] **Step 2: Add env vars to .env.example**

In `.env.example`, add under the Optional section:

```bash
# Sentry (error tracking for managed backend)
# SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# PostHog (product analytics for managed backend)
# POSTHOG_API_KEY=phc_xxx
```

- [ ] **Step 3: Commit**

```bash
git add server/src/telemetry.ts server/dashboard/src/main.jsx .env.example
git commit -m "feat: wire real Sentry DSNs and PostHog API keys"
```

---

### Task 9: Build, publish, and deploy

- [ ] **Step 1: Build everything**

```bash
cd server && npm run build
```

- [ ] **Step 2: Bump version**

```bash
cd server && npm version patch --no-git-tag-version
```

- [ ] **Step 3: Publish to npm**

```bash
cd server && npm publish
```

- [ ] **Step 4: Deploy to VPS**

```bash
ssh root@165.227.120.122 "cd /opt/hanzi-managed && npm install hanzi-browse@latest"
```

Copy the new dashboard and landing files:
```bash
ssh root@165.227.120.122 "cp -r /opt/hanzi-managed/node_modules/hanzi-browse/dist/dashboard/* /opt/hanzi-managed/dist/dashboard/"
```

Add env vars on VPS:
```bash
ssh root@165.227.120.122 "cat >> /opt/hanzi-managed/.env << 'EOF'
SENTRY_DSN=<hanzi-managed DSN from Task 2>
POSTHOG_API_KEY=<PostHog API key from Task 2>
EOF"
```

Restart:
```bash
ssh root@165.227.120.122 "systemctl restart hanzi-managed"
```

- [ ] **Step 5: Commit version bump and push**

```bash
git add server/package.json
git commit -m "bump: v2.2.2 — Sentry + PostHog telemetry"
git push origin main
```

- [ ] **Step 6: Verify**

- Check Sentry dashboard for test events
- Check PostHog dashboard for `mcp_start` event
- Run `npx hanzi-browse telemetry` to verify CLI command works
- Run `npx hanzi-browse telemetry off` and verify no events are sent
