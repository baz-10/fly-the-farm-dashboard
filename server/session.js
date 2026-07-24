const { createHttpError, supabaseRequest } = require('./supabase');

const ACCESS_COOKIE = 'ftf_access_token';
const REFRESH_COOKIE = 'ftf_refresh_token';

function parseCookies(req) {
  const cookies = {};
  const raw = req.headers?.cookie || '';

  raw.split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function appendSetCookie(res, value) {
  const current = res.getHeader?.('Set-Cookie');
  const values = current ? (Array.isArray(current) ? current : [current]) : [];
  res.setHeader('Set-Cookie', [...values, value]);
}

function isSecureRequest(req) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return forwardedProto === 'https' || process.env.NODE_ENV === 'production';
}

function makeCookie(req, name, value, maxAge) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function setSessionCookies(req, res, session) {
  appendSetCookie(res, makeCookie(req, ACCESS_COOKIE, session.access_token, session.expires_in || 3600));
  appendSetCookie(res, makeCookie(req, REFRESH_COOKIE, session.refresh_token, 60 * 60 * 24 * 30));
}

function clearSessionCookies(req, res) {
  appendSetCookie(res, makeCookie(req, ACCESS_COOKIE, '', 0));
  appendSetCookie(res, makeCookie(req, REFRESH_COOKIE, '', 0));
}

async function loadProfile(userId) {
  const rows = await supabaseRequest(
    `rest/v1/ftf_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,tenant_id,role,name,invite_code,contractor_id,client_record_id,tier,safety_plan_authority&limit=1`,
    { publicMessage: 'User profile could not be loaded.' }
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function toPublicUser(authUser, profile) {
  return {
    id: authUser.id,
    email: authUser.email,
    name: profile.name || authUser.user_metadata?.name || authUser.email,
    role: profile.role,
    tenantId: profile.tenant_id,
    contractorId: profile.contractor_id || undefined,
    clientRecordId: profile.client_record_id || undefined,
    inviteCode: profile.invite_code || undefined,
    tier: profile.tier || 'free',
    safetyPlanAuthority: profile.safety_plan_authority === true,
  };
}

async function getAuthUser(accessToken) {
  return supabaseRequest('auth/v1/user', {
    keyType: 'anon',
    accessToken,
    publicMessage: 'Authentication is required.',
  });
}

async function refreshSession(refreshToken) {
  return supabaseRequest('auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    keyType: 'anon',
    body: JSON.stringify({ refresh_token: refreshToken }),
    publicMessage: 'Your session has expired. Sign in again.',
  });
}

async function authenticateRequest(req, res) {
  if (req.localE2eFixture?.user) return req.localE2eFixture.user;

  const cookies = parseCookies(req);
  let accessToken = cookies[ACCESS_COOKIE];
  let authUser;

  if (!accessToken) {
    if (!cookies[REFRESH_COOKIE] || !res) {
      throw createHttpError(401, 'Authentication is required.');
    }
    const session = await refreshSession(cookies[REFRESH_COOKIE]);
    setSessionCookies(req, res, session);
    accessToken = session.access_token;
    authUser = session.user;
  }

  if (!authUser) {
    try {
      authUser = await getAuthUser(accessToken);
    } catch (error) {
      if (![401, 403].includes(error.statusCode) || !cookies[REFRESH_COOKIE] || !res) throw error;
      const session = await refreshSession(cookies[REFRESH_COOKIE]);
      setSessionCookies(req, res, session);
      accessToken = session.access_token;
      authUser = session.user || await getAuthUser(accessToken);
    }
  }

  const profile = await loadProfile(authUser.id);
  if (!profile?.tenant_id || !['admin', 'contractor', 'client'].includes(profile.role)) {
    throw createHttpError(403, 'Your account is not configured for Fly the Farm.');
  }

  return toPublicUser(authUser, profile);
}

module.exports = {
  authenticateRequest,
  clearSessionCookies,
  loadProfile,
  setSessionCookies,
  toPublicUser,
};
