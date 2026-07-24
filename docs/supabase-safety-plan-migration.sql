alter table public.ftf_profiles
  add column if not exists safety_plan_authority boolean not null default false;

comment on column public.ftf_profiles.safety_plan_authority is
  'Allows a non-client tenant user to approve controlled Safety Plans.';

drop function if exists public.ftf_set_safety_plan_authority(
  uuid, uuid, boolean, text, jsonb
);

create or replace function public.ftf_set_safety_plan_authority(
  p_tenant_id uuid,
  p_user_id uuid,
  p_enabled boolean,
  p_audit_record_id text,
  p_audit_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_profile public.ftf_profiles%rowtype;
begin
  if p_audit_record_id is null or p_audit_payload is null then
    raise exception 'Safety Plan authority audit details are required.';
  end if;

  update public.ftf_profiles as profile
  set safety_plan_authority = p_enabled
  where profile.user_id = p_user_id
    and profile.tenant_id = p_tenant_id
    and profile.role = 'contractor'
  returning profile.* into v_profile;

  if not found then
    raise exception 'Eligible company contractor was not found.';
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

  return pg_catalog.jsonb_build_object(
    'user_id', v_profile.user_id,
    'tenant_id', v_profile.tenant_id,
    'role', v_profile.role,
    'name', v_profile.name,
    'safety_plan_authority', v_profile.safety_plan_authority
  );
end;
$function$;

revoke all on function public.ftf_set_safety_plan_authority(
  uuid, uuid, boolean, text, jsonb
) from public;
revoke all on function public.ftf_set_safety_plan_authority(
  uuid, uuid, boolean, text, jsonb
) from anon;
revoke all on function public.ftf_set_safety_plan_authority(
  uuid, uuid, boolean, text, jsonb
) from authenticated;
grant execute on function public.ftf_set_safety_plan_authority(
  uuid, uuid, boolean, text, jsonb
) to service_role;

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

drop function if exists public.ftf_insert_safety_plan_with_audit(
  uuid, text, jsonb, text, jsonb
);

create or replace function public.ftf_insert_safety_plan_with_audit(
  p_tenant_id uuid,
  p_plan_record_id text,
  p_plan_payload jsonb,
  p_audit_record_id text,
  p_audit_payload jsonb
)
returns table (succeeded boolean, new_payload jsonb)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  insert into public.ftf_store (
    tenant_id,
    collection,
    record_id,
    payload,
    updated_at
  )
  values (
    p_tenant_id,
    'ftf_safety_plans',
    p_plan_record_id,
    p_plan_payload,
    pg_catalog.now()
  );

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

  return query select true, p_plan_payload;
exception
  when unique_violation then
    return query select false, null::jsonb;
end;
$function$;

revoke all on function public.ftf_insert_safety_plan_with_audit(
  uuid, text, jsonb, text, jsonb
) from public;
revoke all on function public.ftf_insert_safety_plan_with_audit(
  uuid, text, jsonb, text, jsonb
) from anon;
revoke all on function public.ftf_insert_safety_plan_with_audit(
  uuid, text, jsonb, text, jsonb
) from authenticated;
grant execute on function public.ftf_insert_safety_plan_with_audit(
  uuid, text, jsonb, text, jsonb
) to service_role;
