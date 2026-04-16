import { homedir, platform as osPlatform } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { detectCredentialSources, type CredentialSource } from './detect-credentials.js';
import { listSessions } from './session-files.js';
import { isRelayRunning } from '../relay/auto-start.js';
import type { SessionFileStatus } from './session-files.js';
import { getBillingStatus, IS_MANAGED_MODE, MANAGED_DASHBOARD_URL, type BillingStatus } from './managed-client.js';

export interface DoctorReport {
  extensionConnected: boolean;
  relayReachable: boolean;
  credentials: CredentialSource[];
  recentSessions: SessionFileStatus[];
  apiReachable: boolean;
  billing: BillingStatus | null;
}

function keychainHas(service: string): boolean {
  if (osPlatform() !== 'darwin') return false;
  try {
    execSync(`security find-generic-password -s "${service}" -w 2>/dev/null`, { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

export async function runDoctor(): Promise<DoctorReport> {
  const relayReachable = await isRelayRunning();
  const credentials = detectCredentialSources({
    platform: osPlatform(),
    homedir: homedir(),
    fileExists: existsSync,
    keychainHas,
  });
  const recentSessions = listSessions().slice(0, 3);

  let apiReachable = false;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://api.hanzilla.co/v1/health', { signal: controller.signal });
    clearTimeout(t);
    apiReachable = res.status < 500;
  } catch { /* keep false */ }

  const billing = IS_MANAGED_MODE ? await getBillingStatus() : null;

  return {
    extensionConnected: relayReachable, // relay up ≈ extension connected
    relayReachable,
    credentials,
    recentSessions,
    apiReachable,
    billing,
  };
}

export function renderDoctorReport(r: DoctorReport): string {
  const sym = (ok: boolean) => ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  const lines: string[] = [];

  lines.push('');
  lines.push('  Hanzi Browse — doctor');
  lines.push('');
  lines.push(`  ${sym(r.extensionConnected)}  Chrome Extension ${r.extensionConnected ? 'connected' : 'NOT connected'}`);
  lines.push(`  ${sym(r.relayReachable)}  Relay ${r.relayReachable ? 'reachable on ws://localhost:7862' : 'NOT reachable'}`);

  if (r.credentials.length) {
    lines.push(`  ${sym(true)}  Credentials found (${r.credentials.length}):`);
    for (const c of r.credentials) {
      lines.push(`        - ${c.name} (${c.path})`);
    }
  } else {
    lines.push(`  ${sym(false)}  No credentials found. Set HANZI_API_KEY, ANTHROPIC_API_KEY, or run \`claude login\`.`);
  }

  if (r.billing) {
    const ok = r.billing.free_remaining > 0 || r.billing.credit_balance > 0;
    const totalTasks = r.billing.free_remaining + r.billing.credit_balance;
    lines.push(`  ${sym(ok)}  Managed tasks available: ${r.billing.free_remaining} free + ${r.billing.credit_balance} credits (${totalTasks} total)`);
    if (!ok) {
      lines.push(`        ⚠️  Out of credits. Add more at ${MANAGED_DASHBOARD_URL}`);
    } else if (r.billing.free_remaining <= 3 && r.billing.credit_balance === 0) {
      lines.push(`        ⚠️  Low on free tasks (${r.billing.free_remaining}/${r.billing.free_tasks_per_month}). Add credits at ${MANAGED_DASHBOARD_URL}`);
    }
  }

  lines.push(`  ${sym(r.apiReachable)}  api.hanzilla.co ${r.apiReachable ? 'reachable' : 'NOT reachable (may not affect BYOM mode)'}`);

  if (r.recentSessions.length) {
    lines.push('');
    lines.push('  Recent sessions:');
    for (const s of r.recentSessions) {
      lines.push(`        ${s.session_id}  ${s.status.padEnd(10)}  ${(s.task || '').slice(0, 55)}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}
