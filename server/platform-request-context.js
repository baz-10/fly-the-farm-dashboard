const { authenticateAuthUser } = require('./session');
const { createHttpError, supabaseRequest } = require('./supabase');

async function resolvePlatformRequestContext(req, res, dependencies = {}) {
  const authenticate = dependencies.authenticateAuthUser || authenticateAuthUser;
  const request = dependencies.supabaseRequest || supabaseRequest;
  const authUser = await authenticate(req, res);
  const select = 'id,auth_user_id,email,display_name,platform_user_roles!platform_user_roles_platform_user_id_fkey(platform_roles(code,platform_role_permissions(platform_permissions(code,enabled))))';
  const rows = await request(`rest/v1/platform_users?auth_user_id=eq.${encodeURIComponent(authUser.id)}&is_active=is.true&archived_at=is.null&select=${encodeURIComponent(select)}&limit=1`, { publicMessage: 'Platform identity could not be loaded.' });
  const platformUser = Array.isArray(rows) ? rows[0] : null;
  if (!platformUser) throw createHttpError(403, 'Platform access is not configured.');
  const assignments = Array.isArray(platformUser.platform_user_roles) ? platformUser.platform_user_roles : [];
  const roles = assignments.map((entry) => entry.platform_roles?.code).filter(Boolean);
  const permissions = [...new Set(assignments.flatMap((entry) => (entry.platform_roles?.platform_role_permissions || [])
    .filter((item) => item.platform_permissions?.enabled !== false)
    .map((item) => item.platform_permissions?.code).filter(Boolean)))];
  return { authUser: { id: authUser.id, email: authUser.email }, platformUser: { id: platformUser.id, name: platformUser.display_name }, roles, permissions };
}

module.exports = { resolvePlatformRequestContext };
