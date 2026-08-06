const { createHttpError, supabaseRequest } = require('./supabase');

const ACCESS_COOKIE = 'ftf_access_token';
const REFRESH_COOKIE = 'ftf_refresh_token';
const SUPPORT_COOKIE = 'sc_support_session';

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
  appendSetCookie(res, makeCookie(req, SUPPORT_COOKIE, '', 0));
}

async function loadProfile(userId) {
  const rows = await supabaseRequest(
    `rest/v1/ftf_profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,tenant_id,role,name,invite_code,contractor_id,client_record_id,tier&limit=1`,
    { publicMessage: 'User profile could not be loaded.' }
  );
  if (Array.isArray(rows) && rows[0]) return rows[0];

  const internalUsers = await supabaseRequest(
    `rest/v1/internal_users?auth_user_id=eq.${encodeURIComponent(userId)}&is_active=is.true&archived_at=is.null&select=id,organisation_id,display_name`,
    { publicMessage: 'Organisation identity could not be loaded.' },
  );
  const resolvedProfiles = [];
  for (const internalUser of Array.isArray(internalUsers) ? internalUsers : []) {
    const memberships = await supabaseRequest(
      `rest/v1/memberships?organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}&internal_user_id=eq.${encodeURIComponent(internalUser.id)}&is_active=is.true&archived_at=is.null&select=id,role_id`,
      { publicMessage: 'Organisation identity could not be loaded.' },
    );
    const roleIds = (Array.isArray(memberships) ? memberships : [])
      .map((membership) => membership.role_id)
      .filter(Boolean);
    if (!roleIds.length) continue;

    const roles = await supabaseRequest(
      `rest/v1/roles?organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}&id=in.(${roleIds.map(encodeURIComponent).join(',')})&archived_at=is.null&select=id,code`,
      { publicMessage: 'Organisation identity could not be loaded.' },
    );
    const role = Array.isArray(roles) ? roles.find((candidate) => candidate.code) : null;
    if (!role) continue;

    const organisations = await supabaseRequest(
      `rest/v1/organisations?id=eq.${encodeURIComponent(internalUser.organisation_id)}&archived_at=is.null&select=id,name&limit=1`,
      { publicMessage: 'Organisation identity could not be loaded.' },
    );
    if (!Array.isArray(organisations) || !organisations[0]) continue;

    resolvedProfiles.push({
      user_id: userId,
      tenant_id: internalUser.organisation_id,
      role: role.code,
      name: internalUser.display_name,
      tier: 'free',
      identity_source: 'authoritative_organisation',
    });
  }

  if (resolvedProfiles.length > 1) {
    throw createHttpError(403, 'Multiple active organisation identities require administrator resolution.');
  }
  return resolvedProfiles[0] || null;
}

async function loadPlatformProfile(userId) {
  const select = 'id,auth_user_id,email,display_name,platform_user_roles!platform_user_roles_platform_user_id_fkey(platform_roles(code,platform_role_permissions(platform_permissions(code,enabled))))';
  const rows = await supabaseRequest(
    `rest/v1/platform_users?auth_user_id=eq.${encodeURIComponent(userId)}&is_active=is.true&archived_at=is.null&select=${encodeURIComponent(select)}&limit=1`,
    { publicMessage: 'Platform identity could not be loaded.' },
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function toPublicUser(authUser, profile) {
  const ownerEmails = new Set(String(process.env.PRODUCTION_BETA_OWNER_EMAILS || '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean));
  const entitlements = ownerEmails.has(String(authUser.email || '').trim().toLowerCase())
    ? ['legacyAskFtf']
    : [];
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
    entitlements,
  };
}

function toPublicPlatformUser(authUser, profile) {
  const roleRows = Array.isArray(profile.platform_user_roles) ? profile.platform_user_roles : [];
  const roles = roleRows.map((entry) => entry.platform_roles?.code).filter(Boolean);
  const permissions = [...new Set(roleRows.flatMap((entry) => {
    const assignments = entry.platform_roles?.platform_role_permissions;
    return Array.isArray(assignments) ? assignments
      .filter((assignment) => assignment.platform_permissions?.enabled !== false)
      .map((assignment) => assignment.platform_permissions?.code)
      .filter(Boolean) : [];
  }))];
  return {
    id: authUser.id,
    email: authUser.email,
    name: profile.display_name || authUser.user_metadata?.name || authUser.email,
    role: 'platform',
    identityPlane: 'platform',
    platformUserId: profile.id,
    platformRoles: roles,
    permissions,
    tier: 'free',
    entitlements: [],
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

async function authenticateAuthUser(req, res) {
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

  return authUser;
}

async function authenticateRequest(req, res) {
  const authUser = await authenticateAuthUser(req, res);

  const profile = await loadProfile(authUser.id);
  const legacyOrganisationRole = ['admin', 'contractor', 'client'].includes(profile?.role);
  if (profile?.tenant_id && (legacyOrganisationRole || profile.identity_source === 'authoritative_organisation')) {
    return toPublicUser(authUser, profile);
  }
  const platformProfile = await loadPlatformProfile(authUser.id);
  if (platformProfile) {
    const result=toPublicPlatformUser(authUser,platformProfile),supportSessionId=parseCookies(req)[SUPPORT_COOKIE];
    if(supportSessionId){const { SupportRepository }=require('./support-repository');const support=await new SupportRepository().resolveSession(supportSessionId,platformProfile.id);if(support?.state==='ACTIVE'&&Date.now()<new Date(support.expiresAt).getTime())result.delegatedSupport={sessionId:support.id,organisationId:support.organisationId,organisationName:support.organisationName,accessMode:support.accessMode,scopeType:support.scopeType,missionId:support.missionId,jobId:support.jobId,moduleCode:support.moduleCode,expiresAt:support.expiresAt};}
    return result;
  }
  throw createHttpError(403, 'Your account is not configured for Spray Command.');
}

module.exports = {
  authenticateAuthUser,
  authenticateRequest,
  clearSessionCookies,
  loadPlatformProfile,
  loadProfile,
  setSessionCookies,
  toPublicUser,
  toPublicPlatformUser,
};
