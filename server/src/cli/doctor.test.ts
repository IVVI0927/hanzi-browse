import { describe, it, expect } from 'vitest';
import { renderDoctorReport, type DoctorReport } from './doctor.js';

describe('renderDoctorReport', () => {
  it('renders all checks with status symbols', () => {
    const report: DoctorReport = {
      extensionConnected: true,
      relayReachable: true,
      credentials: [{ name: 'Claude Code', slug: 'claude', path: '/h/.claude/.credentials.json' }],
      recentSessions: [
        { session_id: 'abc', status: 'complete', task: 'find jobs', started_at: '2026-04-16', updated_at: '2026-04-16' },
      ],
      apiReachable: true,
    };
    const out = renderDoctorReport(report);
    expect(out).toContain('✓');
    expect(out).toContain('Extension');
    expect(out).toContain('Claude Code');
    expect(out).toContain('abc');
  });

  it('flags missing credentials as a problem', () => {
    const report: DoctorReport = {
      extensionConnected: true, relayReachable: true,
      credentials: [], recentSessions: [], apiReachable: true,
    };
    const out = renderDoctorReport(report);
    expect(out).toContain('✗');
    expect(out.toLowerCase()).toContain('no credentials');
  });
});
