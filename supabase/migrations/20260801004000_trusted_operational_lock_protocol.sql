-- Corrective forward migration: one organisation-scoped advisory lock is taken
-- before row-level target and parent locks, preventing hierarchy-order deadlocks
-- while allowing trusted writes for different organisations to proceed together.
alter function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_unlocked;

create function public.ftf_write_operational_resource(
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_resource text,
  p_operation text,
  p_entity_id uuid default null,
  p_expected_version integer default null,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Acquire this before row-level target and parent locks.
  perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
  return public.ftf_write_operational_resource_unlocked(
    p_organisation_id,
    p_actor_internal_user_id,
    p_resource,
    p_operation,
    p_entity_id,
    p_expected_version,
    p_data
  );
end;
$$;

revoke all on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.ftf_write_operational_resource(uuid, uuid, text, text, uuid, integer, jsonb) to service_role;
revoke all on function public.ftf_write_operational_resource_unlocked(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
