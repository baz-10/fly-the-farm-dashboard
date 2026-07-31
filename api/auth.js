const crypto = require('crypto');
const {
  authenticateRequest,
  clearSessionCookies,
  loadProfile,
  loadTenantProfiles,
  setSessionCookies,
  toPublicUser,
} = require('../server/session');
const { createHttpError, supabaseRequest } = require('../server/supabase');

function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getRecoveryRedirect(req) {
  const configuredUrl = String(process.env.APP_URL || '').trim();
  if (configuredUrl) return `${configuredUrl.replace(/\/+$/, '')}/reset-password`;

  const origin = String(req.headers?.origin || '').trim();
  if (origin) return `${origin.replace(/\/+$/, '')}/reset-password`;

  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim();
  if (!host) throw createHttpError(500, 'Password recovery is not configured.');
  const protocol = String(req.headers?.['x-forwarded-proto'] || '').trim()
    || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${protocol}://${host}/reset-password`;
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

function authorityPublicUser(profile, includeEmail = false) {
  return {
    id: profile.user_id,
    name: profile.name || 'Company user',
    ...(includeEmail && profile.email ? { email: profile.email } : {}),
    role: profile.role,
    safetyPlanAuthority: profile.role === 'admin' || profile.safety_plan_authority === true,
  };
}

async function listSafetyPlanAuthorities(req, res) {
  const actor = await authenticateRequest(req, res);
  if (!['admin', 'contractor'].includes(actor.role)) {
    throw createHttpError(403, 'This account cannot view Safety Plan authorities.');
  }
  const profiles = await loadTenantProfiles(actor.tenantId);
  const visible = actor.role === 'admin'
    ? profiles.filter((profile) => ['admin', 'contractor'].includes(profile.role))
    : profiles.filter((profile) =>
      profile.role === 'admin'
      || (profile.role === 'contractor' && profile.safety_plan_authority === true)
    );
  return visible.map((profile) => authorityPublicUser(profile));
}

function buildAuthorityAudit(actor, target, enabled) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    tenantId: actor.tenantId,
    planId: `authority:${target.user_id}`,
    actor: {
      userId: actor.id,
      name: actor.name,
      role: actor.role,
      operationalAuthority: true,
    },
    action: enabled ? 'authority_nominated' : 'authority_removed',
    occurredAt: now,
    after: {
      userId: target.user_id,
      name: target.name,
      safetyPlanAuthority: enabled,
    },
  };
}

async function updateAuthorityAtomically(actor, target, enabled) {
  const audit = buildAuthorityAudit(actor, target, enabled);
  const result = await supabaseRequest('rest/v1/rpc/ftf_set_safety_plan_authority', {
    method: 'POST',
    body: JSON.stringify({
      p_tenant_id: actor.tenantId,
      p_user_id: target.user_id,
      p_enabled: enabled,
      p_audit_record_id: audit.id,
      p_audit_payload: audit,
    }),
    publicMessage: 'Safety Plan authority could not be updated.',
  });
  return result;
}

async function changeSafetyPlanAuthority(req, res, body) {
  const actor = await authenticateRequest(req, res);
  if (actor.role !== 'admin') {
    throw createHttpError(403, 'Only company administrators can nominate Safety Plan authorities.');
  }
  const userId = String(body.userId || '').trim();
  if (!userId) throw createHttpError(400, 'A company user is required.');
  const target = await loadProfile(userId);
  if (!target || target.tenant_id !== actor.tenantId) {
    throw createHttpError(403, 'Safety Plan authorities must belong to the same company.');
  }
  if (target.role === 'client') {
    throw createHttpError(403, 'Clients cannot be nominated as Safety Plan authorities.');
  }
  if (target.role !== 'contractor') {
    throw createHttpError(400, 'Administrators already hold Safety Plan approval authority.');
  }
  const enabled = body.enabled === true;
  const updated = await updateAuthorityAtomically(actor, target, enabled);
  if (!updated) throw createHttpError(409, 'Safety Plan authority was not updated.');
  return authorityPublicUser(updated);
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

    if (body.action === 'request-password-reset') {
      const email = normalizeEmail(body.email);
      if (!email || !email.includes('@')) {
        throw createHttpError(400, 'Enter a valid email address.');
      }
      await supabaseRequest(
        `auth/v1/recover?redirect_to=${encodeURIComponent(getRecoveryRedirect(req))}`,
        {
          method: 'POST',
          keyType: 'anon',
          body: JSON.stringify({ email }),
          publicMessage: 'Password recovery email could not be sent.',
        }
      );
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'update-password') {
      const accessToken = String(body.accessToken || '').trim();
      const password = String(body.password || '');
      if (!accessToken) {
        throw createHttpError(400, 'This password recovery link is invalid or has expired.');
      }
      if (password.length < 6) {
        throw createHttpError(400, 'Password must be at least 6 characters.');
      }
      await supabaseRequest('auth/v1/user', {
        method: 'PUT',
        keyType: 'anon',
        accessToken,
        body: JSON.stringify({ password }),
        publicMessage: 'This password recovery link is invalid or has expired.',
      });
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'register') {
      const registration = await registerUser(body);
      if (registration.session) setSessionCookies(req, res, registration.session);
      return res.status(201).json({
        user: registration.session ? toPublicUser(registration.authUser, registration.profile) : null,
        requiresEmailConfirmation: registration.requiresEmailConfirmation,
      });
    }

    if (body.action === 'listSafetyPlanAuthorities') {
      return res.status(200).json({ users: await listSafetyPlanAuthorities(req, res) });
    }

    if (body.action === 'setSafetyPlanAuthority') {
      return res.status(200).json({
        user: await changeSafetyPlanAuthority(req, res, body),
      });
    }

    throw createHttpError(400, 'Unsupported authentication action.');
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Authentication API error:', error);
    return res.status(status).json({ error: error.publicMessage || 'Authentication request failed.' });
  }
};
