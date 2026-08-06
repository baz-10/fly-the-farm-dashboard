-- The trusted operational API reads audit_events only to prove that a
-- production_beta_acceptance actor created a controlled record before archive.
-- It does not update or delete audit history; writes remain inside the existing
-- repository-controlled security-definer commands.
grant select on table public.audit_events to service_role;
