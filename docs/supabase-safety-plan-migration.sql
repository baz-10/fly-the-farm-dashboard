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

drop function if exists public.ftf_init_safety_plan_template_draft(
  uuid, uuid, text, jsonb
);

create or replace function public.ftf_init_safety_plan_template_draft(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_standard_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_draft_id constant text := 'safety-plan-template-draft';
  v_existing jsonb;
  v_latest jsonb;
  v_base_content jsonb;
  v_base_version integer := 0;
  v_now timestamptz := pg_catalog.now();
  v_draft jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ftf_safety_plan_template_draft:' || p_tenant_id::text, 0)
  );

  select stored.payload
  into v_existing
  from public.ftf_store as stored
  where stored.tenant_id = p_tenant_id
    and stored.collection = 'ftf_safety_plan_templates'
    and stored.record_id = v_draft_id
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  select stored.payload
  into v_latest
  from public.ftf_store as stored
  where stored.tenant_id = p_tenant_id
    and stored.collection = 'ftf_safety_plan_templates'
    and stored.payload ->> 'recordType' is distinct from 'draft'
  order by (stored.payload ->> 'masterVersion')::integer desc
  limit 1;

  if v_latest is null then
    v_base_content := p_standard_content;
  else
    v_base_version := (v_latest ->> 'masterVersion')::integer;
    v_base_content := v_latest - array[
      'id', 'tenantId', 'recordType', 'draftRevision', 'masterVersion',
      'version', 'publishedAt', 'publishedBy', 'draftUpdatedAt', 'draftUpdatedBy'
    ];
  end if;

  v_draft := v_base_content || pg_catalog.jsonb_build_object(
    'id', v_draft_id,
    'tenantId', p_tenant_id::text,
    'recordType', 'draft',
    'draftRevision', 1,
    'masterVersion', v_base_version,
    'version', 'draft',
    'isPlatformStandard', false,
    'draftUpdatedAt', v_now,
    'draftUpdatedBy', pg_catalog.jsonb_build_object(
      'userId', p_actor_user_id::text,
      'name', p_actor_name
    )
  );

  insert into public.ftf_store (
    tenant_id, collection, record_id, payload, updated_at
  )
  values (
    p_tenant_id, 'ftf_safety_plan_templates', v_draft_id, v_draft, v_now
  );

  return v_draft;
end;
$function$;

revoke all on function public.ftf_init_safety_plan_template_draft(
  uuid, uuid, text, jsonb
) from public;
revoke all on function public.ftf_init_safety_plan_template_draft(
  uuid, uuid, text, jsonb
) from anon;
revoke all on function public.ftf_init_safety_plan_template_draft(
  uuid, uuid, text, jsonb
) from authenticated;
grant execute on function public.ftf_init_safety_plan_template_draft(
  uuid, uuid, text, jsonb
) to service_role;

drop function if exists public.ftf_update_safety_plan_template_draft(
  uuid, uuid, text, bigint, jsonb
);

create or replace function public.ftf_update_safety_plan_template_draft(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_expected_revision bigint,
  p_template_content jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_draft_id constant text := 'safety-plan-template-draft';
  v_now timestamptz := pg_catalog.now();
  v_updated jsonb;
begin
  update public.ftf_store as stored
  set
    payload = p_template_content || pg_catalog.jsonb_build_object(
      'id', v_draft_id,
      'tenantId', p_tenant_id::text,
      'recordType', 'draft',
      'draftRevision', p_expected_revision + 1,
      'masterVersion', (stored.payload ->> 'masterVersion')::integer,
      'version', 'draft',
      'isPlatformStandard', false,
      'draftUpdatedAt', v_now,
      'draftUpdatedBy', pg_catalog.jsonb_build_object(
        'userId', p_actor_user_id::text,
        'name', p_actor_name
      )
    ),
    updated_at = v_now
  where stored.tenant_id = p_tenant_id
    and stored.collection = 'ftf_safety_plan_templates'
    and stored.record_id = v_draft_id
    and (stored.payload ->> 'draftRevision')::bigint = p_expected_revision
  returning stored.payload into v_updated;

  return v_updated;
end;
$function$;

revoke all on function public.ftf_update_safety_plan_template_draft(
  uuid, uuid, text, bigint, jsonb
) from public;
revoke all on function public.ftf_update_safety_plan_template_draft(
  uuid, uuid, text, bigint, jsonb
) from anon;
revoke all on function public.ftf_update_safety_plan_template_draft(
  uuid, uuid, text, bigint, jsonb
) from authenticated;
grant execute on function public.ftf_update_safety_plan_template_draft(
  uuid, uuid, text, bigint, jsonb
) to service_role;

drop function if exists public.ftf_publish_safety_plan_master(
  uuid, uuid, text, jsonb, text
);

create or replace function public.ftf_publish_safety_plan_master(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_template_content jsonb,
  p_audit_record_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_next_version integer;
  v_record_id text;
  v_published_at timestamptz := pg_catalog.now();
  v_payload jsonb;
  v_audit jsonb;
begin
  if p_template_content is null or p_audit_record_id is null then
    raise exception 'Company master content and audit identity are required.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ftf_safety_plan_master:' || p_tenant_id::text, 0)
  );

  select pg_catalog.coalesce(
    pg_catalog.max((stored.payload ->> 'masterVersion')::integer),
    0
  ) + 1
  into v_next_version
  from public.ftf_store as stored
  where stored.tenant_id = p_tenant_id
    and stored.collection = 'ftf_safety_plan_templates'
    and stored.payload ->> 'recordType' is distinct from 'draft';

  v_record_id := 'safety-plan-master-' || p_tenant_id::text || '-' || v_next_version::text;
  v_payload := p_template_content || pg_catalog.jsonb_build_object(
    'id', v_record_id,
    'tenantId', p_tenant_id::text,
    'recordType', 'published',
    'masterVersion', v_next_version,
    'version', v_next_version::text || '.0',
    'publishedAt', v_published_at,
    'publishedBy', pg_catalog.jsonb_build_object(
      'userId', p_actor_user_id::text,
      'name', p_actor_name
    ),
    'isPlatformStandard', false
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
    'ftf_safety_plan_templates',
    v_record_id,
    v_payload,
    v_published_at
  );

  update public.ftf_store as draft
  set
    payload = p_template_content || pg_catalog.jsonb_build_object(
      'id', 'safety-plan-template-draft',
      'tenantId', p_tenant_id::text,
      'recordType', 'draft',
      'draftRevision', pg_catalog.coalesce(
        (draft.payload ->> 'draftRevision')::integer,
        0
      ) + 1,
      'masterVersion', v_next_version,
      'version', 'draft',
      'isPlatformStandard', false,
      'draftUpdatedAt', v_published_at,
      'draftUpdatedBy', pg_catalog.jsonb_build_object(
        'userId', p_actor_user_id::text,
        'name', p_actor_name
      )
    ),
    updated_at = v_published_at
  where draft.tenant_id = p_tenant_id
    and draft.collection = 'ftf_safety_plan_templates'
    and draft.record_id = 'safety-plan-template-draft';

  v_audit := pg_catalog.jsonb_build_object(
    'id', p_audit_record_id,
    'tenantId', p_tenant_id::text,
    'planId', 'template:' || v_record_id,
    'actor', pg_catalog.jsonb_build_object(
      'userId', p_actor_user_id::text,
      'name', p_actor_name,
      'role', 'admin',
      'operationalAuthority', true
    ),
    'action', 'company_master_published',
    'occurredAt', v_published_at,
    'after', pg_catalog.jsonb_build_object(
      'templateId', v_record_id,
      'masterVersion', v_next_version,
      'standardVersion', p_template_content ->> 'standardVersion'
    )
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
    v_audit,
    v_published_at
  );

  return v_payload;
end;
$function$;

revoke all on function public.ftf_publish_safety_plan_master(
  uuid, uuid, text, jsonb, text
) from public;
revoke all on function public.ftf_publish_safety_plan_master(
  uuid, uuid, text, jsonb, text
) from anon;
revoke all on function public.ftf_publish_safety_plan_master(
  uuid, uuid, text, jsonb, text
) from authenticated;
grant execute on function public.ftf_publish_safety_plan_master(
  uuid, uuid, text, jsonb, text
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
