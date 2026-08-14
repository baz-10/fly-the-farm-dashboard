-- Reconcile the legacy store trusted-runtime boundary after PostgreSQL added
-- MAINTAIN to the table privilege vocabulary. The service runtime retains only
-- the four CRUD privileges already approved for this compatibility table.

revoke maintain on table public.ftf_store from service_role;
