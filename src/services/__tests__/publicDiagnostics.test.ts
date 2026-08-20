import { boundedPublicDiagnostics } from '../publicDiagnostics';

const fallback = { code: 'GENERIC_ERROR', message: 'Request failed.' };

describe('browser bounded public diagnostics', () => {
  test('retains one fully safe bounded tuple', () => {
    expect(boundedPublicDiagnostics({ code: 'VERSION_CONFLICT', message: 'The record changed.', correlationId: 'request-safe-123' }, fallback))
      .toEqual({ code: 'VERSION_CONFLICT', message: 'The record changed.', correlationId: 'request-safe-123' });
  });

  test.each([
    { code: 'BAD\nCODE', message: 'Safe.', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'line one\nline two', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'Safe.', correlationId: 'unsafe\tref' },
    { code: 'A'.repeat(65), message: 'Safe.', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'x'.repeat(241), correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'Safe.', correlationId: 'r'.repeat(129) },
    { code: { nested: true }, message: 'Safe.', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: ['private'], correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'Safe.', correlationId: { nested: true } },
    { code: 'SAFE_CODE', message: 'password=do-not-display', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'Provider returned ya29.AbCdEf1234567890', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'Safe.', correlationId: 'gho_AbCdEf1234567890' },
    { code: 'SAFE_CODE', message: 'Provider returned github_pat_AbCdEf1234567890', correlationId: 'safe-reference' },
    { code: 'SAFE_CODE', message: 'Safe.', correlationId: 'ASIAABCDEFGHIJKLMNOP' },
  ])('replaces the whole tuple when a diagnostic is unsafe', (candidate) => {
    expect(boundedPublicDiagnostics(candidate, fallback)).toEqual({ code: 'GENERIC_ERROR', message: 'Request failed.', correlationId: undefined });
  });
});
