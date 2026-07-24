alter table public.ftf_profiles
  add column if not exists safety_plan_authority boolean not null default false;

comment on column public.ftf_profiles.safety_plan_authority is
  'Allows a non-client tenant user to approve controlled Safety Plans.';

drop function if exists public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb
);

create or replace function public.ftf_compare_and_swap_store_payload(
  p_tenant_id uuid,
  p_collection text,
  p_record_id text,
  p_expected_revision bigint,
  p_payload jsonb,
  p_audit_record_id text default null,
  p_audit_payload jsonb default null
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

  if v_updated_rows = 1 and p_audit_record_id is not null then
    if p_audit_payload is null then
      raise exception 'Audit payload is required when an audit record id is supplied.';
    end if;

    insert into public.ftf_store (
      tenant_id,
      collection,
      record_id,
      payload,
      updated_at
    )
    values (
      p_tenant_id,
      'ftf_safety_plan_audit',
      p_audit_record_id,
      p_audit_payload,
      pg_catalog.now()
    );
  end if;

  return query
    select v_updated_rows = 1, v_new_payload;
end;
$function$;

revoke all on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb, text, jsonb
) from public;
revoke all on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb, text, jsonb
) from anon;
revoke all on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb, text, jsonb
) from authenticated;
grant execute on function public.ftf_compare_and_swap_store_payload(
  uuid, text, text, bigint, jsonb, text, jsonb
) to service_role;
