const { resolvePlatformRequestContext } = require('../../server/platform-request-context');

test('resolves role ownership through platform_user_id when both platform-user foreign keys exist', async () => {
  let requestedPath = '';
  const context = await resolvePlatformRequestContext({}, {}, {
    authenticateAuthUser: async () => ({ id: 'platform-auth-id', email: 'platform@example.com' }),
    supabaseRequest: async (path) => {
      requestedPath = decodeURIComponent(path);
      return [{
        id: 'platform-user-id',
        display_name: 'Platform Administrator',
        platform_user_roles: [{
          platform_roles: {
            code: 'PLATFORM_SUPER_ADMIN',
            platform_role_permissions: [{
              platform_permissions: { code: 'platform.super_admin', enabled: true },
            }],
          },
        }],
      }];
    },
  });

  expect(requestedPath).toContain('platform_user_roles!platform_user_roles_platform_user_id_fkey(');
  expect(requestedPath).not.toContain('platform_user_roles!platform_user_roles_assigned_by_platform_user_id_fkey(');
  expect(context.roles).toEqual(['PLATFORM_SUPER_ADMIN']);
  expect(context.permissions).toEqual(['platform.super_admin']);
  expect(context).not.toHaveProperty('organisation');
});

test('fails closed when the authenticated account has no active platform identity', async () => {
  await expect(resolvePlatformRequestContext({}, {}, {
    authenticateAuthUser: async () => ({ id: 'inactive-platform-auth-id', email: 'inactive@example.com' }),
    supabaseRequest: async () => [],
  })).rejects.toMatchObject({ statusCode: 403, publicMessage: 'Platform access is not configured.' });
});
