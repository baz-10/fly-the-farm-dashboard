-- Authoritative maintenance technical catalogue: canonical parts and fluids, private preferences,
-- exact-version applicability, and optional versioned Service Kits / Service Recipes.
-- This migration deliberately contains no Production fixture data, due-state engine, maintenance
-- requirements, Prepare Service execution, purchasing, or tracked-component creation.

create table public.technical_parts (
  id uuid primary key default gen_random_uuid(),
  manufacturer text not null check (length(btrim(manufacturer)) between 1 and 160),
  manufacturer_part_number text not null check (length(btrim(manufacturer_part_number)) between 1 and 160),
  normalised_manufacturer text generated always as (upper(regexp_replace(btrim(manufacturer), '[^A-Za-z0-9]', '', 'g'))) stored,
  normalised_part_number text generated always as (upper(regexp_replace(btrim(manufacturer_part_number), '[^A-Za-z0-9]', '', 'g'))) stored,
  superseded_by_part_id uuid references public.technical_parts(id),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalised_manufacturer <> '' and normalised_part_number <> ''),
  check (superseded_by_part_id is null or superseded_by_part_id <> id)
);
create unique index technical_parts_manufacturer_number_unique
  on public.technical_parts(normalised_manufacturer, normalised_part_number);

create table public.technical_part_versions (
  id uuid primary key default gen_random_uuid(),
  technical_part_id uuid not null references public.technical_parts(id),
  version_number integer not null check (version_number > 0),
  manufacturer text not null check (length(btrim(manufacturer)) between 1 and 160),
  manufacturer_part_number text not null check (length(btrim(manufacturer_part_number)) between 1 and 160),
  technical_description text not null check (length(btrim(technical_description)) between 1 and 2000),
  part_category text not null check (length(btrim(part_category)) between 1 and 120),
  authority_type text not null check (authority_type in ('MANUFACTURER', 'VERIFIED_TECHNICAL_SOURCE')),
  lifecycle_state text not null default 'DRAFT' check (lifecycle_state in ('DRAFT', 'PROPOSED', 'REVIEWED', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'RETIRED')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb),
  approved_by_platform_user_id uuid references public.platform_users(id),
  approved_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  supersedes_version_id uuid references public.technical_part_versions(id),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technical_part_id, version_number),
  unique (id, technical_part_id),
  check ((approved_by_platform_user_id is null) = (approved_at is null)),
  check (lifecycle_state not in ('APPROVED', 'EFFECTIVE', 'SUPERSEDED') or approved_by_platform_user_id is not null),
  check (effective_to is null or (effective_from is not null and effective_to > effective_from)),
  check (supersedes_version_id is null or supersedes_version_id <> id)
);
create unique index technical_part_versions_one_effective
  on public.technical_part_versions(technical_part_id) where lifecycle_state='EFFECTIVE';

create function public.ftf_guard_technical_part_version_identity() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare part public.technical_parts%rowtype;
begin
  select * into part from public.technical_parts where id=new.technical_part_id;
  if not found or part.normalised_manufacturer<>upper(regexp_replace(btrim(new.manufacturer),'[^A-Za-z0-9]','','g'))
    or part.normalised_part_number<>upper(regexp_replace(btrim(new.manufacturer_part_number),'[^A-Za-z0-9]','','g')) then
    raise exception 'TECHNICAL_PART_VERSION_IDENTITY_MISMATCH' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger technical_part_versions_identity before insert or update of technical_part_id,manufacturer,manufacturer_part_number
on public.technical_part_versions for each row execute function public.ftf_guard_technical_part_version_identity();

create table public.technical_fluid_specifications (
  id uuid primary key default gen_random_uuid(),
  specification_code text not null check (length(btrim(specification_code)) between 1 and 160),
  normalised_specification_code text generated always as (upper(regexp_replace(btrim(specification_code), '\\s+', '', 'g'))) stored,
  display_name text not null check (length(btrim(display_name)) between 1 and 240),
  superseded_by_specification_id uuid references public.technical_fluid_specifications(id),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (normalised_specification_code <> ''),
  check (superseded_by_specification_id is null or superseded_by_specification_id <> id),
  unique (normalised_specification_code)
);

create table public.technical_fluid_specification_versions (
  id uuid primary key default gen_random_uuid(),
  technical_fluid_specification_id uuid not null references public.technical_fluid_specifications(id),
  version_number integer not null check (version_number > 0),
  fluid_type text not null check (length(btrim(fluid_type)) between 1 and 120),
  viscosity_or_grade text,
  technical_standards jsonb not null default '[]'::jsonb check (jsonb_typeof(technical_standards) = 'array'),
  compatibility_constraints text,
  authority_type text not null check (authority_type in ('MANUFACTURER', 'VERIFIED_TECHNICAL_SOURCE')),
  lifecycle_state text not null default 'DRAFT' check (lifecycle_state in ('DRAFT', 'PROPOSED', 'REVIEWED', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'RETIRED')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and evidence <> '{}'::jsonb),
  approved_by_platform_user_id uuid references public.platform_users(id),
  approved_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  supersedes_version_id uuid references public.technical_fluid_specification_versions(id),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (technical_fluid_specification_id, version_number),
  unique (id, technical_fluid_specification_id),
  check ((approved_by_platform_user_id is null) = (approved_at is null)),
  check (lifecycle_state not in ('APPROVED', 'EFFECTIVE', 'SUPERSEDED') or approved_by_platform_user_id is not null),
  check (effective_to is null or (effective_from is not null and effective_to > effective_from)),
  check (supersedes_version_id is null or supersedes_version_id <> id)
);
create unique index technical_fluid_versions_one_effective
  on public.technical_fluid_specification_versions(technical_fluid_specification_id) where lifecycle_state='EFFECTIVE';

create function public.ftf_technical_version_effective_at(
  p_lifecycle_state text,p_effective_from timestamptz,p_effective_to timestamptz,p_instant timestamptz
) returns boolean language sql immutable set search_path=public,pg_temp as $$
  select p_instant is not null and p_lifecycle_state='EFFECTIVE'
    and p_effective_from is not null and p_effective_from<=p_instant
    and (p_effective_to is null or p_effective_to>p_instant);
$$;

create function public.ftf_version_historically_effective_at(
  p_lifecycle_state text,p_effective_from timestamptz,p_effective_to timestamptz,p_instant timestamptz
) returns boolean language sql immutable set search_path=public,pg_temp as $$
  select p_instant is not null and p_lifecycle_state in ('EFFECTIVE','SUPERSEDED')
    and p_effective_from is not null and p_effective_from<=p_instant
    and (p_effective_to is null or p_effective_to>p_instant);
$$;

create function public.ftf_normalise_technical_scope(p_value text)
returns text language sql immutable set search_path=public,pg_temp as $$
  select upper(regexp_replace(btrim(p_value),'[^A-Za-z0-9]','','g'));
$$;

create function public.ftf_guard_technical_part_version_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'TECHNICAL_PART_VERSION_IMMUTABLE' using errcode='55000'; end if;
  if old.lifecycle_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') and
     (to_jsonb(new)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') is distinct from
     (to_jsonb(old)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') then
    raise exception 'TECHNICAL_PART_VERSION_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end; $$;
create trigger technical_part_versions_immutable before update or delete on public.technical_part_versions
for each row execute function public.ftf_guard_technical_part_version_mutation();

create function public.ftf_guard_technical_fluid_version_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'TECHNICAL_FLUID_VERSION_IMMUTABLE' using errcode='55000'; end if;
  if old.lifecycle_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') and
     (to_jsonb(new)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') is distinct from
     (to_jsonb(old)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') then
    raise exception 'TECHNICAL_FLUID_VERSION_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end; $$;
create trigger technical_fluid_versions_immutable before update or delete on public.technical_fluid_specification_versions
for each row execute function public.ftf_guard_technical_fluid_version_mutation();

create table public.technical_data_proposals (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations(id),
  proposal_type text not null check (proposal_type in ('PART', 'PART_EQUIVALENCE', 'PART_APPLICABILITY', 'FLUID_SPECIFICATION', 'FLUID_APPLICABILITY', 'SERVICE_TEMPLATE')),
  proposal_state text not null default 'PROPOSED' check (proposal_state in ('PROPOSED', 'REVIEWED', 'APPROVED', 'REJECTED', 'PUBLISHED')),
  proposed_data jsonb not null check (jsonb_typeof(proposed_data) = 'object'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  proposed_by_type text not null check (proposed_by_type in ('HUMAN', 'AI_EXTRACTION', 'MANUAL_EXTRACTION', 'IMPORT')),
  proposed_by_internal_user_id uuid,
  reviewed_by_internal_user_id uuid,
  reviewed_at timestamptz,
  published_entity_type text,
  published_entity_id uuid,
  has_technical_authority boolean generated always as (false) stored,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not has_technical_authority),
  check ((published_entity_type is null) = (published_entity_id is null))
);
create function public.ftf_guard_technical_data_proposal() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.proposal_state='PUBLISHED' and new.published_entity_id is null then
    raise exception 'PROPOSAL_HAS_NO_TECHNICAL_AUTHORITY' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger technical_data_proposals_no_authority before insert or update on public.technical_data_proposals
for each row execute function public.ftf_guard_technical_data_proposal();

create table public.technical_part_equivalences (
  id uuid primary key default gen_random_uuid(),
  left_part_version_id uuid not null references public.technical_part_versions(id),
  right_part_version_id uuid not null references public.technical_part_versions(id),
  directionality text not null check (directionality in ('SYMMETRIC', 'LEFT_TO_RIGHT', 'RIGHT_TO_LEFT')),
  equivalence_scope text not null check (length(btrim(equivalence_scope)) between 1 and 1000),
  limitations text,
  authority_type text not null check (authority_type in ('MANUFACTURER', 'VERIFIED_TECHNICAL_SOURCE')),
  lifecycle_state text not null default 'DRAFT' check (lifecycle_state in ('DRAFT', 'REVIEWED', 'APPROVED', 'EFFECTIVE', 'SUPERSEDED', 'RETIRED')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  verified_by_platform_user_id uuid references public.platform_users(id),
  verified_at timestamptz,
  effective_from timestamptz,
  effective_to timestamptz,
  supersedes_equivalence_id uuid references public.technical_part_equivalences(id),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_part_version_id <> right_part_version_id),
  check ((verified_by_platform_user_id is null) = (verified_at is null)),
  check (lifecycle_state not in ('APPROVED','EFFECTIVE','SUPERSEDED') or (verified_by_platform_user_id is not null and evidence <> '{}'::jsonb)),
  check (effective_to is null or (effective_from is not null and effective_to > effective_from)),
  check (supersedes_equivalence_id is null or supersedes_equivalence_id <> id)
);
create unique index technical_part_equivalences_unique_directed
  on public.technical_part_equivalences(left_part_version_id,right_part_version_id,directionality)
  where lifecycle_state in ('DRAFT','REVIEWED','APPROVED','EFFECTIVE');
create unique index technical_part_equivalences_unique_symmetric
  on public.technical_part_equivalences(
    least(left_part_version_id::text,right_part_version_id::text),
    greatest(left_part_version_id::text,right_part_version_id::text)
  ) where directionality='SYMMETRIC' and lifecycle_state in ('DRAFT','REVIEWED','APPROVED','EFFECTIVE');

create function public.ftf_guard_technical_part_equivalence_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'TECHNICAL_PART_EQUIVALENCE_IMMUTABLE' using errcode='55000'; end if;
  if old.lifecycle_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') and
     (to_jsonb(new)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') is distinct from
     (to_jsonb(old)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') then
    raise exception 'TECHNICAL_PART_EQUIVALENCE_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end; $$;
create trigger technical_part_equivalences_immutable before update or delete on public.technical_part_equivalences
for each row execute function public.ftf_guard_technical_part_equivalence_mutation();

create table public.organisation_part_preferences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  technical_part_id uuid not null references public.technical_parts(id),
  preferred_part_version_id uuid references public.technical_part_versions(id),
  preferred_supplier text,
  supplier_sku text,
  internal_sku text,
  usual_purchase_quantity numeric check (usual_purchase_quantity is null or usual_purchase_quantity > 0),
  purchase_unit_code text check (purchase_unit_code is null or purchase_unit_code in ('EA','SET','PAIR','PACK','ML','L','G','KG')),
  package_quantity numeric check (package_quantity is null or package_quantity > 0),
  package_unit_code text check (package_unit_code is null or package_unit_code in ('EA','SET','PAIR','PACK','ML','L','G','KG')),
  organisation_notes text,
  purchasing_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(purchasing_metadata)='object'),
  is_preferred boolean not null default true,
  active boolean not null default true,
  created_by_internal_user_id uuid,
  updated_by_internal_user_id uuid,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,id),
  unique (organisation_id,technical_part_id),
  foreign key (organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (organisation_id,updated_by_internal_user_id) references public.internal_users(organisation_id,id)
);

create table public.organisation_fluid_preferences (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  technical_fluid_specification_id uuid not null references public.technical_fluid_specifications(id),
  satisfied_fluid_specification_version_id uuid not null references public.technical_fluid_specification_versions(id),
  preferred_product text not null check (length(btrim(preferred_product)) between 1 and 240),
  preferred_brand text,
  preferred_supplier text,
  supplier_sku text,
  preferred_package_quantity numeric check (preferred_package_quantity is null or preferred_package_quantity > 0),
  preferred_package_unit_code text check (preferred_package_unit_code is null or preferred_package_unit_code in ('ML','L','G','KG')),
  normal_purchase_quantity numeric check (normal_purchase_quantity is null or normal_purchase_quantity > 0),
  organisation_notes text,
  purchasing_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(purchasing_metadata)='object'),
  is_preferred boolean not null default true,
  active boolean not null default true,
  created_by_internal_user_id uuid not null,
  updated_by_internal_user_id uuid not null,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,id),
  unique (organisation_id,technical_fluid_specification_id),
  foreign key (satisfied_fluid_specification_version_id,technical_fluid_specification_id)
    references public.technical_fluid_specification_versions(id,technical_fluid_specification_id),
  foreign key (organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (organisation_id,updated_by_internal_user_id) references public.internal_users(organisation_id,id)
);

create function public.ftf_part_preference_version_allowed(p_technical_part_id uuid,p_preferred_version_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.technical_part_versions selected
    where selected.id=p_preferred_version_id
      and public.ftf_technical_version_effective_at(selected.lifecycle_state,selected.effective_from,selected.effective_to,now()) and (
      selected.technical_part_id=p_technical_part_id or exists(
        select 1 from public.technical_part_versions base
        join public.technical_part_equivalences equivalence on
          public.ftf_technical_version_effective_at(equivalence.lifecycle_state,equivalence.effective_from,equivalence.effective_to,now()) and (
          (equivalence.left_part_version_id=base.id and equivalence.right_part_version_id=selected.id and equivalence.directionality in ('SYMMETRIC','LEFT_TO_RIGHT'))
          or (equivalence.right_part_version_id=base.id and equivalence.left_part_version_id=selected.id and equivalence.directionality in ('SYMMETRIC','RIGHT_TO_LEFT'))
        ) where base.technical_part_id=p_technical_part_id
          and public.ftf_technical_version_effective_at(base.lifecycle_state,base.effective_from,base.effective_to,now())
      )
    )
  );
$$;
create function public.ftf_guard_organisation_part_preference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.preferred_part_version_id is not null and not public.ftf_part_preference_version_allowed(new.technical_part_id,new.preferred_part_version_id) then
    raise exception 'PREFERRED_PART_VERSION_NOT_APPROVED_EQUIVALENT' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger organisation_part_preferences_approved_equivalent before insert or update of technical_part_id,preferred_part_version_id
on public.organisation_part_preferences for each row execute function public.ftf_guard_organisation_part_preference();

create function public.ftf_guard_organisation_fluid_preference() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare version public.technical_fluid_specification_versions%rowtype;
begin
  select * into version from public.technical_fluid_specification_versions
    where id=new.satisfied_fluid_specification_version_id and technical_fluid_specification_id=new.technical_fluid_specification_id;
  if not found or not public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,now()) then
    raise exception 'PREFERRED_FLUID_VERSION_NOT_EFFECTIVE' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger organisation_fluid_preferences_effective_specification before insert or update of technical_fluid_specification_id,satisfied_fluid_specification_version_id
on public.organisation_fluid_preferences for each row execute function public.ftf_guard_organisation_fluid_preference();

create table public.asset_part_requirements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  technical_part_version_id uuid not null references public.technical_part_versions(id),
  maintainable_asset_id uuid not null,
  system_id uuid,
  component_position_id uuid,
  application_code text not null check (length(btrim(application_code)) between 1 and 160),
  quantity numeric not null check (quantity > 0),
  unit_code text not null check (unit_code in ('EA','SET','PAIR','PACK')),
  applicability_notes text,
  authority_type text not null check (authority_type='ORGANISATION_STANDARD'),
  lifecycle_state text not null default 'DRAFT' check (lifecycle_state in ('DRAFT','APPROVED','EFFECTIVE','SUPERSEDED','RETIRED')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb),
  effective_from timestamptz,
  effective_to timestamptz,
  approved_by_internal_user_id uuid,
  approved_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,id),
  foreign key (organisation_id,maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key (organisation_id,system_id) references public.asset_systems(organisation_id,id),
  foreign key (organisation_id,component_position_id) references public.component_positions(organisation_id,id),
  check (component_position_id is null or system_id is not null),
  check (effective_to is null or (effective_from is not null and effective_to > effective_from))
);

create table public.asset_fluid_requirements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  fluid_specification_version_id uuid not null references public.technical_fluid_specification_versions(id),
  maintainable_asset_id uuid not null,
  system_id uuid,
  component_position_id uuid,
  service_point text not null check (length(btrim(service_point)) between 1 and 240),
  capacity_semantics text not null check (capacity_semantics in ('SERVICE_FILL', 'DRY_FILL', 'TOTAL_SYSTEM_CAPACITY', 'REFILL_AFTER_FILTER_REPLACEMENT', 'OTHER')),
  quantity numeric not null check (quantity > 0),
  unit_code text not null check (unit_code in ('ML', 'L', 'US_QT', 'IMP_QT', 'G', 'KG')),
  is_approximate boolean not null default false,
  manufacturer_tolerance numeric check (manufacturer_tolerance is null or manufacturer_tolerance >= 0),
  applicability_notes text,
  authority_type text not null check (authority_type='ORGANISATION_STANDARD'),
  lifecycle_state text not null default 'DRAFT' check (lifecycle_state in ('DRAFT','APPROVED','EFFECTIVE','SUPERSEDED','RETIRED')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb),
  effective_from timestamptz,
  effective_to timestamptz,
  approved_by_internal_user_id uuid,
  approved_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id,id),
  foreign key (organisation_id,maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key (organisation_id,system_id) references public.asset_systems(organisation_id,id),
  foreign key (organisation_id,component_position_id) references public.component_positions(organisation_id,id),
  check (component_position_id is null or system_id is not null),
  check (effective_to is null or (effective_from is not null and effective_to > effective_from))
);

create table public.technical_part_applicability (
  id uuid primary key default gen_random_uuid(),
  technical_part_version_id uuid not null references public.technical_part_versions(id),
  manufacturer_scope text not null check(length(btrim(manufacturer_scope))>0),
  model_scope text not null check(length(btrim(model_scope))>0),
  system_code text,
  component_position_code text,
  application_code text not null check(length(btrim(application_code))>0),
  quantity numeric not null check(quantity>0),
  unit_code text not null check(unit_code in ('EA','SET','PAIR','PACK')),
  applicability_notes text,
  authority_type text not null check(authority_type in ('MANUFACTURER','VERIFIED_TECHNICAL_SOURCE')),
  lifecycle_state text not null default 'DRAFT' check(lifecycle_state in ('DRAFT','REVIEWED','APPROVED','EFFECTIVE','SUPERSEDED','RETIRED')),
  evidence jsonb not null check(jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb),
  effective_from timestamptz,
  effective_to timestamptz,
  approved_by_platform_user_id uuid references public.platform_users(id),
  approved_at timestamptz,
  row_version integer not null default 1 check(row_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(component_position_code is null or system_code is not null),
  check((approved_by_platform_user_id is null)=(approved_at is null)),
  check(lifecycle_state not in ('APPROVED','EFFECTIVE','SUPERSEDED') or approved_by_platform_user_id is not null),
  check(effective_to is null or (effective_from is not null and effective_to>effective_from))
);

create table public.technical_fluid_applicability (
  id uuid primary key default gen_random_uuid(),
  fluid_specification_version_id uuid not null references public.technical_fluid_specification_versions(id),
  manufacturer_scope text not null check(length(btrim(manufacturer_scope))>0),
  model_scope text not null check(length(btrim(model_scope))>0),
  system_code text,
  component_position_code text,
  service_point text not null check(length(btrim(service_point))>0),
  capacity_semantics text not null check(capacity_semantics in ('SERVICE_FILL','DRY_FILL','TOTAL_SYSTEM_CAPACITY','REFILL_AFTER_FILTER_REPLACEMENT','OTHER')),
  quantity numeric not null check(quantity>0),
  unit_code text not null check(unit_code in ('ML','L','US_QT','IMP_QT','G','KG')),
  is_approximate boolean not null default false,
  manufacturer_tolerance numeric check(manufacturer_tolerance is null or manufacturer_tolerance>=0),
  applicability_notes text,
  authority_type text not null check(authority_type in ('MANUFACTURER','VERIFIED_TECHNICAL_SOURCE')),
  lifecycle_state text not null default 'DRAFT' check(lifecycle_state in ('DRAFT','REVIEWED','APPROVED','EFFECTIVE','SUPERSEDED','RETIRED')),
  evidence jsonb not null check(jsonb_typeof(evidence)='object' and evidence<>'{}'::jsonb),
  effective_from timestamptz,
  effective_to timestamptz,
  approved_by_platform_user_id uuid references public.platform_users(id),
  approved_at timestamptz,
  row_version integer not null default 1 check(row_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(component_position_code is null or system_code is not null),
  check((approved_by_platform_user_id is null)=(approved_at is null)),
  check(lifecycle_state not in ('APPROVED','EFFECTIVE','SUPERSEDED') or approved_by_platform_user_id is not null),
  check(effective_to is null or (effective_from is not null and effective_to>effective_from))
);

create function public.ftf_guard_asset_technical_scope() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_system public.asset_systems%rowtype; v_position public.component_positions%rowtype;
begin
  if new.system_id is not null then
    select * into v_system from public.asset_systems where organisation_id=new.organisation_id and id=new.system_id;
    if not found or v_system.maintainable_asset_id is distinct from new.maintainable_asset_id then
      raise exception 'ASSET_TECHNICAL_SCOPE_CONTRADICTION' using errcode='23514';
    end if;
  end if;
  if new.component_position_id is not null then
    select * into v_position from public.component_positions where organisation_id=new.organisation_id and id=new.component_position_id;
    if not found or new.system_id is null or v_position.system_id is distinct from new.system_id then
      raise exception 'ASSET_TECHNICAL_SCOPE_CONTRADICTION' using errcode='23514';
    end if;
  end if;
  return new;
end; $$;
create trigger asset_part_requirements_scope before insert or update of organisation_id,maintainable_asset_id,system_id,component_position_id
on public.asset_part_requirements for each row execute function public.ftf_guard_asset_technical_scope();
create trigger asset_fluid_requirements_scope before insert or update of organisation_id,maintainable_asset_id,system_id,component_position_id
on public.asset_fluid_requirements for each row execute function public.ftf_guard_asset_technical_scope();

create function public.ftf_asset_technical_scope_matches(
  p_asset_id uuid,p_system_ids uuid[],p_position_ids uuid[],p_target_asset_id uuid,p_target_system_id uuid,p_target_position_id uuid
) returns boolean language sql immutable set search_path=public,pg_temp as $$
  select p_target_asset_id=p_asset_id
    and (p_target_system_id is null or p_target_system_id=any(p_system_ids))
    and (p_target_position_id is null or p_target_position_id=any(p_position_ids));
$$;

create function public.ftf_asset_text_scope_matches(
  p_system_ids uuid[],p_position_ids uuid[],p_target_system_code text,p_target_position_code text
) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select (p_target_system_code is null and p_target_position_code is null) or exists(
    select 1 from public.asset_systems scoped_system
    where scoped_system.id=any(p_system_ids)
      and upper(btrim(scoped_system.system_code))=upper(btrim(p_target_system_code))
      and (p_target_position_code is null or exists(
        select 1 from public.component_positions scoped_position
        where scoped_position.id=any(p_position_ids) and scoped_position.system_id=scoped_system.id
          and upper(btrim(scoped_position.position_code))=upper(btrim(p_target_position_code))
      ))
  );
$$;

create function public.ftf_guard_effective_asset_technical_requirement() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='technical_part_applicability' and not exists (
    select 1 from public.technical_part_versions version where version.id=(to_jsonb(new)->>'technical_part_version_id')::uuid
      and public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,coalesce(new.effective_from,now()))
  ) then raise exception 'APPLICABILITY_REQUIRES_EFFECTIVE_PART_VERSION' using errcode='23514'; end if;
  if tg_table_name='technical_fluid_applicability' and not exists (
    select 1 from public.technical_fluid_specification_versions version where version.id=(to_jsonb(new)->>'fluid_specification_version_id')::uuid
      and public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,coalesce(new.effective_from,now()))
  ) then raise exception 'APPLICABILITY_REQUIRES_EFFECTIVE_FLUID_VERSION' using errcode='23514'; end if;
  if tg_table_name='asset_part_requirements' and not exists (
    select 1 from public.technical_part_versions version
    where version.id=(to_jsonb(new)->>'technical_part_version_id')::uuid
      and public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,coalesce(new.effective_from,now()))
  ) then raise exception 'APPLICABILITY_REQUIRES_EFFECTIVE_PART_VERSION' using errcode='23514'; end if;
  if tg_table_name='asset_fluid_requirements' and not exists (
    select 1 from public.technical_fluid_specification_versions version
    where version.id=(to_jsonb(new)->>'fluid_specification_version_id')::uuid
      and public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,coalesce(new.effective_from,now()))
  ) then raise exception 'APPLICABILITY_REQUIRES_EFFECTIVE_FLUID_VERSION' using errcode='23514'; end if;
  return new;
end; $$;
create trigger asset_part_requirements_effective_version before insert or update of technical_part_version_id on public.asset_part_requirements
for each row execute function public.ftf_guard_effective_asset_technical_requirement();
create trigger asset_fluid_requirements_effective_version before insert or update of fluid_specification_version_id on public.asset_fluid_requirements
for each row execute function public.ftf_guard_effective_asset_technical_requirement();
create trigger technical_part_applicability_effective_version before insert or update of technical_part_version_id,effective_from on public.technical_part_applicability
for each row execute function public.ftf_guard_effective_asset_technical_requirement();
create trigger technical_fluid_applicability_effective_version before insert or update of fluid_specification_version_id,effective_from on public.technical_fluid_applicability
for each row execute function public.ftf_guard_effective_asset_technical_requirement();

create function public.ftf_guard_canonical_applicability_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and old.lifecycle_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') then
    raise exception 'CANONICAL_TECHNICAL_APPLICABILITY_IMMUTABLE' using errcode='55000';
  end if;
  if tg_op='UPDATE' and old.lifecycle_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') and
    (to_jsonb(new)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') is distinct from
    (to_jsonb(old)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') then
    raise exception 'CANONICAL_TECHNICAL_APPLICABILITY_IMMUTABLE' using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger technical_part_applicability_immutable before update or delete on public.technical_part_applicability
for each row execute function public.ftf_guard_canonical_applicability_mutation();
create trigger technical_fluid_applicability_immutable before update or delete on public.technical_fluid_applicability
for each row execute function public.ftf_guard_canonical_applicability_mutation();

create view public.effective_technical_part_catalogue as
select part.id technical_part_id, version.id technical_part_version_id, version.version_number,
  version.manufacturer, version.manufacturer_part_number, version.technical_description,
  version.part_category, version.authority_type, version.evidence, version.effective_from, version.effective_to
from public.technical_parts part
join public.technical_part_versions version on version.technical_part_id=part.id
where version.lifecycle_state='EFFECTIVE'
  and public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,now());
revoke all on public.effective_technical_part_catalogue from public,anon,authenticated;
grant select on public.effective_technical_part_catalogue to service_role;

create view public.effective_technical_fluid_catalogue as
select specification.id technical_fluid_specification_id, version.id fluid_specification_version_id,
  version.version_number, specification.specification_code, specification.display_name, version.fluid_type,
  version.viscosity_or_grade, version.technical_standards, version.compatibility_constraints,
  version.authority_type, version.evidence, version.effective_from, version.effective_to
from public.technical_fluid_specifications specification
join public.technical_fluid_specification_versions version on version.technical_fluid_specification_id=specification.id
where public.ftf_technical_version_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,now());
revoke all on public.effective_technical_fluid_catalogue from public,anon,authenticated;
grant select on public.effective_technical_fluid_catalogue to service_role;

create view public.effective_technical_part_equivalences as
select equivalence.id, equivalence.left_part_version_id, equivalence.right_part_version_id,
  equivalence.directionality, equivalence.equivalence_scope, equivalence.limitations,
  equivalence.authority_type, equivalence.evidence, equivalence.verified_by_platform_user_id,
  equivalence.verified_at, equivalence.effective_from, equivalence.effective_to
from public.technical_part_equivalences equivalence
join public.technical_part_versions left_version on left_version.id=equivalence.left_part_version_id
join public.technical_part_versions right_version on right_version.id=equivalence.right_part_version_id
where public.ftf_technical_version_effective_at(equivalence.lifecycle_state,equivalence.effective_from,equivalence.effective_to,now())
  and public.ftf_technical_version_effective_at(left_version.lifecycle_state,left_version.effective_from,left_version.effective_to,now())
  and public.ftf_technical_version_effective_at(right_version.lifecycle_state,right_version.effective_from,right_version.effective_to,now());
revoke all on public.effective_technical_part_equivalences from public,anon,authenticated;
grant select on public.effective_technical_part_equivalences to service_role;

-- Optional Service Kits / Service Recipes are versioned aggregates, not schedules.
create table public.service_templates (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null check (owner_scope in ('PLATFORM', 'ORGANISATION')),
  organisation_id uuid references public.organisations(id),
  template_code text not null check (length(btrim(template_code)) between 1 and 160),
  template_name text not null check (length(btrim(template_name)) between 1 and 240),
  source_template_id uuid references public.service_templates(id),
  archived_at timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_by_internal_user_id uuid,
  updated_by_internal_user_id uuid,
  created_by_platform_user_id uuid references public.platform_users(id),
  updated_by_platform_user_id uuid references public.platform_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),
  foreign key (organisation_id,updated_by_internal_user_id) references public.internal_users(organisation_id,id),
  check ((owner_scope='PLATFORM' and organisation_id is null and created_by_platform_user_id is not null and updated_by_platform_user_id is not null and created_by_internal_user_id is null and updated_by_internal_user_id is null)
    or (owner_scope='ORGANISATION' and organisation_id is not null and created_by_internal_user_id is not null and updated_by_internal_user_id is not null and created_by_platform_user_id is null and updated_by_platform_user_id is null)),
  check (source_template_id is null or source_template_id <> id)
);
create unique index service_templates_platform_code_unique on public.service_templates(upper(btrim(template_code)))
  where owner_scope='PLATFORM' and archived_at is null;
create unique index service_templates_organisation_code_unique on public.service_templates(organisation_id,upper(btrim(template_code)))
  where owner_scope='ORGANISATION' and archived_at is null;

create table public.service_template_versions (
  id uuid primary key default gen_random_uuid(),
  service_template_id uuid not null references public.service_templates(id),
  version_number integer not null check (version_number > 0),
  description text not null check (length(btrim(description)) between 1 and 4000),
  authority_type text not null check (authority_type in ('MANUFACTURER', 'ORGANISATION_STANDARD', 'VERIFIED_TECHNICAL_SOURCE')),
  lifecycle_state text not null default 'DRAFT' check (lifecycle_state in ('DRAFT','REVIEWED','APPROVED','EFFECTIVE','SUPERSEDED','RETIRED')),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb),
  condition_schema_version integer not null default 1 check (condition_schema_version > 0),
  effective_from timestamptz,
  effective_to timestamptz,
  approved_by_internal_user_id uuid,
  approved_by_platform_user_id uuid references public.platform_users(id),
  approved_at timestamptz,
  supersedes_version_id uuid references public.service_template_versions(id),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (service_template_id, version_number),
  unique (id,service_template_id),
  check ((num_nonnulls(approved_by_internal_user_id,approved_by_platform_user_id)=0 and approved_at is null)
    or (num_nonnulls(approved_by_internal_user_id,approved_by_platform_user_id)=1 and approved_at is not null)),
  check (lifecycle_state not in ('APPROVED','EFFECTIVE','SUPERSEDED') or num_nonnulls(approved_by_internal_user_id,approved_by_platform_user_id)=1),
  check (effective_to is null or (effective_from is not null and effective_to > effective_from)),
  check (supersedes_version_id is null or supersedes_version_id <> id)
);
create unique index service_template_versions_one_effective on public.service_template_versions(service_template_id)
  where lifecycle_state='EFFECTIVE';

create function public.ftf_guard_service_template_version_authority() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare template public.service_templates%rowtype;
begin
  select * into template from public.service_templates where id=new.service_template_id;
  if not found or (template.owner_scope='PLATFORM' and (new.authority_type='ORGANISATION_STANDARD' or new.approved_by_internal_user_id is not null))
    or (template.owner_scope='ORGANISATION' and (new.authority_type<>'ORGANISATION_STANDARD' or new.approved_by_platform_user_id is not null)) then
    raise exception 'SERVICE_TEMPLATE_VERSION_AUTHORITY_MISMATCH' using errcode='23514';
  end if;
  return new;
end; $$;
create trigger service_template_versions_authority before insert or update of service_template_id,authority_type,approved_by_internal_user_id,approved_by_platform_user_id
on public.service_template_versions for each row execute function public.ftf_guard_service_template_version_authority();

create function public.ftf_guard_service_template_version_mutation() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then raise exception 'SERVICE_TEMPLATE_VERSION_IMMUTABLE' using errcode='55000'; end if;
  if old.lifecycle_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') and
     (to_jsonb(new)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') is distinct from
     (to_jsonb(old)-'lifecycle_state'-'effective_from'-'effective_to'-'row_version'-'updated_at') then
    raise exception 'SERVICE_TEMPLATE_VERSION_IMMUTABLE' using errcode='55000';
  end if;
  return new;
end; $$;
create trigger service_template_versions_immutable before update or delete on public.service_template_versions
for each row execute function public.ftf_guard_service_template_version_mutation();

create table public.service_template_applicability (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  organisation_id uuid references public.organisations(id),
  maintainable_asset_id uuid,
  manufacturer_scope text,
  model_scope text,
  system_id uuid,
  component_position_id uuid,
  system_code text,
  component_position_code text,
  applicability_notes text,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb),
  effective_from timestamptz,
  effective_to timestamptz,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  unique (id,service_template_version_id),
  foreign key (organisation_id,maintainable_asset_id) references public.maintainable_asset_registry(organisation_id,id),
  foreign key (organisation_id,system_id) references public.asset_systems(organisation_id,id),
  foreign key (organisation_id,component_position_id) references public.component_positions(organisation_id,id),
  check (manufacturer_scope is null or length(btrim(manufacturer_scope))>0),
  check (model_scope is null or length(btrim(model_scope))>0),
  check (effective_to is null or (effective_from is not null and effective_to>effective_from))
);

create table public.service_template_actions (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  sequence_number integer not null check (sequence_number > 0),
  action_type text not null check (action_type in ('INSPECT', 'REPLACE', 'SERVICE', 'CALIBRATE', 'OTHER')),
  disposition text not null check (disposition in ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  action_description text not null check (length(btrim(action_description)) between 1 and 2000),
  target_system_code text,
  target_position_code text,
  condition_data jsonb,
  condition_schema_version integer check (condition_schema_version is null or condition_schema_version > 0),
  expected_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(expected_evidence)='object'),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  unique (id,service_template_version_id),
  unique (service_template_version_id,sequence_number),
  constraint service_template_actions_CONDITIONAL_REQUIRES_CONDITION check (
    (disposition='CONDITIONAL' and condition_data is not null and jsonb_typeof(condition_data)='object' and condition_schema_version is not null)
    or (disposition<>'CONDITIONAL' and condition_data is null and condition_schema_version is null)
  )
);

create table public.service_template_part_lines (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  action_id uuid,
  technical_part_version_id uuid not null references public.technical_part_versions(id),
  quantity numeric not null check (quantity > 0),
  unit_code text not null check (unit_code in ('EA','SET','PAIR','PACK')),
  disposition text not null check (disposition in ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  condition_data jsonb,
  condition_schema_version integer,
  line_notes text,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  foreign key (action_id,service_template_version_id) references public.service_template_actions(id,service_template_version_id),
  constraint service_template_part_lines_CONDITIONAL_REQUIRES_CONDITION check (
    (disposition='CONDITIONAL' and condition_data is not null and condition_schema_version is not null)
    or (disposition<>'CONDITIONAL' and condition_data is null and condition_schema_version is null)
  )
);

create table public.service_template_fluid_lines (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  action_id uuid,
  fluid_specification_version_id uuid not null references public.technical_fluid_specification_versions(id),
  quantity numeric not null check (quantity > 0),
  unit_code text not null check (unit_code in ('ML','L','US_QT','IMP_QT','G','KG')),
  disposition text not null check (disposition in ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  condition_data jsonb,
  condition_schema_version integer,
  line_notes text,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  foreign key (action_id,service_template_version_id) references public.service_template_actions(id,service_template_version_id),
  constraint service_template_fluid_lines_CONDITIONAL_REQUIRES_CONDITION check (
    (disposition='CONDITIONAL' and condition_data is not null and condition_schema_version is not null)
    or (disposition<>'CONDITIONAL' and condition_data is null and condition_schema_version is null)
  )
);

create table public.service_template_inspections (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  action_id uuid,
  inspection_description text not null check (length(btrim(inspection_description)) between 1 and 2000),
  target_system_code text,
  target_position_code text,
  disposition text not null check (disposition in ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  condition_data jsonb,
  condition_schema_version integer,
  expected_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(expected_evidence)='object'),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  foreign key (action_id,service_template_version_id) references public.service_template_actions(id,service_template_version_id),
  constraint service_template_inspections_CONDITIONAL_REQUIRES_CONDITION check (
    (disposition='CONDITIONAL' and condition_data is not null and condition_schema_version is not null)
    or (disposition<>'CONDITIONAL' and condition_data is null and condition_schema_version is null)
  )
);

create table public.service_template_replacement_actions (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  action_id uuid,
  replacement_part_version_id uuid references public.technical_part_versions(id),
  replacement_component_type text,
  replacement_expectation text not null check (length(btrim(replacement_expectation)) between 1 and 2000),
  authority_type text not null check (authority_type in ('MANUFACTURER', 'ORGANISATION_STANDARD', 'VERIFIED_TECHNICAL_SOURCE')),
  disposition text not null check (disposition in ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  condition_data jsonb,
  condition_schema_version integer,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and evidence <> '{}'::jsonb),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  foreign key (action_id,service_template_version_id) references public.service_template_actions(id,service_template_version_id),
  check (num_nonnulls(replacement_part_version_id,replacement_component_type)=1),
  constraint service_template_replacements_CONDITIONAL_REQUIRES_CONDITION check (
    (disposition='CONDITIONAL' and condition_data is not null and condition_schema_version is not null)
    or (disposition<>'CONDITIONAL' and condition_data is null and condition_schema_version is null)
  )
);

-- Slice 4 adds the foreign key once maintenance_requirement_versions exists. The UUID is already the
-- exact future version identity; it is not a schedule, cadence, threshold, or due-state inference.
create table public.service_template_requirement_links (
  id uuid primary key default gen_random_uuid(),
  service_template_version_id uuid not null references public.service_template_versions(id),
  maintenance_requirement_version_id uuid not null,
  requirement_schema_version integer not null default 1 check (requirement_schema_version > 0),
  disposition text not null check (disposition in ('REQUIRED', 'OPTIONAL', 'CONDITIONAL')),
  condition_data jsonb,
  condition_schema_version integer,
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  unique (service_template_version_id,maintenance_requirement_version_id),
  constraint service_template_requirements_CONDITIONAL_REQUIRES_CONDITION check (
    (disposition='CONDITIONAL' and condition_data is not null and condition_schema_version is not null)
    or (disposition<>'CONDITIONAL' and condition_data is null and condition_schema_version is null)
  )
);

create function public.ftf_guard_service_template_applicability_scope() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare template public.service_templates%rowtype; v_system public.asset_systems%rowtype; v_position public.component_positions%rowtype;
begin
  select stable.* into template from public.service_templates stable
    join public.service_template_versions version on version.service_template_id=stable.id
    where version.id=new.service_template_version_id;
  if not found then raise exception 'SERVICE_TEMPLATE_APPLICABILITY_SCOPE_CONTRADICTION' using errcode='23514'; end if;
  if template.owner_scope='PLATFORM' then
    if new.organisation_id is not null or new.maintainable_asset_id is not null or new.system_id is not null or new.component_position_id is not null
      or new.manufacturer_scope is null or length(btrim(new.manufacturer_scope))=0
      or new.model_scope is null or length(btrim(new.model_scope))=0
      or (new.component_position_code is not null and new.system_code is null) then
      raise exception 'SERVICE_TEMPLATE_APPLICABILITY_SCOPE_CONTRADICTION' using errcode='23514';
    end if;
  else
    if new.organisation_id is distinct from template.organisation_id or new.maintainable_asset_id is null
      or new.manufacturer_scope is not null or new.model_scope is not null
      or new.system_code is not null or new.component_position_code is not null or (new.component_position_id is not null and new.system_id is null) then
      raise exception 'SERVICE_TEMPLATE_APPLICABILITY_SCOPE_CONTRADICTION' using errcode='23514';
    end if;
    if new.system_id is not null then
      select * into v_system from public.asset_systems where organisation_id=new.organisation_id and id=new.system_id;
      if not found or v_system.maintainable_asset_id is distinct from new.maintainable_asset_id then
        raise exception 'SERVICE_TEMPLATE_APPLICABILITY_SCOPE_CONTRADICTION' using errcode='23514';
      end if;
    end if;
    if new.component_position_id is not null then
      select * into v_position from public.component_positions where organisation_id=new.organisation_id and id=new.component_position_id;
      if not found or v_position.system_id is distinct from new.system_id then
        raise exception 'SERVICE_TEMPLATE_APPLICABILITY_SCOPE_CONTRADICTION' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end; $$;
create trigger service_template_applicability_scope before insert or update on public.service_template_applicability
for each row execute function public.ftf_guard_service_template_applicability_scope();

create function public.ftf_guard_service_template_aggregate_mutation() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare version_id uuid; version_state text;
begin
  version_id:=coalesce(new.service_template_version_id,old.service_template_version_id);
  select lifecycle_state into version_state from public.service_template_versions where id=version_id for update;
  if version_state in ('APPROVED','EFFECTIVE','SUPERSEDED','RETIRED') then
    raise exception 'SERVICE_TEMPLATE_AGGREGATE_IMMUTABLE' using errcode='55000';
  end if;
  return case when tg_op='DELETE' then old else new end;
end; $$;
create trigger service_template_applicability_immutable before insert or update or delete on public.service_template_applicability
for each row execute function public.ftf_guard_service_template_aggregate_mutation();
create trigger service_template_actions_immutable before insert or update or delete on public.service_template_actions
for each row execute function public.ftf_guard_service_template_aggregate_mutation();
create trigger service_template_part_lines_immutable before insert or update or delete on public.service_template_part_lines
for each row execute function public.ftf_guard_service_template_aggregate_mutation();
create trigger service_template_fluid_lines_immutable before insert or update or delete on public.service_template_fluid_lines
for each row execute function public.ftf_guard_service_template_aggregate_mutation();
create trigger service_template_inspections_immutable before insert or update or delete on public.service_template_inspections
for each row execute function public.ftf_guard_service_template_aggregate_mutation();
create trigger service_template_replacements_immutable before insert or update or delete on public.service_template_replacement_actions
for each row execute function public.ftf_guard_service_template_aggregate_mutation();
create trigger service_template_requirements_immutable before insert or update or delete on public.service_template_requirement_links
for each row execute function public.ftf_guard_service_template_aggregate_mutation();

-- Organisation-owned records have forced RLS and no direct client or service-role table privileges.
alter table public.technical_data_proposals enable row level security;
alter table public.technical_data_proposals force row level security;
revoke all on table public.technical_data_proposals from public, anon, authenticated, service_role;
alter table public.organisation_part_preferences enable row level security;
alter table public.organisation_part_preferences force row level security;
revoke all on table public.organisation_part_preferences from public, anon, authenticated, service_role;
alter table public.organisation_fluid_preferences enable row level security;
alter table public.organisation_fluid_preferences force row level security;
revoke all on table public.organisation_fluid_preferences from public, anon, authenticated, service_role;
alter table public.asset_part_requirements enable row level security;
alter table public.asset_part_requirements force row level security;
revoke all on table public.asset_part_requirements from public, anon, authenticated, service_role;
alter table public.asset_fluid_requirements enable row level security;
alter table public.asset_fluid_requirements force row level security;
revoke all on table public.asset_fluid_requirements from public, anon, authenticated, service_role;
alter table public.service_templates enable row level security;
alter table public.service_templates force row level security;
revoke all on table public.service_templates from public, anon, authenticated, service_role;
alter table public.service_template_versions enable row level security;
alter table public.service_template_versions force row level security;
revoke all on table public.service_template_versions from public, anon, authenticated, service_role;
alter table public.service_template_applicability enable row level security;
alter table public.service_template_applicability force row level security;
revoke all on table public.service_template_applicability from public, anon, authenticated, service_role;
alter table public.service_template_actions enable row level security;
alter table public.service_template_actions force row level security;
revoke all on table public.service_template_actions from public, anon, authenticated, service_role;
alter table public.service_template_part_lines enable row level security;
alter table public.service_template_part_lines force row level security;
revoke all on table public.service_template_part_lines from public, anon, authenticated, service_role;
alter table public.service_template_fluid_lines enable row level security;
alter table public.service_template_fluid_lines force row level security;
revoke all on table public.service_template_fluid_lines from public, anon, authenticated, service_role;
alter table public.service_template_inspections enable row level security;
alter table public.service_template_inspections force row level security;
revoke all on table public.service_template_inspections from public, anon, authenticated, service_role;
alter table public.service_template_replacement_actions enable row level security;
alter table public.service_template_replacement_actions force row level security;
revoke all on table public.service_template_replacement_actions from public, anon, authenticated, service_role;
alter table public.service_template_requirement_links enable row level security;
alter table public.service_template_requirement_links force row level security;
revoke all on table public.service_template_requirement_links from public, anon, authenticated, service_role;

-- Canonical base/version tables are likewise write-inaccessible; effective views are the read contract.
revoke all on table public.technical_parts from public, anon, authenticated, service_role;
revoke all on table public.technical_part_versions from public, anon, authenticated, service_role;
revoke all on table public.technical_part_equivalences from public, anon, authenticated, service_role;
revoke all on table public.technical_fluid_specifications from public, anon, authenticated, service_role;
revoke all on table public.technical_fluid_specification_versions from public, anon, authenticated, service_role;
revoke all on table public.technical_part_applicability from public, anon, authenticated, service_role;
revoke all on table public.technical_fluid_applicability from public, anon, authenticated, service_role;

insert into public.platform_permissions(code,description,enabled) values
  ('platform.technical_catalogue.publish','Publish global canonical parts, fluids, equivalences and manufacturer templates.',true)
on conflict(code) do update set description=excluded.description,enabled=true;
insert into public.platform_role_permissions(role_id,permission_id)
select role.id,permission.id from public.platform_roles role join public.platform_permissions permission
  on permission.code='platform.technical_catalogue.publish' and permission.enabled
where role.code='PLATFORM_SUPER_ADMIN' and role.is_active on conflict do nothing;

create function public.ftf_platform_actor_has_permission(p_platform_user_id uuid,p_permission_code text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.platform_users actor
    join public.platform_user_roles assignment on assignment.platform_user_id=actor.id
    join public.platform_roles role on role.id=assignment.role_id and role.is_active
    join public.platform_role_permissions role_permission on role_permission.role_id=role.id
    join public.platform_permissions permission on permission.id=role_permission.permission_id and permission.enabled
    where actor.id=p_platform_user_id and actor.is_active and actor.archived_at is null and permission.code=p_permission_code);
$$;

create function public.ftf_provision_technical_catalogue_permissions() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.code <> 'admin' then return new; end if;
  insert into public.permissions(organisation_id,code,description) select new.organisation_id,* from (values
    ('technical_catalogue.read','View effective technical catalogue'),
    ('technical_preferences.read','View organisation technical preferences'),
    ('technical_preferences.manage','Manage organisation technical preferences'),
    ('service_templates.read','View applicable service templates'),
    ('service_templates.manage','Manage organisation service templates'),
    ('service_templates.publish','Publish organisation service templates')) permission(code,description)
  on conflict(organisation_id,code) do nothing;
  insert into public.role_permissions(organisation_id,role_id,permission_id)
  select new.organisation_id,new.id,permission.id from public.permissions permission
  where permission.organisation_id=new.organisation_id and permission.code in (
    'technical_catalogue.read',
    'technical_preferences.read','technical_preferences.manage','service_templates.read',
    'service_templates.manage','service_templates.publish') on conflict do nothing;
  return new;
end; $$;
create trigger roles_provision_technical_catalogue_permissions after insert on public.roles
for each row execute function public.ftf_provision_technical_catalogue_permissions();

insert into public.permissions(organisation_id,code,description)
select organisation.id, permission.code, permission.description from public.organisations organisation cross join (values
  ('technical_catalogue.read','View effective technical catalogue'),
  ('technical_preferences.read','View organisation technical preferences'),
  ('technical_preferences.manage','Manage organisation technical preferences'),
  ('service_templates.read','View applicable service templates'),
  ('service_templates.manage','Manage organisation service templates'),
  ('service_templates.publish','Publish organisation service templates')) permission(code,description)
where organisation.archived_at is null on conflict(organisation_id,code) do nothing;
insert into public.role_permissions(organisation_id,role_id,permission_id)
select role.organisation_id,role.id,permission.id from public.roles role
join public.permissions permission on permission.organisation_id=role.organisation_id
where role.code='admin' and role.archived_at is null and permission.code in (
  'technical_catalogue.read',
  'technical_preferences.read','technical_preferences.manage','service_templates.read',
  'service_templates.manage','service_templates.publish') on conflict do nothing;

create function public.ftf_publish_technical_version(
  p_platform_user_id uuid, p_entity_type text,
  p_entity_id uuid, p_expected_version integer, p_effective_from timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare version_record record; superseded_record record; result_record jsonb;
begin
  if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.technical_catalogue.publish') then return jsonb_build_object('forbidden',true); end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED' using errcode='22023'; end if;
  if p_entity_type='PART' then
    select * into version_record from public.technical_part_versions where id=p_entity_id for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    if version_record.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',version_record.row_version); end if;
    if version_record.lifecycle_state not in ('REVIEWED','APPROVED') or version_record.evidence='{}'::jsonb then raise exception 'TECHNICAL_VERSION_NOT_APPROVABLE' using errcode='22023'; end if;
    if version_record.supersedes_version_id is not null then
      select * into superseded_record from public.technical_part_versions where id=version_record.supersedes_version_id and technical_part_id=version_record.technical_part_id for update;
      if not found or not public.ftf_technical_version_effective_at(superseded_record.lifecycle_state,superseded_record.effective_from,superseded_record.effective_to,p_effective_from) then raise exception 'TECHNICAL_VERSION_SUPERSEDED_VERSION_INVALID' using errcode='23514'; end if;
      update public.technical_part_versions set lifecycle_state='SUPERSEDED',effective_to=p_effective_from,row_version=row_version+1,updated_at=now() where id=superseded_record.id;
    elsif exists(select 1 from public.technical_part_versions existing where existing.technical_part_id=version_record.technical_part_id and existing.lifecycle_state='EFFECTIVE') then
      raise exception 'TECHNICAL_VERSION_SUPERSEDED_VERSION_INVALID' using errcode='23514';
    end if;
    update public.technical_part_versions set lifecycle_state='EFFECTIVE',approved_by_platform_user_id=coalesce(approved_by_platform_user_id,p_platform_user_id),
      approved_at=coalesce(approved_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
    where id=p_entity_id returning to_jsonb(technical_part_versions.*) into result_record;
  elsif p_entity_type='FLUID' then
    select * into version_record from public.technical_fluid_specification_versions where id=p_entity_id for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    if version_record.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',version_record.row_version); end if;
    if version_record.lifecycle_state not in ('REVIEWED','APPROVED') or version_record.evidence='{}'::jsonb then raise exception 'TECHNICAL_VERSION_NOT_APPROVABLE' using errcode='22023'; end if;
    if version_record.supersedes_version_id is not null then
      select * into superseded_record from public.technical_fluid_specification_versions where id=version_record.supersedes_version_id and technical_fluid_specification_id=version_record.technical_fluid_specification_id for update;
      if not found or not public.ftf_technical_version_effective_at(superseded_record.lifecycle_state,superseded_record.effective_from,superseded_record.effective_to,p_effective_from) then raise exception 'TECHNICAL_VERSION_SUPERSEDED_VERSION_INVALID' using errcode='23514'; end if;
      update public.technical_fluid_specification_versions set lifecycle_state='SUPERSEDED',effective_to=p_effective_from,row_version=row_version+1,updated_at=now() where id=superseded_record.id;
    elsif exists(select 1 from public.technical_fluid_specification_versions existing where existing.technical_fluid_specification_id=version_record.technical_fluid_specification_id and existing.lifecycle_state='EFFECTIVE') then
      raise exception 'TECHNICAL_VERSION_SUPERSEDED_VERSION_INVALID' using errcode='23514';
    end if;
    update public.technical_fluid_specification_versions set lifecycle_state='EFFECTIVE',approved_by_platform_user_id=coalesce(approved_by_platform_user_id,p_platform_user_id),
      approved_at=coalesce(approved_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
    where id=p_entity_id returning to_jsonb(technical_fluid_specification_versions.*) into result_record;
  else raise exception 'unsupported technical version type' using errcode='22023'; end if;
  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload)
  select actor.auth_user_id,'platform.technical_catalogue.version_published',lower(p_entity_type),p_entity_id,jsonb_build_object('version',result_record->>'version_number')
    from public.platform_users actor where actor.id=p_platform_user_id;
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('platform.technical_catalogue.version_published',lower(p_entity_type),p_entity_id,jsonb_build_object('entityType',p_entity_type));
  return jsonb_build_object('record',result_record);
end; $$;

create function public.ftf_publish_part_equivalence(
  p_platform_user_id uuid, p_equivalence_id uuid,
  p_expected_version integer, p_effective_from timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare equivalence public.technical_part_equivalences%rowtype; left_version public.technical_part_versions%rowtype; right_version public.technical_part_versions%rowtype;
begin
  if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.technical_catalogue.publish') then return jsonb_build_object('forbidden',true); end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED' using errcode='22023'; end if;
  select * into equivalence from public.technical_part_equivalences where id=p_equivalence_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  if equivalence.row_version <> p_expected_version then return jsonb_build_object('conflict',true,'current_version',equivalence.row_version); end if;
  if equivalence.lifecycle_state not in ('REVIEWED','APPROVED') then raise exception 'EQUIVALENCE_NOT_APPROVABLE' using errcode='22023'; end if;
  if equivalence.evidence='{}'::jsonb then raise exception 'EQUIVALENCE_EVIDENCE_REQUIRED' using errcode='22023'; end if;
  select * into left_version from public.technical_part_versions where id=equivalence.left_part_version_id;
  select * into right_version from public.technical_part_versions where id=equivalence.right_part_version_id;
  if not public.ftf_technical_version_effective_at(left_version.lifecycle_state,left_version.effective_from,left_version.effective_to,p_effective_from)
    or not public.ftf_technical_version_effective_at(right_version.lifecycle_state,right_version.effective_from,right_version.effective_to,p_effective_from) then
    raise exception 'EQUIVALENCE_REQUIRES_EXACT_EFFECTIVE_VERSIONS' using errcode='23514';
  end if;
  update public.technical_part_equivalences set lifecycle_state='EFFECTIVE',verified_by_platform_user_id=coalesce(verified_by_platform_user_id,p_platform_user_id),
    verified_at=coalesce(verified_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
  where id=p_equivalence_id returning * into equivalence;
  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload)
  select actor.auth_user_id,'platform.technical_catalogue.equivalence_published','technical_part_equivalence',equivalence.id,jsonb_build_object('directionality',equivalence.directionality)
    from public.platform_users actor where actor.id=p_platform_user_id;
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('platform.technical_catalogue.equivalence_published','technical_part_equivalence',equivalence.id,jsonb_build_object('directionality',equivalence.directionality));
  return jsonb_build_object('record',to_jsonb(equivalence));
end; $$;

create function public.ftf_publish_technical_applicability(
  p_platform_user_id uuid, p_applicability_type text, p_applicability_id uuid,
  p_expected_version integer, p_effective_from timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare applicability_record record; version_record record; result_record jsonb;
begin
  if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.technical_catalogue.publish') then return jsonb_build_object('forbidden',true); end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED' using errcode='22023'; end if;
  if p_applicability_type='PART' then
    select * into applicability_record from public.technical_part_applicability where id=p_applicability_id for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    if applicability_record.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',applicability_record.row_version); end if;
    if applicability_record.lifecycle_state not in ('REVIEWED','APPROVED') then raise exception 'TECHNICAL_APPLICABILITY_NOT_APPROVABLE' using errcode='22023'; end if;
    select * into version_record from public.technical_part_versions where id=applicability_record.technical_part_version_id;
    if not found or not public.ftf_technical_version_effective_at(version_record.lifecycle_state,version_record.effective_from,version_record.effective_to,p_effective_from) then raise exception 'APPLICABILITY_REQUIRES_EFFECTIVE_PART_VERSION' using errcode='23514'; end if;
    update public.technical_part_applicability set lifecycle_state='EFFECTIVE',approved_by_platform_user_id=coalesce(approved_by_platform_user_id,p_platform_user_id),
      approved_at=coalesce(approved_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
    where id=p_applicability_id returning to_jsonb(technical_part_applicability.*) into result_record;
  elsif p_applicability_type='FLUID' then
    select * into applicability_record from public.technical_fluid_applicability where id=p_applicability_id for update;
    if not found then return jsonb_build_object('not_found',true); end if;
    if applicability_record.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',applicability_record.row_version); end if;
    if applicability_record.lifecycle_state not in ('REVIEWED','APPROVED') then raise exception 'TECHNICAL_APPLICABILITY_NOT_APPROVABLE' using errcode='22023'; end if;
    select * into version_record from public.technical_fluid_specification_versions where id=applicability_record.fluid_specification_version_id;
    if not found or not public.ftf_technical_version_effective_at(version_record.lifecycle_state,version_record.effective_from,version_record.effective_to,p_effective_from) then raise exception 'APPLICABILITY_REQUIRES_EFFECTIVE_FLUID_VERSION' using errcode='23514'; end if;
    update public.technical_fluid_applicability set lifecycle_state='EFFECTIVE',approved_by_platform_user_id=coalesce(approved_by_platform_user_id,p_platform_user_id),
      approved_at=coalesce(approved_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
    where id=p_applicability_id returning to_jsonb(technical_fluid_applicability.*) into result_record;
  else raise exception 'unsupported technical applicability type' using errcode='22023'; end if;
  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload)
  select actor.auth_user_id,'platform.technical_catalogue.applicability_published',lower(p_applicability_type)||'_applicability',p_applicability_id,jsonb_build_object('effectiveFrom',p_effective_from)
    from public.platform_users actor where actor.id=p_platform_user_id;
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('platform.technical_catalogue.applicability_published',lower(p_applicability_type)||'_applicability',p_applicability_id,jsonb_build_object('applicabilityType',p_applicability_type));
  return jsonb_build_object('record',result_record);
end; $$;

create function public.ftf_read_organisation_technical_preferences(
  p_organisation_id uuid, p_actor_internal_user_id uuid
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or
     not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'technical_preferences.read') then
    return jsonb_build_object('forbidden',true);
  end if;
  return jsonb_build_object(
    'parts',(select coalesce(jsonb_agg(to_jsonb(preference)),'[]'::jsonb) from public.organisation_part_preferences preference where preference.organisation_id=p_organisation_id and preference.active),
    'fluids',(select coalesce(jsonb_agg(to_jsonb(preference)),'[]'::jsonb) from public.organisation_fluid_preferences preference where preference.organisation_id=p_organisation_id and preference.active)
  );
end; $$;

create function public.ftf_write_organisation_technical_preference(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_preference_type text,
  p_preference_id uuid default null, p_expected_version integer default null, p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare preference record; result_record jsonb;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) then raise exception 'active organisation actor seat required' using errcode='42501'; end if;
  if not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'technical_preferences.manage') then return jsonb_build_object('forbidden',true); end if;
  if p_preference_type='PART' then
    if p_preference_id is not null then
      select * into preference from public.organisation_part_preferences where organisation_id=p_organisation_id and id=p_preference_id for update;
      if not found then return jsonb_build_object('not_found',true); end if;
      if preference.row_version <> p_expected_version then return jsonb_build_object('conflict',true,'current_version',preference.row_version); end if;
      update public.organisation_part_preferences set preferred_supplier=p_data->>'preferred_supplier',supplier_sku=p_data->>'supplier_sku',
        internal_sku=p_data->>'internal_sku',organisation_notes=p_data->>'organisation_notes',updated_by_internal_user_id=p_actor_internal_user_id,
        row_version=row_version+1,updated_at=now() where organisation_id=p_organisation_id and id=p_preference_id
      returning to_jsonb(organisation_part_preferences.*) into result_record;
    else
      insert into public.organisation_part_preferences(organisation_id,technical_part_id,preferred_part_version_id,preferred_supplier,supplier_sku,internal_sku,organisation_notes,created_by_internal_user_id,updated_by_internal_user_id)
      values(p_organisation_id,(p_data->>'technical_part_id')::uuid,(p_data->>'preferred_part_version_id')::uuid,p_data->>'preferred_supplier',p_data->>'supplier_sku',p_data->>'internal_sku',p_data->>'organisation_notes',p_actor_internal_user_id,p_actor_internal_user_id)
      returning to_jsonb(organisation_part_preferences.*) into result_record;
    end if;
  elsif p_preference_type='FLUID' then
    if p_preference_id is not null then
      select * into preference from public.organisation_fluid_preferences where organisation_id=p_organisation_id and id=p_preference_id for update;
      if not found then return jsonb_build_object('not_found',true); end if;
      if preference.row_version <> p_expected_version then return jsonb_build_object('conflict',true,'current_version',preference.row_version); end if;
      update public.organisation_fluid_preferences set preferred_product=btrim(p_data->>'preferred_product'),preferred_brand=p_data->>'preferred_brand',
        preferred_supplier=p_data->>'preferred_supplier',supplier_sku=p_data->>'supplier_sku',organisation_notes=p_data->>'organisation_notes',
        updated_by_internal_user_id=p_actor_internal_user_id,row_version=row_version+1,updated_at=now()
      where organisation_id=p_organisation_id and id=p_preference_id returning to_jsonb(organisation_fluid_preferences.*) into result_record;
    else
      insert into public.organisation_fluid_preferences(organisation_id,technical_fluid_specification_id,satisfied_fluid_specification_version_id,preferred_product,preferred_brand,preferred_supplier,supplier_sku,organisation_notes,created_by_internal_user_id,updated_by_internal_user_id)
      values(p_organisation_id,(p_data->>'technical_fluid_specification_id')::uuid,(p_data->>'satisfied_fluid_specification_version_id')::uuid,btrim(p_data->>'preferred_product'),p_data->>'preferred_brand',p_data->>'preferred_supplier',p_data->>'supplier_sku',p_data->>'organisation_notes',p_actor_internal_user_id,p_actor_internal_user_id)
      returning to_jsonb(organisation_fluid_preferences.*) into result_record;
    end if;
  else raise exception 'unsupported technical preference type' using errcode='22023'; end if;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_organisation_id,p_actor_internal_user_id,'technical_preferences.saved',lower(p_preference_type)||'_preference',(result_record->>'id')::uuid,jsonb_build_object('rowVersion',result_record->>'row_version'));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(p_organisation_id,'operational.technical_preferences.saved',lower(p_preference_type)||'_preference',(result_record->>'id')::uuid,jsonb_build_object('preferenceType',p_preference_type));
  return jsonb_build_object('record',result_record);
end; $$;

create function public.ftf_publish_service_template_version(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_service_template_version_id uuid,
  p_expected_version integer, p_effective_from timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare template_version public.service_template_versions%rowtype; template public.service_templates%rowtype; superseded public.service_template_versions%rowtype;
begin
  perform public.ftf_lock_active_organisation(p_organisation_id);
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) then raise exception 'active organisation actor seat required' using errcode='42501'; end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED' using errcode='22023'; end if;
  select * into template_version from public.service_template_versions where id=p_service_template_version_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  select * into template from public.service_templates where id=template_version.service_template_id for update;
  if template_version.row_version <> p_expected_version then return jsonb_build_object('conflict',true,'current_version',template_version.row_version); end if;
  if template.owner_scope<>'ORGANISATION' or template.organisation_id<>p_organisation_id
    or template_version.authority_type<>'ORGANISATION_STANDARD'
    or not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'service_templates.publish') then
    return jsonb_build_object('forbidden',true);
  end if;
  if template_version.lifecycle_state not in ('REVIEWED','APPROVED') or template_version.evidence='{}'::jsonb then raise exception 'SERVICE_TEMPLATE_NOT_APPROVABLE' using errcode='22023'; end if;
  if exists(select 1 from public.service_template_part_lines line join public.technical_part_versions part_version on part_version.id=line.technical_part_version_id where line.service_template_version_id=template_version.id and not public.ftf_technical_version_effective_at(part_version.lifecycle_state,part_version.effective_from,part_version.effective_to,p_effective_from))
    or exists(select 1 from public.service_template_replacement_actions replacement join public.technical_part_versions part_version on part_version.id=replacement.replacement_part_version_id where replacement.service_template_version_id=template_version.id and replacement.replacement_part_version_id is not null and not public.ftf_technical_version_effective_at(part_version.lifecycle_state,part_version.effective_from,part_version.effective_to,p_effective_from)) then
    raise exception 'SERVICE_TEMPLATE_PART_VERSION_NOT_EFFECTIVE' using errcode='23514';
  end if;
  if exists(select 1 from public.service_template_fluid_lines line join public.technical_fluid_specification_versions fluid_version on fluid_version.id=line.fluid_specification_version_id where line.service_template_version_id=template_version.id and not public.ftf_technical_version_effective_at(fluid_version.lifecycle_state,fluid_version.effective_from,fluid_version.effective_to,p_effective_from)) then
    raise exception 'SERVICE_TEMPLATE_FLUID_VERSION_NOT_EFFECTIVE' using errcode='23514';
  end if;
  if template_version.supersedes_version_id is not null then
    select * into superseded from public.service_template_versions where id=template_version.supersedes_version_id and service_template_id=template.id for update;
    if not found or not public.ftf_technical_version_effective_at(superseded.lifecycle_state,superseded.effective_from,superseded.effective_to,p_effective_from) then raise exception 'SERVICE_TEMPLATE_SUPERSEDED_VERSION_INVALID' using errcode='23514'; end if;
    update public.service_template_versions set lifecycle_state='SUPERSEDED',effective_to=p_effective_from,row_version=row_version+1,updated_at=now() where id=superseded.id;
  elsif exists(select 1 from public.service_template_versions existing where existing.service_template_id=template.id and existing.lifecycle_state='EFFECTIVE') then
    raise exception 'SERVICE_TEMPLATE_SUPERSEDED_VERSION_INVALID' using errcode='23514';
  end if;
  update public.service_template_versions set lifecycle_state='EFFECTIVE',approved_by_internal_user_id=coalesce(approved_by_internal_user_id,p_actor_internal_user_id),
    approved_at=coalesce(approved_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
  where id=p_service_template_version_id returning * into template_version;
  insert into public.audit_events(organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload)
  values(p_organisation_id,p_actor_internal_user_id,'service_template.version_published','service_template',template.id,jsonb_build_object('versionId',template_version.id,'ownerScope',template.owner_scope));
  insert into public.transactional_outbox(organisation_id,topic,aggregate_type,aggregate_id,payload)
  values(p_organisation_id,'operational.service_template.version_published','service_template',template.id,jsonb_build_object('versionId',template_version.id,'ownerScope',template.owner_scope));
  return jsonb_build_object('record',to_jsonb(template_version));
end; $$;

create function public.ftf_publish_platform_service_template_version(
  p_platform_user_id uuid, p_service_template_version_id uuid,
  p_expected_version integer, p_effective_from timestamptz default now()
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare template_version public.service_template_versions%rowtype; template public.service_templates%rowtype; superseded public.service_template_versions%rowtype;
begin
  if not public.ftf_platform_actor_has_permission(p_platform_user_id,'platform.technical_catalogue.publish') then
    return jsonb_build_object('forbidden',true);
  end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED' using errcode='22023'; end if;
  select * into template_version from public.service_template_versions where id=p_service_template_version_id for update;
  if not found then return jsonb_build_object('not_found',true); end if;
  select * into template from public.service_templates where id=template_version.service_template_id for update;
  if template_version.row_version<>p_expected_version then return jsonb_build_object('conflict',true,'current_version',template_version.row_version); end if;
  if template.owner_scope<>'PLATFORM' or template_version.authority_type not in ('MANUFACTURER','VERIFIED_TECHNICAL_SOURCE') then
    raise exception 'PLATFORM_SERVICE_TEMPLATE_PUBLISH_FORBIDDEN' using errcode='42501';
  end if;
  if template_version.lifecycle_state not in ('REVIEWED','APPROVED') or template_version.evidence='{}'::jsonb then raise exception 'SERVICE_TEMPLATE_NOT_APPROVABLE' using errcode='22023'; end if;
  if exists(select 1 from public.service_template_part_lines line join public.technical_part_versions part_version on part_version.id=line.technical_part_version_id where line.service_template_version_id=template_version.id and not public.ftf_technical_version_effective_at(part_version.lifecycle_state,part_version.effective_from,part_version.effective_to,p_effective_from))
    or exists(select 1 from public.service_template_replacement_actions replacement join public.technical_part_versions part_version on part_version.id=replacement.replacement_part_version_id where replacement.service_template_version_id=template_version.id and replacement.replacement_part_version_id is not null and not public.ftf_technical_version_effective_at(part_version.lifecycle_state,part_version.effective_from,part_version.effective_to,p_effective_from)) then
    raise exception 'SERVICE_TEMPLATE_PART_VERSION_NOT_EFFECTIVE' using errcode='23514';
  end if;
  if exists(select 1 from public.service_template_fluid_lines line join public.technical_fluid_specification_versions fluid_version on fluid_version.id=line.fluid_specification_version_id where line.service_template_version_id=template_version.id and not public.ftf_technical_version_effective_at(fluid_version.lifecycle_state,fluid_version.effective_from,fluid_version.effective_to,p_effective_from)) then
    raise exception 'SERVICE_TEMPLATE_FLUID_VERSION_NOT_EFFECTIVE' using errcode='23514';
  end if;
  if template_version.supersedes_version_id is not null then
    select * into superseded from public.service_template_versions where id=template_version.supersedes_version_id and service_template_id=template.id for update;
    if not found or not public.ftf_technical_version_effective_at(superseded.lifecycle_state,superseded.effective_from,superseded.effective_to,p_effective_from) then raise exception 'SERVICE_TEMPLATE_SUPERSEDED_VERSION_INVALID' using errcode='23514'; end if;
    update public.service_template_versions set lifecycle_state='SUPERSEDED',effective_to=p_effective_from,row_version=row_version+1,updated_at=now() where id=superseded.id;
  elsif exists(select 1 from public.service_template_versions existing where existing.service_template_id=template.id and existing.lifecycle_state='EFFECTIVE') then
    raise exception 'SERVICE_TEMPLATE_SUPERSEDED_VERSION_INVALID' using errcode='23514';
  end if;
  update public.service_template_versions set lifecycle_state='EFFECTIVE',approved_by_platform_user_id=coalesce(approved_by_platform_user_id,p_platform_user_id),
    approved_at=coalesce(approved_at,now()),effective_from=p_effective_from,row_version=row_version+1,updated_at=now()
  where id=p_service_template_version_id returning * into template_version;
  insert into public.platform_audit_events(actor_auth_user_id,event_type,entity_type,entity_id,event_payload)
  select actor.auth_user_id,'platform.service_template.version_published','service_template',template.id,jsonb_build_object('versionId',template_version.id)
    from public.platform_users actor where actor.id=p_platform_user_id;
  insert into public.platform_transactional_outbox(topic,aggregate_type,aggregate_id,payload)
  values('platform.service_template.version_published','service_template',template.id,jsonb_build_object('versionId',template_version.id));
  return jsonb_build_object('record',to_jsonb(template_version));
end; $$;

create function public.ftf_read_asset_technical_catalogue(
  p_organisation_id uuid, p_actor_internal_user_id uuid, p_maintainable_asset_id uuid, p_as_of timestamptz
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare system_ids uuid[]; position_ids uuid[]; v_manufacturer_scope text; v_model_scope text; attached_ids uuid[];
begin
  if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id) or
     not public.ftf_actor_has_permission(p_organisation_id,p_actor_internal_user_id,'technical_catalogue.read') or
     not public.ftf_maintenance_asset_location_allowed(p_organisation_id,p_actor_internal_user_id,p_maintainable_asset_id) then
    return jsonb_build_object('not_found',true);
  end if;
  select coalesce(array_agg(system.id),array[]::uuid[]) into system_ids from public.asset_systems system
    where system.organisation_id=p_organisation_id and system.maintainable_asset_id=p_maintainable_asset_id and system.archived_at is null;
  select coalesce(array_agg(position.id),array[]::uuid[]) into position_ids from public.component_positions position
    where position.organisation_id=p_organisation_id and position.system_id=any(system_ids) and position.archived_at is null;
  select coalesce(fleet.manufacturer,equipment.specifications->>'manufacturer',aircraft.manufacturer),
    coalesce(fleet.model,equipment.specifications->>'model',aircraft.model) into v_manufacturer_scope,v_model_scope
  from public.maintainable_asset_registry registry
  left join public.fleet_assets fleet on fleet.organisation_id=registry.organisation_id and fleet.id=registry.fleet_asset_id
  left join public.equipment_kits equipment on equipment.organisation_id=registry.organisation_id and equipment.id=registry.equipment_kit_id
  left join public.aircraft aircraft on aircraft.organisation_id=registry.organisation_id and aircraft.id=registry.aircraft_id
  where registry.organisation_id=p_organisation_id and registry.id=p_maintainable_asset_id;
  select coalesce(array_agg(period.child_asset_id),array[]::uuid[]) into attached_ids from public.asset_attachment_periods period
    where period.organisation_id=p_organisation_id and period.parent_asset_id=p_maintainable_asset_id
      and period.attached_at<=p_as_of and (period.detached_at is null or period.detached_at>p_as_of);
  return jsonb_build_object(
    'systems',(select coalesce(jsonb_agg(jsonb_build_object('id',system.id,'code',system.system_code,'name',system.name)),'[]'::jsonb) from public.asset_systems system where system.id=any(system_ids)),
    'positions',(select coalesce(jsonb_agg(jsonb_build_object('id',position.id,'code',position.position_code,'name',position.name)),'[]'::jsonb) from public.component_positions position where position.id=any(position_ids)),
    'parts',(select coalesce(jsonb_agg(part_result.data),'[]'::jsonb) from (
      select jsonb_build_object('requirementId',requirement.id,'applicationCode',requirement.application_code,'quantity',requirement.quantity,'unitCode',requirement.unit_code,'partVersion',to_jsonb(version),'part',to_jsonb(part)) data
      from public.asset_part_requirements requirement join public.technical_part_versions version on version.id=requirement.technical_part_version_id
      join public.technical_parts part on part.id=version.technical_part_id
      where requirement.organisation_id=p_organisation_id and requirement.lifecycle_state in ('EFFECTIVE','SUPERSEDED')
        and public.ftf_version_historically_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,p_as_of)
        and (requirement.effective_from is null or requirement.effective_from<=p_as_of)
        and (requirement.effective_to is null or requirement.effective_to>p_as_of)
        and public.ftf_asset_technical_scope_matches(p_maintainable_asset_id,system_ids,position_ids,requirement.maintainable_asset_id,requirement.system_id,requirement.component_position_id)
      union all
      select jsonb_build_object('applicabilityId',applicability.id,'applicationCode',applicability.application_code,'quantity',applicability.quantity,'unitCode',applicability.unit_code,'partVersion',to_jsonb(version),'part',to_jsonb(part)) data
      from public.technical_part_applicability applicability join public.technical_part_versions version on version.id=applicability.technical_part_version_id
      join public.technical_parts part on part.id=version.technical_part_id
      where applicability.lifecycle_state in ('EFFECTIVE','SUPERSEDED')
        and public.ftf_version_historically_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,p_as_of)
        and (applicability.effective_from is null or applicability.effective_from<=p_as_of)
        and (applicability.effective_to is null or applicability.effective_to>p_as_of)
        and upper(btrim(applicability.manufacturer_scope))=upper(btrim(v_manufacturer_scope)) and upper(btrim(applicability.model_scope))=upper(btrim(v_model_scope))
        and public.ftf_asset_text_scope_matches(system_ids,position_ids,applicability.system_code,applicability.component_position_code)
    ) part_result),
    'fluids',(select coalesce(jsonb_agg(fluid_result.data),'[]'::jsonb) from (
      select jsonb_build_object('requirementId',requirement.id,'servicePoint',requirement.service_point,'capacitySemantics',requirement.capacity_semantics,'quantity',requirement.quantity,'unitCode',requirement.unit_code,'approximate',requirement.is_approximate,'tolerance',requirement.manufacturer_tolerance,'specificationVersion',to_jsonb(version),'specification',to_jsonb(specification)) data
      from public.asset_fluid_requirements requirement join public.technical_fluid_specification_versions version on version.id=requirement.fluid_specification_version_id
      join public.technical_fluid_specifications specification on specification.id=version.technical_fluid_specification_id
      where requirement.organisation_id=p_organisation_id and requirement.lifecycle_state in ('EFFECTIVE','SUPERSEDED')
        and public.ftf_version_historically_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,p_as_of)
        and (requirement.effective_from is null or requirement.effective_from<=p_as_of)
        and (requirement.effective_to is null or requirement.effective_to>p_as_of)
        and public.ftf_asset_technical_scope_matches(p_maintainable_asset_id,system_ids,position_ids,requirement.maintainable_asset_id,requirement.system_id,requirement.component_position_id)
      union all
      select jsonb_build_object('applicabilityId',applicability.id,'servicePoint',applicability.service_point,'capacitySemantics',applicability.capacity_semantics,'quantity',applicability.quantity,'unitCode',applicability.unit_code,'approximate',applicability.is_approximate,'tolerance',applicability.manufacturer_tolerance,'specificationVersion',to_jsonb(version),'specification',to_jsonb(specification)) data
      from public.technical_fluid_applicability applicability join public.technical_fluid_specification_versions version on version.id=applicability.fluid_specification_version_id
      join public.technical_fluid_specifications specification on specification.id=version.technical_fluid_specification_id
      where applicability.lifecycle_state in ('EFFECTIVE','SUPERSEDED')
        and public.ftf_version_historically_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,p_as_of)
        and (applicability.effective_from is null or applicability.effective_from<=p_as_of)
        and (applicability.effective_to is null or applicability.effective_to>p_as_of)
        and upper(btrim(applicability.manufacturer_scope))=upper(btrim(v_manufacturer_scope)) and upper(btrim(applicability.model_scope))=upper(btrim(v_model_scope))
        and public.ftf_asset_text_scope_matches(system_ids,position_ids,applicability.system_code,applicability.component_position_code)
    ) fluid_result),
    'serviceTemplates',(select coalesce(jsonb_agg(jsonb_build_object('templateId',template.id,'templateVersionId',version.id,'name',template.template_name,'ownerScope',template.owner_scope,'authorityType',version.authority_type)),'[]'::jsonb)
      from public.service_template_applicability applicability join public.service_template_versions version on version.id=applicability.service_template_version_id
      join public.service_templates template on template.id=version.service_template_id and template.archived_at is null
      where public.ftf_version_historically_effective_at(version.lifecycle_state,version.effective_from,version.effective_to,p_as_of)
        and (applicability.effective_from is null or applicability.effective_from<=p_as_of)
        and (applicability.effective_to is null or applicability.effective_to>p_as_of)
        and ((template.owner_scope='ORGANISATION' and template.organisation_id=p_organisation_id
          and public.ftf_asset_technical_scope_matches(p_maintainable_asset_id,system_ids,position_ids,applicability.maintainable_asset_id,applicability.system_id,applicability.component_position_id))
          or (template.owner_scope='PLATFORM'
            and public.ftf_normalise_technical_scope(applicability.manufacturer_scope)=public.ftf_normalise_technical_scope(v_manufacturer_scope)
            and public.ftf_normalise_technical_scope(applicability.model_scope)=public.ftf_normalise_technical_scope(v_model_scope)
            and public.ftf_asset_text_scope_matches(system_ids,position_ids,applicability.system_code,applicability.component_position_code)))),
    'attachedAssets',to_jsonb(attached_ids)
  );
end; $$;

revoke all on function public.ftf_guard_technical_part_version_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_technical_part_version_identity() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_technical_fluid_version_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_technical_part_equivalence_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_technical_data_proposal() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_effective_asset_technical_requirement() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_canonical_applicability_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_technical_version_effective_at(text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_technical_version_effective_at(text,timestamptz,timestamptz,timestamptz) to service_role;
revoke all on function public.ftf_version_historically_effective_at(text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_version_historically_effective_at(text,timestamptz,timestamptz,timestamptz) to service_role;
revoke all on function public.ftf_normalise_technical_scope(text) from public,anon,authenticated;
grant execute on function public.ftf_normalise_technical_scope(text) to service_role;
revoke all on function public.ftf_guard_asset_technical_scope() from public,anon,authenticated,service_role;
revoke all on function public.ftf_asset_technical_scope_matches(uuid,uuid[],uuid[],uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_asset_technical_scope_matches(uuid,uuid[],uuid[],uuid,uuid,uuid) to service_role;
revoke all on function public.ftf_asset_text_scope_matches(uuid[],uuid[],text,text) from public,anon,authenticated;
grant execute on function public.ftf_asset_text_scope_matches(uuid[],uuid[],text,text) to service_role;
revoke all on function public.ftf_guard_service_template_version_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_service_template_version_authority() from public,anon,authenticated,service_role;
revoke all on function public.ftf_part_preference_version_allowed(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_organisation_part_preference() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_organisation_fluid_preference() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_service_template_applicability_scope() from public,anon,authenticated,service_role;
revoke all on function public.ftf_guard_service_template_aggregate_mutation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_platform_actor_has_permission(uuid,text) from public,anon,authenticated;
grant execute on function public.ftf_platform_actor_has_permission(uuid,text) to service_role;
revoke all on function public.ftf_provision_technical_catalogue_permissions() from public,anon,authenticated,service_role;
revoke all on function public.ftf_publish_technical_version(uuid,text,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_publish_technical_version(uuid,text,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_publish_part_equivalence(uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_publish_part_equivalence(uuid,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_publish_technical_applicability(uuid,text,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_publish_technical_applicability(uuid,text,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_read_organisation_technical_preferences(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ftf_read_organisation_technical_preferences(uuid,uuid) to service_role;
revoke all on function public.ftf_write_organisation_technical_preference(uuid,uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_organisation_technical_preference(uuid,uuid,text,uuid,integer,jsonb) to service_role;
revoke all on function public.ftf_publish_service_template_version(uuid,uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_publish_service_template_version(uuid,uuid,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_publish_platform_service_template_version(uuid,uuid,integer,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_publish_platform_service_template_version(uuid,uuid,integer,timestamptz) to service_role;
revoke all on function public.ftf_read_asset_technical_catalogue(uuid,uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.ftf_read_asset_technical_catalogue(uuid,uuid,uuid,timestamptz) to service_role;
