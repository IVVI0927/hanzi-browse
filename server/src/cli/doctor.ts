import { homedir, platform as osPlatform } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { detectCredentialSources, type CredentialSource } from './detect-credentials.js';
import { listSessions } from './session-files.js';
import { isRelayRunning } from '../relay/auto-start.js';
import type { SessionFileStatus } from './session-files.js';

export interface DoctorReport {
  extensionConnected: boolean;
  relayReachable: boolean;
  credentials: CredentialSource[];
  recentSessions: SessionFileStatus[];
  apiReachable: boolean;
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

  return {
    extensionConnected: relayReachable, // relay up ≈ extension connected
    relayReachable,
    credentials,
    recentSessions,
    apiReachable,
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
