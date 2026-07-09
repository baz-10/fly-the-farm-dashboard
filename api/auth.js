const crypto = require('crypto');
const { authenticateRequest, clearSessionCookies, loadProfile, setSessionCookies, toPublicUser } = require('../server/session');
const { createHttpError, supabaseRequest } = require('../server/supabase');

function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function generateInviteCode() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

function assertSameOrigin(req) {
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  if (!origin || !host) return;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw createHttpError(403, 'Cross-origin authentication requests are not allowed.');
  }

  if (originHost !== host) {
    throw createHttpError(403, 'Cross-origin authentication requests are not allowed.');
  }
}

async function signIn(email, password) {
  return supabaseRequest('auth/v1/token?grant_type=password', {
    method: 'POST',
    keyType: 'anon',
    body: JSON.stringify({ email, password }),
    publicMessage: 'Invalid email or password.',
  });
}

async function findContractor(inviteCode) {
  const rows = await supabaseRequest(
    `rest/v1/ftf_profiles?invite_code=eq.${encodeURIComponent(inviteCode)}&role=eq.contractor&select=user_id,tenant_id&limit=1`,
    { publicMessage: 'Contractor code could not be verified.' }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

async function createProfile(profile) {
  const rows = await supabaseRequest('rest/v1/ftf_profiles', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(profile),
    publicMessage: 'Fly the Farm profile could not be created.',
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function registerUser(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const name = String(body.name || '').trim();
  const role = body.role === 'client' ? 'client' : body.role === 'contractor' ? 'contractor' : '';

  if (!email || !email.includes('@') || password.length < 6 || !name || !role) {
    throw createHttpError(400, 'Name, valid email, password, and account type are required.');
  }

  let contractor = null;
  if (role === 'client') {
    const contractorCode = String(body.contractorCode || '').trim().toUpperCase();
    if (!contractorCode) throw createHttpError(400, 'Contractor code is required.');
    contractor = await findContractor(contractorCode);
    if (!contractor) throw createHttpError(400, 'Invalid contractor code. Check with your spray contractor.');
  }

  const signup = await supabaseRequest('auth/v1/signup', {
    method: 'POST',
    keyType: 'anon',
    body: JSON.stringify({ email, password, data: { name } }),
    publicMessage: 'Account registration failed.',
  });
  const authUser = signup.user || (signup.id ? signup : null);
  if (!authUser?.id) throw createHttpError(400, 'Account registration failed.');

  const tenantId = contractor?.tenant_id || authUser.id;
  let profile;
  try {
    profile = await createProfile({
      user_id: authUser.id,
      tenant_id: tenantId,
      role,
      name,
      invite_code: role === 'contractor' ? generateInviteCode() : null,
      contractor_id: contractor?.user_id || null,
      client_record_id: null,
      tier: 'free',
    });
  } catch (error) {
    await supabaseRequest(`auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
      method: 'DELETE',
      publicMessage: 'Incomplete account cleanup failed.',
    }).catch(() => undefined);
    throw error;
  }

  return {
    authUser,
    profile,
    session: signup.access_token ? signup : null,
    requiresEmailConfirmation: !signup.access_token,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      try {
        return res.status(200).json({ user: await authenticateRequest(req, res) });
      } catch (error) {
        if (error.statusCode === 401) return res.status(200).json({ user: null });
        throw error;
      }
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET,POST,OPTIONS');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    assertSameOrigin(req);
    const body = getJsonBody(req);
    if (body.action === 'logout') {
      clearSessionCookies(req, res);
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'login') {
      const session = await signIn(normalizeEmail(body.email), String(body.password || ''));
      const profile = await loadProfile(session.user.id);
      if (!profile) throw createHttpError(403, 'Your account is not configured for Fly the Farm.');
      setSessionCookies(req, res, session);
      return res.status(200).json({ user: toPublicUser(session.user, profile) });
    }

    if (body.action === 'register') {
      const registration = await registerUser(body);
      if (registration.session) setSessionCookies(req, res, registration.session);
      return res.status(201).json({
        user: registration.session ? toPublicUser(registration.authUser, registration.profile) : null,
        requiresEmailConfirmation: registration.requiresEmailConfirmation,
      });
    }

    throw createHttpError(400, 'Unsupported authentication action.');
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Authentication API error:', error);
    return res.status(status).json({ error: error.publicMessage || 'Authentication request failed.' });
  }
};
