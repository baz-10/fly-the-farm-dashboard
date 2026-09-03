const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PROTECTED_DIAGNOSTIC = /(?:authorization|bearer|password|secret|service[_ -]?role|api[_ -]?key|private[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token|connection[_ -]?string)/i;
const CREDENTIAL_VALUE = /(?:\bsk-[A-Za-z0-9_-]{8,}\b|\bgh[pousr]_[A-Za-z0-9_]{8,}\b|\bgithub_pat_[A-Za-z0-9_]{8,}\b|\bya29\.[A-Za-z0-9_-]{8,}\b|\bAIza[A-Za-z0-9_-]{8,}\b|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b)/;

function protectedValue(value) {
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
  return hasControlCharacter || PROTECTED_DIAGNOSTIC.test(value) || CREDENTIAL_VALUE.test(value);
}

function safeCode(value) {
  return typeof value === 'string' && SAFE_ERROR_CODE.test(value) && !protectedValue(value) ? value : undefined;
}

function safeMessage(value) {
  if (typeof value !== 'string') return undefined;
  const message = value.trim();
  return message && message.length <= 240 && !protectedValue(message) ? message : undefined;
}

function safeCorrelationId(value) {
  if (value === undefined) return undefined;
  return typeof value === 'string' && SAFE_CORRELATION_ID.test(value) && !protectedValue(value) ? value : null;
}

function boundedPublicDiagnostics(candidate, fallback) {
  const code = safeCode(candidate?.code);
  const message = safeMessage(candidate?.message);
  const correlationId = safeCorrelationId(candidate?.correlationId);
  if (!code || !message || correlationId === null) {
    return {
      code: safeCode(fallback?.code) || 'PUBLIC_ERROR',
      message: safeMessage(fallback?.message) || 'Request failed.',
      correlationId: undefined,
    };
  }
  return { code, message, correlationId };
}

module.exports = { boundedPublicDiagnostics };
