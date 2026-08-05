-- Least-privilege PostgREST access for trusted Spray Command server paths.
-- RLS remains enabled. Browser-facing roles receive no access from this migration.

-- Platform identity resolution paths:
--   server/session.js
--   server/platform-request-context.js
-- These paths only materialise the authenticated Platform user, owned roles and
-- enabled permissions. They do not administer identities or assignments, so
-- INSERT, UPDATE and DELETE remain unavailable through PostgREST.
alter table public.platform_users enable row level security;
alter table public.platform_user_roles enable row level security;
alter table public.platform_roles enable row level security;
alter table public.platform_role_permissions enable row level security;
alter table public.platform_permissions enable row level security;

revoke all on table
  public.platform_users,
  public.platform_user_roles,
  public.platform_roles,
  public.platform_role_permissions,
  public.platform_permissions
from public, anon, authenticated;

grant select on table
  public.platform_users,
  public.platform_user_roles,
  public.platform_roles,
  public.platform_role_permissions,
  public.platform_permissions
to service_role;

-- Assisted Support read paths:
--   SupportRepository.listOrganisation
--   SupportRepository.listPlatform
--   SupportRepository.resolveSession
-- These paths read the request, its authoritative approval events and bounded
-- sessions. All creation, approval, session start, revocation, activity, audit,
-- outbox and notification writes remain restricted to existing SECURITY DEFINER
-- commands; direct table mutation is neither required nor granted.
alter table public.support_requests enable row level security;
alter table public.support_approval_events enable row level security;
alter table public.support_sessions enable row level security;

revoke all on table
  public.support_requests,
  public.support_approval_events,
  public.support_sessions
from public, anon, authenticated;

grant select on table
  public.support_requests,
  public.support_approval_events,
  public.support_sessions
to service_role;

-- Deliberately no direct service_role table grants are added for:
--   platform_audit_events, platform_transactional_outbox,
--   support_activity_events, organisation_notifications,
--   audit_events or transactional_outbox.
-- Those evidence streams remain reachable only through their approved commands.
