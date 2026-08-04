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

function productionBetaUrl() {
  const configured = String(process.env.PRODUCTION_BETA_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw createHttpError(503, 'Authentication is temporarily unavailable.', 'PRODUCTION_BETA_URL is not configured.');
  }
  return 'http://localhost:3000';
}

function ownerEmails() {
  return new Set(String(process.env.PRODUCTION_BETA_OWNER_EMAILS || '')
    .split(',').map(normalizeEmail).filter(Boolean));
}

function requiredUuid(name) {
  const value = String(process.env[name] || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw createHttpError(503, 'Authentication is temporarily unavailable.', `${name} is not configured.`);
  }
  return value;
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
    publicMessage: 'Spray Command profile could not be created.',
  });
  return Array.isArray(rows) ? rows[0] : null;
}

async function provisionExistingProductionBetaOwner(authUserId, name) {
  return supabaseRequest('rest/v1/rpc/ftf_provision_production_beta_member', {
    method: 'POST',
    body: JSON.stringify({
      p_auth_user_id: authUserId,
      p_organisation_id: requiredUuid('FTF_ORGANISATION_ID'),
      p_display_name: name,
      p_operating_location_id: requiredUuid('FTF_DEFAULT_OPERATING_LOCATION_ID'),
    }),
    publicMessage: 'Production Beta access could not be configured.',
  });
}

async function bootstrapContractorOrganisation(authUserId, name) {
  return supabaseRequest('rest/v1/rpc/ftf_bootstrap_production_beta_organisation', {
    method: 'POST',
    body: JSON.stringify({
      p_auth_user_id: authUserId,
      p_organisation_name: name,
      p_display_name: name,
      p_operating_location_name: `${name} Base`,
      p_operating_location_address: null,
      p_timezone: 'Australia/Brisbane',
    }),
    publicMessage: 'Organisation access could not be configured.',
  });
}

async function deleteAuthUser(authUserId) {
  return supabaseRequest(`auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: 'DELETE',
    publicMessage: 'Incomplete account cleanup failed.',
  });
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

  const confirmationRedirect = `${productionBetaUrl()}/auth/callback`;
  const signup = await supabaseRequest(`auth/v1/signup?redirect_to=${encodeURIComponent(confirmationRedirect)}`, {
    method: 'POST',
    keyType: 'anon',
    body: JSON.stringify({ email, password, data: { name } }),
    publicMessage: 'Account registration failed.',
  });
  const authUser = signup.user || (signup.id ? signup : null);
  if (!authUser?.id) throw createHttpError(400, 'Account registration failed.');

  // Supabase intentionally returns an obfuscated existing user with no identities.
  // Treat this as an idempotent confirmation-required outcome and never reprovision.
  if (Array.isArray(authUser.identities) && authUser.identities.length === 0) {
    return { duplicate: true, requiresEmailConfirmation: true };
  }

  let profile;
  try {
    if (role === 'contractor' && ownerEmails().has(email)) {
      await provisionExistingProductionBetaOwner(authUser.id, name);
      profile = await loadProfile(authUser.id);
    } else if (role === 'contractor') {
      await bootstrapContractorOrganisation(authUser.id, name);
      profile = await loadProfile(authUser.id);
    } else {
      profile = await createProfile({
        user_id: authUser.id,
        tenant_id: contractor.tenant_id,
        role,
        name,
        invite_code: null,
        contractor_id: contractor.user_id,
        client_record_id: null,
        tier: 'free',
      });
    }
    if (!profile) throw createHttpError(503, 'Account access could not be verified.');
  } catch (error) {
    await deleteAuthUser(authUser.id).catch((cleanupError) => {
      console.error('Authentication compensation failed:', cleanupError);
    });
    throw createHttpError(
      503,
      'Your account could not be fully configured. Please try again or contact support.',
      error instanceof Error ? error.message : String(error),
    );
  }

  return {
    authUser,
    profile,
    session: signup.access_token ? signup : null,
    requiresEmailConfirmation: !signup.access_token,
  };
}

async function completeSession(body) {
  const accessToken = String(body.accessToken || '');
  const refreshToken = String(body.refreshToken || '');
  const expiresIn = Number(body.expiresIn || 3600);
  if (!accessToken || !refreshToken) throw createHttpError(400, 'The authentication link is incomplete or expired.');
  const authUser = await supabaseRequest('auth/v1/user', {
    keyType: 'anon', accessToken, publicMessage: 'The authentication link is invalid or expired.',
  });
  const profile = await loadProfile(authUser.id);
  if (!profile) throw createHttpError(403, 'Your account setup is incomplete. Contact support with the displayed reference.');
  return { authUser, profile, session: { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn } };
}

async function requestPasswordRecovery(email) {
  await supabaseRequest(`auth/v1/recover?redirect_to=${encodeURIComponent(`${productionBetaUrl()}/reset-password`)}`, {
    method: 'POST', keyType: 'anon', body: JSON.stringify({ email }),
    publicMessage: 'Password recovery is temporarily unavailable.',
  });
}

async function resetPassword(body) {
  const session = await completeSession(body);
  const password = String(body.password || '');
  if (password.length < 8) throw createHttpError(400, 'Password must be at least 8 characters.');
  const authUser = await supabaseRequest('auth/v1/user', {
    method: 'PUT', keyType: 'anon', accessToken: String(body.accessToken),
    body: JSON.stringify({ password }), publicMessage: 'Password could not be updated.',
  });
  return { ...session, authUser };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const correlationId = crypto.randomUUID();
  res.setHeader('X-Correlation-ID', correlationId);

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
      if (!profile) throw createHttpError(403, 'Your account is not configured for Spray Command.');
      setSessionCookies(req, res, session);
      return res.status(200).json({ user: toPublicUser(session.user, profile) });
    }

    if (body.action === 'complete-session') {
      const completed = await completeSession(body);
      setSessionCookies(req, res, completed.session);
      return res.status(200).json({ user: toPublicUser(completed.authUser, completed.profile) });
    }

    if (body.action === 'forgot-password') {
      const email = normalizeEmail(body.email);
      if (!email || !email.includes('@')) throw createHttpError(400, 'A valid email address is required.');
      await requestPasswordRecovery(email);
      return res.status(200).json({
        message: 'If an account exists for that email, a password reset link has been sent.',
      });
    }

    if (body.action === 'reset-password') {
      const completed = await resetPassword(body);
      setSessionCookies(req, res, completed.session);
      return res.status(200).json({ user: toPublicUser(completed.authUser, completed.profile) });
    }

    if (body.action === 'register') {
      const registration = await registerUser(body);
      if (registration.duplicate) {
        return res.status(202).json({ user: null, requiresEmailConfirmation: true });
      }
      if (registration.session) setSessionCookies(req, res, registration.session);
      return res.status(201).json({
        user: registration.session ? toPublicUser(registration.authUser, registration.profile) : null,
        requiresEmailConfirmation: registration.requiresEmailConfirmation,
      });
    }

    throw createHttpError(400, 'Unsupported authentication action.');
  } catch (error) {
    const status = error.statusCode || 500;
    console.error(`Authentication API error [${correlationId}]:`, error);
    return res.status(status).json({
      error: error.publicMessage || 'Authentication request failed.',
      correlationId,
    });
  }
};
