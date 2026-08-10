const crypto = require('crypto');

const CONTROLLED_RECIPIENT = /^info(?:\+sc-onboarding-[a-z0-9][a-z0-9-]{0,95})?@flythefarm\.com\.au$/i;
const HTTPS_LINK = /https:\/\/[^\s"'<>]+/gi;
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_ORIGIN = 'https://gmail.googleapis.com';

function error(statusCode, code) {
  const value = new Error(code);
  value.statusCode = statusCode;
  value.code = code;
  return value;
}

function constantTimeEqual(actual, expected) {
  const actualDigest = crypto.createHash('sha256').update(actual).digest();
  const expectedDigest = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function bearerToken(header) {
  const match = /^Bearer ([^\s]+)$/.exec(String(header || ''));
  return match ? match[1] : '';
}

function controlledRecipient(value) {
  const recipient = String(value || '').trim().toLowerCase();
  if (!CONTROLLED_RECIPIENT.test(recipient)) throw error(400, 'MAILBOX_RECIPIENT_NOT_ALLOWED');
  return recipient;
}

function afterTimestamp(value) {
  const supplied = String(value || '').trim();
  const timestamp = Date.parse(supplied);
  if (!supplied || !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== supplied) {
    throw error(400, 'MAILBOX_AFTER_INVALID');
  }
  return { iso: supplied, timestamp };
}

function decodeBody(data) {
  if (!data || typeof data !== 'string') return '';
  try { return Buffer.from(data, 'base64url').toString('utf8'); } catch { return ''; }
}

function mimeText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const own = decodeBody(payload.body?.data);
  const child = Array.isArray(payload.parts) ? payload.parts.map(mimeText).join('\n') : '';
  return `${own}\n${child}`;
}

function cleanHttpsLink(candidate) {
  const decoded = String(candidate)
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/[),.;]+$/g, '');
  try {
    const url = new URL(decoded);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function extractHttpsLinks(payload) {
  const matches = mimeText(payload).match(HTTPS_LINK) || [];
  return [...new Set(matches.map(cleanHttpsLink).filter(Boolean))];
}

async function responseJson(response, failureCode) {
  if (!response?.ok) throw error(502, failureCode);
  try { return await response.json(); } catch { throw error(502, failureCode); }
}

function requireGmailConfiguration(env) {
  const configuration = {
    clientId: String(env.GOOGLE_MAILBOX_CLIENT_ID || '').trim(),
    clientSecret: String(env.GOOGLE_MAILBOX_CLIENT_SECRET || '').trim(),
    refreshToken: String(env.GOOGLE_MAILBOX_REFRESH_TOKEN || '').trim(),
  };
  if (!configuration.clientId || !configuration.clientSecret || !configuration.refreshToken) {
    throw error(503, 'MAILBOX_PROVIDER_NOT_CONFIGURED');
  }
  return configuration;
}

function createGmailMailboxReader({ env = process.env, fetchImpl = global.fetch } = {}) {
  return async function readMailboxMessages({ recipient, after }) {
    const configuration = requireGmailConfiguration(env);
    if (typeof fetchImpl !== 'function') throw error(503, 'MAILBOX_PROVIDER_NOT_CONFIGURED');

    const tokenBody = new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      refresh_token: configuration.refreshToken,
      grant_type: 'refresh_token',
    });
    const tokenResponse = await fetchImpl(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: tokenBody.toString(),
    });
    const tokenResult = await responseJson(tokenResponse, 'MAILBOX_PROVIDER_AUTH_FAILED');
    const accessToken = String(tokenResult?.access_token || '');
    if (!accessToken) throw error(502, 'MAILBOX_PROVIDER_AUTH_FAILED');

    const afterEpochSeconds = Math.floor(Date.parse(after) / 1000);
    const listUrl = new URL('/gmail/v1/users/me/messages', GMAIL_API_ORIGIN);
    listUrl.searchParams.set('q', `to:${recipient} after:${afterEpochSeconds}`);
    listUrl.searchParams.set('maxResults', '25');
    const gmailHeaders = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
    const listResponse = await fetchImpl(listUrl.toString(), { method: 'GET', headers: gmailHeaders });
    const listResult = await responseJson(listResponse, 'MAILBOX_PROVIDER_READ_FAILED');
    const messages = Array.isArray(listResult?.messages) ? listResult.messages.slice(0, 25) : [];

    const results = [];
    for (const summary of messages) {
      const id = String(summary?.id || '');
      if (!id) continue;
      const messageUrl = new URL(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}`, GMAIL_API_ORIGIN);
      messageUrl.searchParams.set('format', 'full');
      const messageResponse = await fetchImpl(messageUrl.toString(), { method: 'GET', headers: gmailHeaders });
      const message = await responseJson(messageResponse, 'MAILBOX_PROVIDER_READ_FAILED');
      const receivedTimestamp = Number(message?.internalDate);
      if (!Number.isFinite(receivedTimestamp) || receivedTimestamp <= Date.parse(after)) continue;
      const links = extractHttpsLinks(message?.payload);
      if (links.length) results.push({ receivedAt: new Date(receivedTimestamp).toISOString(), links });
    }
    return results;
  };
}

function safeMessages(records, after) {
  const threshold = Date.parse(after);
  if (!Array.isArray(records)) return [];
  return records.flatMap((record) => {
    const receivedTimestamp = Date.parse(String(record?.receivedAt || ''));
    if (!Number.isFinite(receivedTimestamp) || receivedTimestamp <= threshold) return [];
    const links = Array.isArray(record?.links)
      ? [...new Set(record.links.map(cleanHttpsLink).filter(Boolean))]
      : [];
    if (!links.length) return [];
    return [{ receivedAt: new Date(receivedTimestamp).toISOString(), links }];
  }).sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
}

function createOnboardingMailboxHandler({
  env = process.env,
  readMailboxMessages = createGmailMailboxReader({ env }),
} = {}) {
  return async function onboardingMailboxHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        throw error(405, 'MAILBOX_BRIDGE_METHOD_NOT_ALLOWED');
      }
      const forwardedProtocol = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
      if (forwardedProtocol !== 'https') throw error(400, 'MAILBOX_BRIDGE_HTTPS_REQUIRED');

      const expectedToken = String(env.E2E_ONBOARDING_MAILBOX_TOKEN || '');
      const suppliedToken = bearerToken(req.headers?.authorization);
      if (!expectedToken || !suppliedToken || !constantTimeEqual(suppliedToken, expectedToken)) {
        throw error(401, 'MAILBOX_BRIDGE_UNAUTHENTICATED');
      }

      const recipient = controlledRecipient(req.query?.recipient);
      const after = afterTimestamp(req.query?.after);
      const records = await readMailboxMessages({ recipient, after: after.iso });
      return res.status(200).json({ messages: safeMessages(records, after.iso) });
    } catch (caught) {
      const statusCode = Number(caught?.statusCode) || 502;
      const code = String(caught?.code || 'MAILBOX_BRIDGE_UNAVAILABLE');
      return res.status(statusCode).json({ error: { code } });
    }
  };
}

module.exports = {
  createGmailMailboxReader,
  createOnboardingMailboxHandler,
};
