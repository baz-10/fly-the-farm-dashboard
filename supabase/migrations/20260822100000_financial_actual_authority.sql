-- Financial Actuals Phase 1: stable aggregate, Draft revision authority and
-- relational work/cost/provenance foundations. Final calculation, operational
-- prefill, correction and archive commands are intentionally later migrations.

create table public.financial_actuals(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  operating_location_id uuid not null,
  reference text not null check(reference~'^FA-[0-9]{6,}$'),
  client_id uuid not null,
  property_id uuid not null,
  field_id uuid not null,
  job_id uuid not null,
  mission_id uuid,
  current_final_revision_id uuid,
  active_draft_revision_id uuid,
  archived_at timestamptz,
  archived_by_internal_user_id uuid,
  archive_reason text check(archive_reason is null or length(btrim(archive_reason)) between 1 and 500),
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  row_version integer not null default 1 check(row_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,id),
  unique(organisation_id,reference),
  foreign key(organisation_id)references public.organisations(id),
  foreign key(organisation_id,operating_location_id)references public.operating_locations(organisation_id,id),
  foreign key(organisation_id,client_id)references public.clients(organisation_id,id),
  foreign key(organisation_id,client_id,property_id)references public.properties(organisation_id,client_id,id),
  foreign key(organisation_id,property_id,field_id)references public.fields(organisation_id,property_id,id),
  foreign key(organisation_id,property_id,job_id)references public.jobs(organisation_id,property_id,id),
  foreign key(organisation_id,mission_id)references public.missions(organisation_id,id),
  foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
  foreign key(organisation_id,updated_by_internal_user_id)references public.internal_users(organisation_id,id),
  foreign key(organisation_id,archived_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.financial_actual_revisions(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  financial_actual_id uuid not null,
  revision_number integer not null check(revision_number>0),
  status text not null check(status in('DRAFT','FINAL')),
  predecessor_revision_id uuid,
  correction_reason text check(correction_reason is null or length(btrim(correction_reason)) between 1 and 1000),
  currency_code text not null check(currency_code~'^[A-Z]{3}$'),
  calculation_version text not null check(length(btrim(calculation_version)) between 1 and 100),
  start_date date not null,
  end_date date not null check(end_date>=start_date),
  source_manifest jsonb not null default'{}'::jsonb check(jsonb_typeof(source_manifest)='object'),
  input_snapshot jsonb,
  provenance_snapshot jsonb,
  calculation_snapshot jsonb,
  input_digest text check(input_digest is null or input_digest~'^[0-9a-f]{64}$'),
  finalised_at timestamptz,
  finalised_by_internal_user_id uuid,
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  row_version integer not null default 1 check(row_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,id),
  unique(organisation_id,financial_actual_id,id),
  unique(organisation_id,financial_actual_id,revision_number),
  foreign key(organisation_id,financial_actual_id)references public.financial_actuals(organisation_id,id),
  foreign key(organisation_id,financial_actual_id,predecessor_revision_id)references public.financial_actual_revisions(organisation_id,financial_actual_id,id),
  foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
  foreign key(organisation_id,updated_by_internal_user_id)references public.internal_users(organisation_id,id),
  foreign key(organisation_id,finalised_by_internal_user_id)references public.internal_users(organisation_id,id),
  check(
    (status='DRAFT'and finalised_at is null and finalised_by_internal_user_id is null and input_snapshot is null and provenance_snapshot is null and calculation_snapshot is null and input_digest is null)
    or
    (status='FINAL'and finalised_at is not null and finalised_by_internal_user_id is not null and jsonb_typeof(input_snapshot)='object'and jsonb_typeof(provenance_snapshot)='object'and jsonb_typeof(calculation_snapshot)='object'and input_digest is not null)
  ),
  check((revision_number=1 and predecessor_revision_id is null and correction_reason is null)or(revision_number>1 and predecessor_revision_id is not null and length(btrim(correction_reason))>0))
);

alter table public.financial_actuals add constraint financial_actuals_current_final_revision_fk
  foreign key(organisation_id,id,current_final_revision_id)references public.financial_actual_revisions(organisation_id,financial_actual_id,id);
alter table public.financial_actuals add constraint financial_actuals_active_draft_revision_fk
  foreign key(organisation_id,id,active_draft_revision_id)references public.financial_actual_revisions(organisation_id,financial_actual_id,id);

create unique index financial_actual_one_active_draft_idx on public.financial_actual_revisions(organisation_id,financial_actual_id)where status='DRAFT';
create index financial_actuals_location_current_idx on public.financial_actuals(organisation_id,operating_location_id,id)where archived_at is null;
create index financial_actuals_job_idx on public.financial_actuals(organisation_id,job_id)where archived_at is null;
create index financial_actuals_mission_idx on public.financial_actuals(organisation_id,mission_id)where mission_id is not null and archived_at is null;

create table public.financial_actual_value_provenance(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  financial_actual_id uuid not null,
  financial_actual_revision_id uuid not null,
  field_path text not null check(length(btrim(field_path)) between 1 and 300),
  provenance_class text not null check(provenance_class in('AUTHORITATIVE_OPERATIONAL_INPUT','SYSTEM_DERIVED','MANUAL_FINANCIAL_INPUT','MANUAL_OVERRIDE','QUOTE_DERIVED')),
  predecessor_provenance_id uuid,
  source_entity_type text check(source_entity_type is null or length(btrim(source_entity_type)) between 1 and 100),
  source_entity_id uuid,
  source_version text check(source_version is null or length(btrim(source_version)) between 1 and 200),
  source_recorded_at timestamptz,
  original_value jsonb not null,
  effective_value jsonb not null,
  unit_code text check(unit_code is null or unit_code~'^[A-Z][A-Z0-9_]{0,31}$'),
  override_reason text check(override_reason is null or length(btrim(override_reason)) between 1 and 1000),
  created_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(organisation_id,id),
  unique(organisation_id,financial_actual_revision_id,id),
  foreign key(organisation_id,financial_actual_id,financial_actual_revision_id)references public.financial_actual_revisions(organisation_id,financial_actual_id,id),
  foreign key(organisation_id,financial_actual_revision_id,predecessor_provenance_id)references public.financial_actual_value_provenance(organisation_id,financial_actual_revision_id,id),
  foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
  check((provenance_class='MANUAL_OVERRIDE'and predecessor_provenance_id is not null and length(btrim(override_reason))>0)or(provenance_class<>'MANUAL_OVERRIDE'and predecessor_provenance_id is null)),
  check((source_entity_id is null and source_entity_type is null and source_version is null)or(source_entity_id is not null and source_entity_type is not null and source_version is not null)),
  check(provenance_class<>'QUOTE_DERIVED'or source_entity_id is not null)
);

create table public.financial_actual_work_entries(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  financial_actual_id uuid not null,
  financial_actual_revision_id uuid not null,
  work_date date not null,
  actual_work_hours numeric(10,4) not null check(actual_work_hours>=0),
  provenance_id uuid not null,
  created_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(organisation_id,id),
  unique(organisation_id,financial_actual_revision_id,work_date),
  foreign key(organisation_id,financial_actual_id,financial_actual_revision_id)references public.financial_actual_revisions(organisation_id,financial_actual_id,id),
  foreign key(organisation_id,financial_actual_revision_id,provenance_id)references public.financial_actual_value_provenance(organisation_id,financial_actual_revision_id,id),
  foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id)
);

create table public.financial_actual_cost_lines(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  financial_actual_id uuid not null,
  financial_actual_revision_id uuid not null,
  category text not null check(category in('LABOUR','PRODUCT','TRAVEL','AIRCRAFT_EQUIPMENT','OTHER')),
  subtype text not null check(subtype~'^[A-Z][A-Z0-9_]{0,63}$'),
  description text not null check(length(btrim(description)) between 1 and 500),
  incurred_on date,
  quantity numeric(18,6) not null check(quantity>=0),
  unit_code text not null check(unit_code~'^[A-Z][A-Z0-9_]{0,31}$'),
  unit_cost numeric(19,4) not null check(unit_cost>=0),
  amount numeric(19,2) not null check(amount>=0),
  provenance_id uuid not null,
  source_entity_type text check(source_entity_type is null or length(btrim(source_entity_type)) between 1 and 100),
  source_entity_id uuid,
  source_version text check(source_version is null or length(btrim(source_version)) between 1 and 200),
  display_order integer not null default 0 check(display_order>=0),
  created_by_internal_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique(organisation_id,id),
  foreign key(organisation_id,financial_actual_id,financial_actual_revision_id)references public.financial_actual_revisions(organisation_id,financial_actual_id,id),
  foreign key(organisation_id,financial_actual_revision_id,provenance_id)references public.financial_actual_value_provenance(organisation_id,financial_actual_revision_id,id),
  foreign key(organisation_id,created_by_internal_user_id)references public.internal_users(organisation_id,id),
  check(category<>'OTHER'or subtype='MISCELLANEOUS'),
  check((source_entity_id is null and source_entity_type is null and source_version is null)or(source_entity_id is not null and source_entity_type is not null and source_version is not null))
);

create function public.ftf_guard_financial_actual_revision_mutation()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE'then
    if old.status='FINAL'then raise exception using errcode='55000',message='FINANCIAL_ACTUAL_FINAL_IMMUTABLE';end if;
    return old;
  end if;
  if tg_op='UPDATE'and old.status='FINAL'then raise exception using errcode='55000',message='FINANCIAL_ACTUAL_FINAL_IMMUTABLE';end if;
  if new.status='FINAL'and coalesce(current_setting('app.financial_actual_finalisation',true),'')<>'allowed'then raise exception using errcode='55000',message='FINANCIAL_ACTUAL_FINALISATION_COMMAND_REQUIRED';end if;
  return new;
end$$;
create trigger financial_actual_revision_mutation_guard before insert or update or delete on public.financial_actual_revisions for each row execute function public.ftf_guard_financial_actual_revision_mutation();

create function public.ftf_guard_financial_actual_child_mutation()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_revision_id uuid;v_status text;v_field_path text;v_effective_value text;v_effective_type text;v_effective_numeric numeric;v_unit_code text;v_currency_code text;v_new jsonb;
begin
  v_revision_id:=case when tg_op='DELETE'then old.financial_actual_revision_id else new.financial_actual_revision_id end;
  select status into v_status from public.financial_actual_revisions where id=v_revision_id;
  if v_status='FINAL'then raise exception using errcode='55000',message='FINANCIAL_ACTUAL_FINAL_IMMUTABLE';end if;
  if tg_op<>'DELETE'and tg_table_name in('financial_actual_work_entries','financial_actual_cost_lines')then
    v_new:=to_jsonb(new);
    select p.field_path,p.effective_value#>>'{}',jsonb_typeof(p.effective_value),p.unit_code,r.currency_code into v_field_path,v_effective_value,v_effective_type,v_unit_code,v_currency_code
    from public.financial_actual_value_provenance p join public.financial_actual_revisions r on r.organisation_id=p.organisation_id and r.financial_actual_id=p.financial_actual_id and r.id=p.financial_actual_revision_id
    where p.organisation_id=new.organisation_id and p.financial_actual_id=new.financial_actual_id and p.financial_actual_revision_id=new.financial_actual_revision_id and p.id=new.provenance_id;
    if not found then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_PROVENANCE_MISMATCH';end if;
    if v_effective_type is distinct from'string'then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_PROVENANCE_MISMATCH';end if;
    begin v_effective_numeric:=v_effective_value::numeric;exception when others then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_PROVENANCE_MISMATCH';end;
    if tg_table_name='financial_actual_work_entries'and(v_field_path is distinct from'workEntries/'||(v_new->>'work_date')||'/actualWorkHours'or v_unit_code is distinct from'HOUR'or v_effective_numeric is distinct from(v_new->>'actual_work_hours')::numeric)then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_PROVENANCE_MISMATCH';end if;
    if tg_table_name='financial_actual_cost_lines'and(v_field_path is distinct from'costLines/'||(v_new->>'id')||'/amount'or v_unit_code is distinct from v_currency_code or v_effective_numeric is distinct from(v_new->>'amount')::numeric)then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_PROVENANCE_MISMATCH';end if;
  end if;
  return case when tg_op='DELETE'then old else new end;
end$$;
create trigger financial_actual_provenance_mutation_guard before insert or update or delete on public.financial_actual_value_provenance for each row execute function public.ftf_guard_financial_actual_child_mutation();
create trigger financial_actual_work_mutation_guard before insert or update or delete on public.financial_actual_work_entries for each row execute function public.ftf_guard_financial_actual_child_mutation();
create trigger financial_actual_cost_mutation_guard before insert or update or delete on public.financial_actual_cost_lines for each row execute function public.ftf_guard_financial_actual_child_mutation();

create function public.ftf_guard_financial_actual_revision_pointers()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.current_final_revision_id is not null and not exists(select 1 from public.financial_actual_revisions r where r.organisation_id=new.organisation_id and r.financial_actual_id=new.id and r.id=new.current_final_revision_id and r.status='FINAL')then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVISION_POINTER_INVALID';end if;
  if new.active_draft_revision_id is not null and not exists(select 1 from public.financial_actual_revisions r where r.organisation_id=new.organisation_id and r.financial_actual_id=new.id and r.id=new.active_draft_revision_id and r.status='DRAFT')then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVISION_POINTER_INVALID';end if;
  return new;
end$$;
create trigger financial_actual_revision_pointer_guard before insert or update of current_final_revision_id,active_draft_revision_id on public.financial_actuals for each row execute function public.ftf_guard_financial_actual_revision_pointers();

create function public.ftf_sync_financial_actual_final_revision_pointers()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status='DRAFT'and new.status='FINAL'then
    update public.financial_actuals set current_final_revision_id=new.id,active_draft_revision_id=null,updated_by_internal_user_id=new.updated_by_internal_user_id where organisation_id=new.organisation_id and id=new.financial_actual_id and active_draft_revision_id=new.id;
    if not found then raise exception using errcode='23514',message='FINANCIAL_ACTUAL_REVISION_POINTER_INVALID';end if;
  end if;
  return new;
end$$;
create trigger financial_actual_final_revision_pointer_sync after update of status on public.financial_actual_revisions for each row execute function public.ftf_sync_financial_actual_final_revision_pointers();

create trigger financial_actuals_update_metadata before update on public.financial_actuals for each row execute function public.set_tenant_row_update_metadata();
create trigger financial_actual_revisions_update_metadata before update on public.financial_actual_revisions for each row execute function public.set_tenant_row_update_metadata();

alter table public.financial_actuals enable row level security;
alter table public.financial_actuals force row level security;
revoke all on table public.financial_actuals from public, anon, authenticated, service_role;
alter table public.financial_actual_revisions enable row level security;
alter table public.financial_actual_revisions force row level security;
revoke all on table public.financial_actual_revisions from public, anon, authenticated, service_role;
alter table public.financial_actual_value_provenance enable row level security;
alter table public.financial_actual_value_provenance force row level security;
revoke all on table public.financial_actual_value_provenance from public, anon, authenticated, service_role;
alter table public.financial_actual_work_entries enable row level security;
alter table public.financial_actual_work_entries force row level security;
revoke all on table public.financial_actual_work_entries from public, anon, authenticated, service_role;
alter table public.financial_actual_cost_lines enable row level security;
alter table public.financial_actual_cost_lines force row level security;
revoke all on table public.financial_actual_cost_lines from public, anon, authenticated, service_role;

create function public.ftf_financial_actor_has_permission(p_organisation_id uuid,p_actor_internal_user_id uuid,p_code text)returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from public.memberships m join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id join public.role_permissions rp on rp.organisation_id=r.organisation_id and rp.role_id=r.id and rp.archived_at is null join public.permissions p on p.organisation_id=rp.organisation_id and p.id=rp.permission_id and p.archived_at is null where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and r.archived_at is null and p.code=p_code)
$$;
create function public.ftf_financial_actor_has_location(p_organisation_id uuid,p_actor_internal_user_id uuid,p_location_id uuid)returns boolean language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from public.memberships m join public.membership_operating_location_assignments a on a.organisation_id=m.organisation_id and a.membership_id=m.id join public.operating_locations l on l.organisation_id=a.organisation_id and l.id=a.operating_location_id where m.organisation_id=p_organisation_id and m.internal_user_id=p_actor_internal_user_id and m.is_active and m.archived_at is null and a.is_active and a.archived_at is null and l.id=p_location_id and l.archived_at is null)
$$;

create function public.ftf_provision_financial_actual_permissions()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.code<>'admin'then return new;end if;
  insert into public.permissions(organisation_id,code,description)select new.organisation_id,v.code,v.description from(values
    ('financial_actuals.read','View Financial Actuals'),('financial_actuals.create','Create Financial Actual drafts'),('financial_actuals.update','Update Financial Actual drafts'),('financial_actuals.finalise','Finalise Financial Actual revisions'),('financial_actuals.archive','Archive Financial Actuals'),('financial_actuals.export','Export authoritative Financial Actual evidence')
  )v(code,description)on conflict(organisation_id,code)do nothing;
  if exists(select 1 from public.internal_users u where u.organisation_id=new.organisation_id)then
    insert into public.role_permissions(organisation_id,role_id,permission_id)select new.organisation_id,new.id,p.id from public.permissions p where p.organisation_id=new.organisation_id and p.code like'financial_actuals.%'on conflict(organisation_id,role_id,permission_id)do nothing;
  end if;
  return new;
end$$;
create trigger roles_provision_financial_actual_permissions after insert on public.roles for each row execute function public.ftf_provision_financial_actual_permissions();

insert into public.permissions(organisation_id,code,description)
select o.id,v.code,v.description from public.organisations o cross join(values
  ('financial_actuals.read','View Financial Actuals'),('financial_actuals.create','Create Financial Actual drafts'),('financial_actuals.update','Update Financial Actual drafts'),('financial_actuals.finalise','Finalise Financial Actual revisions'),('financial_actuals.archive','Archive Financial Actuals'),('financial_actuals.export','Export authoritative Financial Actual evidence')
)v(code,description)on conflict(organisation_id,code)do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select r.organisation_id,r.id,p.id from public.roles r join public.permissions p on p.organisation_id=r.organisation_id and p.code like'financial_actuals.%'where r.code='admin'and r.archived_at is null on conflict(organisation_id,role_id,permission_id)do nothing;
create function public.ftf_replace_financial_actual_draft_children(p_organisation_id uuid,p_actor_internal_user_id uuid,p_actual_id uuid,p_revision_id uuid,p_payload jsonb)returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb;
begin
  delete from public.financial_actual_work_entries where organisation_id=p_organisation_id and financial_actual_revision_id=p_revision_id;
  delete from public.financial_actual_cost_lines where organisation_id=p_organisation_id and financial_actual_revision_id=p_revision_id;
  delete from public.financial_actual_value_provenance where organisation_id=p_organisation_id and financial_actual_revision_id=p_revision_id;
  for v in select value from jsonb_array_elements(coalesce(p_payload->'provenance','[]'::jsonb))loop
    insert into public.financial_actual_value_provenance(id,organisation_id,financial_actual_id,financial_actual_revision_id,field_path,provenance_class,predecessor_provenance_id,source_entity_type,source_entity_id,source_version,source_recorded_at,original_value,effective_value,unit_code,override_reason,created_by_internal_user_id)values(
      (v->>'id')::uuid,p_organisation_id,p_actual_id,p_revision_id,btrim(v->>'fieldPath'),v->>'provenanceClass',nullif(v->>'predecessorProvenanceId','')::uuid,nullif(btrim(v->>'sourceEntityType'),''),nullif(v->>'sourceEntityId','')::uuid,nullif(btrim(v->>'sourceVersion'),''),nullif(v->>'sourceRecordedAt','')::timestamptz,v->'originalValue',v->'effectiveValue',nullif(btrim(v->>'unitCode'),''),nullif(btrim(v->>'overrideReason'),''),p_actor_internal_user_id);
  end loop;
  for v in select value from jsonb_array_elements(coalesce(p_payload->'workEntries','[]'::jsonb))loop
    insert into public.financial_actual_work_entries(id,organisation_id,financial_actual_id,financial_actual_revision_id,work_date,actual_work_hours,provenance_id,created_by_internal_user_id)values((v->>'id')::uuid,p_organisation_id,p_actual_id,p_revision_id,(v->>'workDate')::date,(v->>'actualWorkHours')::numeric,(v->>'provenanceId')::uuid,p_actor_internal_user_id);
  end loop;
  for v in select value from jsonb_array_elements(coalesce(p_payload->'costLines','[]'::jsonb))loop
    insert into public.financial_actual_cost_lines(id,organisation_id,financial_actual_id,financial_actual_revision_id,category,subtype,description,incurred_on,quantity,unit_code,unit_cost,amount,provenance_id,source_entity_type,source_entity_id,source_version,display_order,created_by_internal_user_id)values((v->>'id')::uuid,p_organisation_id,p_actual_id,p_revision_id,v->>'category',v->>'subtype',btrim(v->>'description'),nullif(v->>'incurredOn','')::date,(v->>'quantity')::numeric,v->>'unitCode',(v->>'unitCost')::numeric,(v->>'amount')::numeric,(v->>'provenanceId')::uuid,nullif(btrim(v->>'sourceEntityType'),''),nullif(v->>'sourceEntityId','')::uuid,nullif(btrim(v->>'sourceVersion'),''),coalesce((v->>'displayOrder')::integer,0),p_actor_internal_user_id);
  end loop;
end$$;

create function public.ftf_list_financial_actuals(p_organisation_id uuid,p_actor_internal_user_id uuid,p_operating_location_id uuid default null,p_after_id uuid default null,p_page_size integer default 25)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  if p_operating_location_id is not null and not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,p_operating_location_id)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  select coalesce(jsonb_agg(to_jsonb(x)order by x.id),'[]'::jsonb)into v_rows from(select a.* from public.financial_actuals a where a.organisation_id=p_organisation_id and a.archived_at is null and(p_operating_location_id is not null and a.operating_location_id=p_operating_location_id or p_operating_location_id is null and public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,a.operating_location_id))and(p_after_id is null or a.id>p_after_id)order by a.id limit least(greatest(coalesce(p_page_size,25),1),100))x;
  return jsonb_build_object('rows',v_rows);
end$$;

create function public.ftf_read_financial_actual(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,p_revision_number integer default null)returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_actual public.financial_actuals%rowtype;v_revisions jsonb;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.read')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select*into v_actual from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id;
  if not found or not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,v_actual.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  select coalesce(jsonb_agg(to_jsonb(r)order by revision_number desc),'[]'::jsonb)into v_revisions from public.financial_actual_revisions r where r.organisation_id=p_organisation_id and r.financial_actual_id=v_actual.id and(p_revision_number is null or r.revision_number=p_revision_number);
  return jsonb_build_object('record',to_jsonb(v_actual),'revisions',v_revisions);
end$$;

create function public.ftf_create_financial_actual(p_organisation_id uuid,p_actor_internal_user_id uuid,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actual public.financial_actuals%rowtype;v_revision public.financial_actual_revisions%rowtype;v_location uuid;v_client uuid;v_property uuid;v_field uuid;v_job uuid;v_mission uuid;v_reference text;v_number integer;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.create')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  begin v_location:=(p_payload->>'operatingLocationId')::uuid;v_client:=(p_payload->>'clientId')::uuid;v_property:=(p_payload->>'propertyId')::uuid;v_field:=(p_payload->>'fieldId')::uuid;v_job:=(p_payload->>'jobId')::uuid;v_mission:=nullif(p_payload->>'missionId','')::uuid;exception when others then return jsonb_build_object('relationship_conflict',true);end;
  if not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,v_location)then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_LOCATION_FORBIDDEN';end if;
  if not exists(select 1 from public.clients c join public.properties p on p.organisation_id=c.organisation_id and p.client_id=c.id join public.fields f on f.organisation_id=p.organisation_id and f.property_id=p.id join public.jobs j on j.organisation_id=c.organisation_id and j.client_id=c.id and j.property_id=p.id join public.job_fields jf on jf.organisation_id=j.organisation_id and jf.job_id=j.id and jf.field_id=f.id and jf.archived_at is null where c.organisation_id=p_organisation_id and c.id=v_client and p.id=v_property and f.id=v_field and j.id=v_job and c.archived_at is null and p.archived_at is null and f.archived_at is null and j.archived_at is null)then return jsonb_build_object('relationship_conflict',true);end if;
  if v_mission is not null and not exists(select 1 from public.missions m where m.organisation_id=p_organisation_id and m.id=v_mission and m.job_id=v_job and m.operating_location_id=v_location and m.archived_at is null)then return jsonb_build_object('relationship_conflict',true);end if;
  perform pg_advisory_xact_lock(hashtextextended('financial-actual-reference:'||p_organisation_id::text,0));
  select coalesce(max(substring(reference from 4)::integer),0)+1 into v_number from public.financial_actuals where organisation_id=p_organisation_id;
  v_reference:='FA-'||lpad(v_number::text,6,'0');
  insert into public.financial_actuals(organisation_id,operating_location_id,reference,client_id,property_id,field_id,job_id,mission_id,created_by_internal_user_id,updated_by_internal_user_id)values(p_organisation_id,v_location,v_reference,v_client,v_property,v_field,v_job,v_mission,p_actor_internal_user_id,p_actor_internal_user_id)returning*into v_actual;
  insert into public.financial_actual_revisions(organisation_id,financial_actual_id,revision_number,status,currency_code,calculation_version,start_date,end_date,created_by_internal_user_id,updated_by_internal_user_id)values(p_organisation_id,v_actual.id,1,'DRAFT',p_payload->>'currencyCode',p_payload->>'formulaVersion',(p_payload->>'startDate')::date,(p_payload->>'endDate')::date,p_actor_internal_user_id,p_actor_internal_user_id)returning*into v_revision;
  update public.financial_actuals set active_draft_revision_id=v_revision.id,updated_by_internal_user_id=p_actor_internal_user_id where organisation_id=p_organisation_id and id=v_actual.id returning*into v_actual;
  perform public.ftf_replace_financial_actual_draft_children(p_organisation_id,p_actor_internal_user_id,v_actual.id,v_revision.id,p_payload);
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.created','financial_actual',v_actual.id,jsonb_build_object('reference',v_actual.reference,'revision_id',v_revision.id,'revision_number',1,'operating_location_id',v_location));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.created','financial_actual',v_actual.id,jsonb_build_object('revision_id',v_revision.id,'revision_number',1,'row_version',v_actual.row_version));
  return jsonb_build_object('record',to_jsonb(v_actual),'revision',to_jsonb(v_revision));
end$$;

create function public.ftf_update_financial_actual_draft(p_organisation_id uuid,p_actor_internal_user_id uuid,p_financial_actual_id uuid,p_revision_id uuid,p_expected_version integer,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actual public.financial_actuals%rowtype;v_revision public.financial_actual_revisions%rowtype;
begin
  if not public.ftf_financial_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'financial_actuals.update')then raise exception using errcode='42501',message='FINANCIAL_ACTUAL_FORBIDDEN';end if;
  select*into v_actual from public.financial_actuals where organisation_id=p_organisation_id and id=p_financial_actual_id and archived_at is null for update;
  if not found or not public.ftf_financial_actor_has_location(p_organisation_id,p_actor_internal_user_id,v_actual.operating_location_id)then return jsonb_build_object('not_found',true);end if;
  select*into v_revision from public.financial_actual_revisions where organisation_id=p_organisation_id and financial_actual_id=v_actual.id and id=p_revision_id for update;
  if not found or v_revision.status<>'DRAFT'or v_actual.active_draft_revision_id<>v_revision.id then return jsonb_build_object('not_found',true);end if;
  if v_revision.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',v_revision.row_version);end if;
  update public.financial_actual_revisions set currency_code=p_payload->>'currencyCode',calculation_version=p_payload->>'formulaVersion',start_date=(p_payload->>'startDate')::date,end_date=(p_payload->>'endDate')::date,updated_by_internal_user_id=p_actor_internal_user_id where id=v_revision.id returning*into v_revision;
  perform public.ftf_replace_financial_actual_draft_children(p_organisation_id,p_actor_internal_user_id,v_actual.id,v_revision.id,p_payload);
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)values(p_organisation_id,p_actor_internal_user_id,'financial_actual.draft_updated','financial_actual_revision',v_revision.id,jsonb_build_object('financial_actual_id',v_actual.id,'revision_number',v_revision.revision_number,'row_version',v_revision.row_version));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)values(p_organisation_id,'financial.actual.draft_updated','financial_actual',v_actual.id,jsonb_build_object('revision_id',v_revision.id,'revision_number',v_revision.revision_number,'row_version',v_revision.row_version));
  return jsonb_build_object('record',to_jsonb(v_actual),'revision',to_jsonb(v_revision));
end$$;

revoke all on function public.ftf_financial_actor_has_permission(uuid,uuid,text),public.ftf_financial_actor_has_location(uuid,uuid,uuid),public.ftf_provision_financial_actual_permissions(),public.ftf_replace_financial_actual_draft_children(uuid,uuid,uuid,uuid,jsonb),public.ftf_guard_financial_actual_revision_mutation(),public.ftf_guard_financial_actual_child_mutation(),public.ftf_guard_financial_actual_revision_pointers(),public.ftf_sync_financial_actual_final_revision_pointers()from public,anon,authenticated,service_role;
revoke all on function public.ftf_list_financial_actuals(uuid,uuid,uuid,uuid,integer),public.ftf_read_financial_actual(uuid,uuid,uuid,integer),public.ftf_create_financial_actual(uuid,uuid,jsonb),public.ftf_update_financial_actual_draft(uuid,uuid,uuid,uuid,integer,jsonb)from public,anon,authenticated;
grant execute on function public.ftf_list_financial_actuals(uuid,uuid,uuid,uuid,integer),public.ftf_read_financial_actual(uuid,uuid,uuid,integer),public.ftf_create_financial_actual(uuid,uuid,jsonb),public.ftf_update_financial_actual_draft(uuid,uuid,uuid,uuid,integer,jsonb)to service_role;
