import { describe, expect, it } from 'vitest';

const {
  MAX_ATTACHMENT_BYTES,
  assertAttachmentSize,
  buildAttachmentPath,
  isAllowedAttachmentType,
  sanitiseAttachmentFileName,
} = require('./safetyAttachmentPolicy');

describe('Safety Plan attachment policy', () => {
  it('builds tenant-prefixed paths and strips traversal from file names', () => {
    expect(buildAttachmentPath('tenant-a', 'plan-1', 'v1', 'a1', '../../x.pdf'))
      .toBe('tenant-a/plan-1/v1/a1/x.pdf');
  });

  it.each([
    ['application/pdf', true],
    ['image/jpeg', true],
    ['image/png', true],
    ['text/html', false],
    ['application/javascript', false],
  ])('allows %s = %s', (contentType, allowed) => {
    expect(isAllowedAttachmentType(contentType)).toBe(allowed);
  });

  it('rejects files above 3 MiB before upload', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(3 * 1024 * 1024);
    expect(() => assertAttachmentSize(MAX_ATTACHMENT_BYTES + 1)).toThrow(/3 MiB/);
  });

  it.each(['../secret.pdf', 'a/b.pdf', 'a\\b.pdf', '.pdf', '\0bad.pdf'])(
    'never preserves unsafe path syntax from %j',
    (fileName) => {
      const safe = sanitiseAttachmentFileName(fileName);
      expect(safe).not.toMatch(/[\/\\\0]/);
      expect(safe).not.toBe('');
    },
  );

  it('rejects spoofed path identifiers instead of encoding them', () => {
    expect(() => buildAttachmentPath('../tenant-b', 'p', 'v', 'a', 'x.pdf'))
      .toThrow(/identifier/);
    expect(() => buildAttachmentPath('tenant-a', 'p/x', 'v', 'a', 'x.pdf'))
      .toThrow(/identifier/);
  });
});
