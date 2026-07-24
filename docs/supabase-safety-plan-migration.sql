alter table public.ftf_profiles
  add column if not exists safety_plan_authority boolean not null default false;

comment on column public.ftf_profiles.safety_plan_authority is
  'Allows a non-client tenant user to approve controlled Safety Plans.';

create or replace function public.ftf_compare_and_swap_store_payload(
  p_tenant_id uuid,
  p_collection text,
  p_record_id text,
  p_expected_revision bigint,
  p_payload jsonb
)
returns table (succeeded boolean, new_payload jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_new_payload jsonb;
  v_updated_rows integer;
begin
  update public.ftf_store as stored
  set
    payload = p_payload,
    updated_at = pg_catalog.now()
  where stored.tenant_id = p_tenant_id
    and stored.collection = p_collection
    and stored.record_id = p_record_id
    and stored.payload -> 'revision' = pg_catalog.to_jsonb(p_expected_revision)
  returning stored.payload into v_new_payload;

  get diagnostics v_updated_rows = row_count;
  return query
    select v_updated_rows = 1, v_new_payload;
end;
$function$;

revoke all on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb
) from public;
revoke all on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb
) from anon;
revoke all on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb
) from authenticated;
grant execute on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb
) to service_role;
