-- IMP-ONB-001: persist explicit Base confirmation on the authoritative operating location.
-- Existing rows remain unconfirmed; missing evidence is never inferred as current.
alter table public.operating_locations
  add column latitude numeric check (latitude between -90 and 90),
  add column longitude numeric check (longitude between -180 and 180),
  add column address_source text check (address_source in ('ADDRESS_SEARCH','MANUALLY_ADJUSTED')),
  add column location_confirmed_at timestamptz;

alter function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)
  rename to ftf_write_operational_resource_without_base_confirmation;

create or replace function public.ftf_apply_operating_location_confirmation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('ftf.base.latitude_present', true) = 'true' then
    new.latitude = nullif(current_setting('ftf.base.latitude', true), '')::numeric;
  end if;
  if current_setting('ftf.base.longitude_present', true) = 'true' then
    new.longitude = nullif(current_setting('ftf.base.longitude', true), '')::numeric;
  end if;
  if current_setting('ftf.base.address_source_present', true) = 'true' then
    new.address_source = nullif(current_setting('ftf.base.address_source', true), '');
  end if;
  if current_setting('ftf.base.location_confirmed_at_present', true) = 'true' then
    new.location_confirmed_at = nullif(current_setting('ftf.base.location_confirmed_at', true), '')::timestamptz;
  end if;
  if tg_op = 'UPDATE' and new.address is distinct from old.address and not (
    current_setting('ftf.base.latitude_present', true) = 'true'
    and current_setting('ftf.base.longitude_present', true) = 'true'
    and current_setting('ftf.base.address_source_present', true) = 'true'
    and current_setting('ftf.base.location_confirmed_at_present', true) = 'true'
    and new.latitude is not null
    and new.longitude is not null
    and new.address_source is not null
    and new.location_confirmed_at is not null
  ) then
    new.latitude = null;
    new.longitude = null;
    new.address_source = null;
    new.location_confirmed_at = null;
  end if;
  return new;
end;
$$;

create trigger operating_locations_apply_confirmation
before insert or update on public.operating_locations
for each row execute function public.ftf_apply_operating_location_confirmation();

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
  if p_resource = 'operating_locations' and p_operation <> 'archive' then
    perform set_config('ftf.base.latitude_present', (p_data ? 'latitude')::text, true);
    perform set_config('ftf.base.latitude', coalesce(p_data->>'latitude', ''), true);
    perform set_config('ftf.base.longitude_present', (p_data ? 'longitude')::text, true);
    perform set_config('ftf.base.longitude', coalesce(p_data->>'longitude', ''), true);
    perform set_config('ftf.base.address_source_present', (p_data ? 'address_source')::text, true);
    perform set_config('ftf.base.address_source', coalesce(p_data->>'address_source', ''), true);
    perform set_config('ftf.base.location_confirmed_at_present', (p_data ? 'location_confirmed_at')::text, true);
    perform set_config('ftf.base.location_confirmed_at', coalesce(p_data->>'location_confirmed_at', ''), true);
  end if;
  return public.ftf_write_operational_resource_without_base_confirmation(
    p_organisation_id,p_actor_internal_user_id,p_resource,p_operation,
    p_entity_id,p_expected_version,p_data
  );
end;
$$;

comment on column public.operating_locations.latitude is 'Operator-confirmed Base latitude.';
comment on column public.operating_locations.longitude is 'Operator-confirmed Base longitude.';
comment on column public.operating_locations.address_source is 'Base coordinate provenance: address search or manually adjusted.';
comment on column public.operating_locations.location_confirmed_at is 'Timestamp of explicit Base map confirmation.';

revoke all on function public.ftf_apply_operating_location_confirmation() from public,anon,authenticated,service_role;
revoke all on function public.ftf_write_operational_resource_without_base_confirmation(uuid,uuid,text,text,uuid,integer,jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb) to service_role;
