import { describe, it, expect } from 'vitest';
import { checkCredentialFlowResult } from '../src/cli/detect-credentials.js';

describe('checkCredentialFlowResult', () => {
  it('returns error when sources exist but none were imported', () => {
    const result = checkCredentialFlowResult({
      sourcesDetected: 2,
      anyImported: false,
      manualEntryChosen: false,
    });

    expect(result).toContain('No credentials configured');
  });

  it('returns null when a source was imported', () => {
    const result = checkCredentialFlowResult({
      sourcesDetected: 2,
      anyImported: true,
      manualEntryChosen: false,
    });

    expect(result).toBeNull();
  });

  it('returns null when user chose manual entry', () => {
    const result = checkCredentialFlowResult({
      sourcesDetected: 1,
      anyImported: false,
      manualEntryChosen: true,
    });

    expect(result).toBeNull();
  });

  it('returns null when no sources were detected', () => {
    const result = checkCredentialFlowResult({
      sourcesDetected: 0,
      anyImported: false,
      manualEntryChosen: false,
    });

    expect(result).toBeNull();
  });
});
