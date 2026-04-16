import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeSessionStatus, readSessionStatus, deleteSessionFiles } from './session-files.js';

describe('session-files atomic writes', () => {
  const sid = 'test-atomic';
  beforeEach(() => deleteSessionFiles(sid));
  afterEach(() => deleteSessionFiles(sid));

  it('handles 100 concurrent partial writes without corrupting JSON', async () => {
    const writes = Array.from({ length: 100 }, (_, i) =>
      Promise.resolve().then(() => writeSessionStatus(sid, { status: 'running', task: `task ${i}` })),
    );
    await Promise.all(writes);
    const final = readSessionStatus(sid);
    expect(final).not.toBeNull();
    expect(final!.status).toBe('running');
    expect(final!.task).toMatch(/^task \d+$/);
  });
});
