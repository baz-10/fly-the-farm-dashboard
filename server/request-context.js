const { createHttpError, supabaseRequest } = require('./supabase');

const ACCESS_COOKIE = 'ftf_access_token';

function parseCookies(req) {
  const cookies = {};
  String(req.headers?.cookie || '').split(';').forEach((part) => {
    const index = part.indexOf('=');
    if (index === -1) return;
    const key = part.slice(0, index).trim();
    if (key) cookies[key] = decodeURIComponent(part.slice(index + 1).trim());
  });
  return cookies;
}

function firstRow(rows) {
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

function query(table, filters, select) {
  return supabaseRequest(`rest/v1/${table}?${filters.join('&')}&select=${select}`, {
    publicMessage: 'Authenticated organisation context could not be loaded.',
  });
}

async function resolveRequestContext(req) {
  const accessToken = parseCookies(req)[ACCESS_COOKIE];
  if (!accessToken) throw createHttpError(401, 'Authentication is required.');

  const authUser = await supabaseRequest('auth/v1/user', {
    keyType: 'anon',
    accessToken,
    publicMessage: 'Authentication is required.',
  });
  if (!authUser?.id) throw createHttpError(401, 'Authentication is required.');

  const internalUsers = await query('internal_users', [
    `auth_user_id=eq.${encodeURIComponent(authUser.id)}`,
    'is_active=is.true',
    'archived_at=is.null',
  ], 'id,organisation_id,display_name');
  let internalUser = null;
  let memberships = [];
  for (const candidate of Array.isArray(internalUsers) ? internalUsers : []) {
    const candidateMemberships = await query('memberships', [
      `organisation_id=eq.${encodeURIComponent(candidate.organisation_id)}`,
      `internal_user_id=eq.${encodeURIComponent(candidate.id)}`,
      'is_active=is.true',
      'archived_at=is.null',
    ], 'role_id');
    if (Array.isArray(candidateMemberships) && candidateMemberships.length > 0) {
      internalUser = candidate;
      memberships = candidateMemberships;
      break;
    }
  }
  if (!internalUser) {
    throw createHttpError(403, 'No active organisation membership was found.');
  }

  const roleIds = memberships.map((membership) => membership.role_id).filter(Boolean);
  const roles = roleIds.length ? await query('roles', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `id=in.(${roleIds.map(encodeURIComponent).join(',')})`,
    'archived_at=is.null',
  ], 'id,code') : [];
  const permissions = roleIds.length ? await query('role_permissions', [
    `organisation_id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    `role_id=in.(${roleIds.map(encodeURIComponent).join(',')})`,
    'archived_at=is.null',
  ], 'permissions!inner(code)') : [];
  const organisation = firstRow(await query('organisations', [
    `id=eq.${encodeURIComponent(internalUser.organisation_id)}`,
    'archived_at=is.null',
    'limit=1',
  ], 'id,name'));
  if (!organisation) throw createHttpError(403, 'Your organisation is not active.');

  // Entitlement is legacy-compatible metadata only; it never grants permissions.
  const profile = firstRow(await query('ftf_profiles', [
    `user_id=eq.${encodeURIComponent(authUser.id)}`,
    'limit=1',
  ], 'tier'));

  return {
    user: { id: authUser.id, email: authUser.email || null, name: internalUser.display_name },
    organisation: { id: organisation.id, name: organisation.name },
    internalUser: { id: internalUser.id, name: internalUser.display_name },
    roles: (Array.isArray(roles) ? roles : []).map((role) => role.code).filter(Boolean),
    permissions: (Array.isArray(permissions) ? permissions : [])
      .map((entry) => entry.permissions?.code)
      .filter(Boolean),
    // No membership-to-location relation exists in the foundation schema, so no
    // location access is inferred until one is explicitly represented.
    operatingLocationIds: [],
    entitlement: { tier: profile?.tier || null, seatActive: true },
  };
}

module.exports = { parseCookies, resolveRequestContext };
