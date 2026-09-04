-- Optional, explicitly confirmed Field access/launch point. This remains
-- separate from the Property address and immutable Field boundary evidence.
alter table public.fields
  add column access_point_label text,
  add column access_latitude numeric(9,6),
  add column access_longitude numeric(9,6),
  add column access_coordinate_source text,
  add column access_location_confirmed_at timestamptz,
  add constraint fields_access_point_all_or_none check (
    num_nonnulls(access_point_label, access_latitude, access_longitude,
      access_coordinate_source, access_location_confirmed_at) in (0, 5)
  ),
  add constraint fields_access_point_label_check check (
    access_point_label is null or length(btrim(access_point_label)) between 2 and 100
  ),
  add constraint fields_access_latitude_check check (
    access_latitude is null or access_latitude between -90 and 90
  ),
  add constraint fields_access_longitude_check check (
    access_longitude is null or access_longitude between -180 and 180
  ),
  add constraint fields_access_coordinate_source_check check (
    access_coordinate_source is null or access_coordinate_source in ('PROPERTY_SUGGESTED','MANUALLY_ADJUSTED')
  );

create function public.ftf_apply_field_access_point_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('ftf.field.access_point_present', true) = 'true' then
    new.access_point_label = nullif(btrim(current_setting('ftf.field.access_point_label', true)), '');
    new.access_latitude = nullif(current_setting('ftf.field.access_latitude', true), '')::numeric;
    new.access_longitude = nullif(current_setting('ftf.field.access_longitude', true), '')::numeric;
    new.access_coordinate_source = nullif(current_setting('ftf.field.access_coordinate_source', true), '');
    new.access_location_confirmed_at = nullif(current_setting('ftf.field.access_location_confirmed_at', true), '')::timestamptz;
  end if;
  return new;
end;
$$;

create trigger fields_apply_access_point_metadata
before insert or update on public.fields
for each row execute function public.ftf_apply_field_access_point_metadata();

alter function public.ftf_write_operational_resource_unlocked(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_before_field_access_point;

create function public.ftf_write_operational_resource_unlocked(
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
declare
  v_keys text[] := array['access_point_label','access_latitude','access_longitude','access_coordinate_source','access_location_confirmed_at'];
  v_present integer := 0;
  v_nonempty integer := 0;
  v_key text;
begin
  if p_resource = 'fields' and p_operation <> 'archive' then
    -- A checked writer may be called more than once in one transaction. Reset the
    -- transaction-local bridge so metadata from an earlier Field cannot leak.
    perform set_config('ftf.field.access_point_present', 'false', true);
    foreach v_key in array v_keys loop
      if p_data ? v_key then
        v_present := v_present + 1;
        if nullif(btrim(coalesce(p_data->>v_key, '')), '') is not null then v_nonempty := v_nonempty + 1; end if;
      end if;
    end loop;

    if v_present not in (0, 5) or (v_present = 5 and v_nonempty not in (0, 5)) then
      raise exception 'Field access point evidence must be complete or explicitly cleared' using errcode = '22023';
    end if;
    if v_nonempty = 5 then
      if (p_data->>'access_latitude')::numeric not between -90 and 90
        or (p_data->>'access_longitude')::numeric not between -180 and 180
        or p_data->>'access_coordinate_source' not in ('PROPERTY_SUGGESTED','MANUALLY_ADJUSTED')
        or length(btrim(p_data->>'access_point_label')) not between 2 and 100
        or nullif(p_data->>'access_location_confirmed_at','') is null then
        raise exception 'Field access point evidence is invalid' using errcode = '22023';
      end if;
    end if;
    if v_present = 5 then
      perform set_config('ftf.field.access_point_present', 'true', true);
      foreach v_key in array v_keys loop
        perform set_config('ftf.field.' || v_key, coalesce(p_data->>v_key, ''), true);
      end loop;
    end if;
  end if;

  return public.ftf_write_operational_resource_before_field_access_point(
    p_organisation_id, p_actor_internal_user_id, p_resource, p_operation,
    p_entity_id, p_expected_version, p_data
  );
end;
$$;

comment on column public.fields.access_point_label is 'Operator label for the optional confirmed Field access or launch point.';
comment on column public.fields.access_location_confirmed_at is 'Timestamp of explicit operator confirmation; the point is separate from Property address and Field boundary.';

revoke all on function public.ftf_apply_field_access_point_metadata() from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource_unlocked(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource_before_field_access_point(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
