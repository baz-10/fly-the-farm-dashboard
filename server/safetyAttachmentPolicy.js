const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/;

function isAllowedAttachmentType(contentType) {
  return ALLOWED_ATTACHMENT_TYPES.has(String(contentType || '').toLowerCase());
}

function assertAttachmentSize(size) {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachments must be between 1 byte and 3 MiB.');
  }
}

function assertSafeIdentifier(value) {
  const candidate = String(value || '');
  if (!SAFE_IDENTIFIER.test(candidate) || candidate === '.' || candidate === '..') {
    throw new Error('Attachment path identifier is invalid.');
  }
  return candidate;
}

function sanitiseAttachmentFileName(fileName) {
  const leaf = String(fileName || '')
    .replace(/\0/g, '')
    .split(/[\\/]/)
    .pop()
    ?.trim()
    .replace(/[^A-Za-z0-9._() -]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180);
  return leaf || 'attachment';
}

function buildAttachmentPath(tenantId, planId, versionId, attachmentId, fileName) {
  return [
    tenantId,
    planId,
    versionId,
    attachmentId,
  ].map(assertSafeIdentifier).concat(sanitiseAttachmentFileName(fileName)).join('/');
}

module.exports = {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  assertAttachmentSize,
  assertSafeIdentifier,
  buildAttachmentPath,
  isAllowedAttachmentType,
  sanitiseAttachmentFileName,
};
