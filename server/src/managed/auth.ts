/**
 * Better Auth Configuration
 *
 * Human auth for the managed platform.
 * - Google sign-in (default)
 * - Email/password (fallback)
 * - Session management
 * - Linked to Hanzi workspace model
 *
 * Better Auth handles: user accounts, sessions, OAuth.
 * Hanzi handles: workspaces, API keys, browser sessions, tasks, billing.
 */

import { betterAuth } from "better-auth";
import pg from "pg";

const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || "";

// Shared pool for workspace provisioning queries (separate from Better Auth's pool)
let provisionPool: pg.Pool | null = null;

function getProvisionPool(): pg.Pool {
  if (!provisionPool) {
    provisionPool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  }
  return provisionPool;
}

// Singleton — created once, reused across all requests
let authInstance: any = null;
let authInitialized = false;

export function createAuth() {
  if (authInitialized) return authInstance;
  authInitialized = true;

  if (!DATABASE_URL) {
    console.error("[Auth] No DATABASE_URL — Better Auth disabled");
    return null;
  }

  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[Auth] FATAL: BETTER_AUTH_SECRET not set. Sessions would be lost on restart. Set this env var before deploying.");
      process.exit(1);
    }
    console.error("[Auth] WARNING: BETTER_AUTH_SECRET not set — sessions will be invalidated on restart");
  }

  authInstance = betterAuth({
    database: new Pool({ connectionString: DATABASE_URL, max: 5 }),
    secret: authSecret,
    baseURL: process.env.BETTER_AUTH_URL || "https://api.hanzilla.co",
    emailAndPassword: {
      enabled: true,
    },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      },
    },
    trustedOrigins: [
      "https://browse.hanzilla.co",
      "https://api.hanzilla.co",
      "http://localhost:3000",
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user: any) => {
            // Auto-provision workspace when a new user is created
            const userId = user.id;
            if (!userId) return;

            const client = await getProvisionPool().connect();
            try {
              await client.query("BEGIN");
              const wsRes = await client.query(
                "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
                [`${user.name || "My"}'s Workspace`]
              );
              const workspaceId = wsRes.rows[0].id;
              await client.query(
                "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
                [workspaceId, userId]
              );
              await client.query("COMMIT");
              console.error(`[Auth] Provisioned workspace ${workspaceId} for user ${userId}`);
            } catch (err: any) {
              await client.query("ROLLBACK").catch(() => {});
              console.error("[Auth] Workspace provisioning error:", err.message);
            } finally {
              client.release();
            }
          },
        },
      },
    },
  });

  console.error("[Auth] Better Auth initialized (singleton)");
  return authInstance;
}

/**
 * Resolve a Better Auth session cookie to workspace info.
 * Returns { userId, workspaceId } or null.
 * Used by API endpoints that accept both API keys and session auth.
 */
export async function resolveSessionToWorkspace(
  req: import("http").IncomingMessage
): Promise<{ userId: string; workspaceId: string } | null> {
  const auth = createAuth();
  if (!auth) return null;

  try {
    // Convert Node req headers to Headers
    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (val) headers.set(key, Array.isArray(val) ? val[0] : val);
    }

    const session = await auth.api.getSession({ headers });
    if (!session?.user?.id) return null;

    // Look up workspace membership
    const db = getProvisionPool();
    // If the request specifies a workspace via header, use that (for multi-workspace users)
    const requestedWs = req.headers["x-workspace-id"] as string | undefined;

    const query = requestedWs
      ? "SELECT workspace_id FROM workspace_members WHERE user_id = $1 AND workspace_id = $2 LIMIT 1"
      : "SELECT workspace_id FROM workspace_members WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1";
    const params = requestedWs ? [session.user.id, requestedWs] : [session.user.id];

    const res = await db.query(query, params);
    if (res.rows.length === 0) return null;

    return {
      userId: session.user.id,
      workspaceId: res.rows[0].workspace_id,
    };
  } catch {
    return null;
  }
}
