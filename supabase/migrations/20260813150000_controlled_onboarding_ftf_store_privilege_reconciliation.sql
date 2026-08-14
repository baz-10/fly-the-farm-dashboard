-- Reconcile the legacy store trusted-runtime boundary after PostgreSQL added
-- MAINTAIN to the table privilege vocabulary. The service runtime retains only
-- the four CRUD privileges already approved for this compatibility table. The
-- exact postgres/public/table default is reconciled as well so the same
-- unintended privilege is not materialised on future governed tables.

revoke maintain on table public.ftf_store from service_role;

alter default privileges for role postgres in schema public
  revoke maintain on tables from service_role;
