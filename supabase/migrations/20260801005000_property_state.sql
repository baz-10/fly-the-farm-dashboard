-- Forward-only support for authoritative Australian property state. Existing
-- rows remain null until a trusted backfill supplies their real state; no
-- jurisdiction is guessed.
alter table public.properties
  add column state text;

alter table public.properties
  add constraint properties_state_code_check
  check (state is null or state in ('NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'));

create function public.ftf_apply_trusted_property_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_state text;
begin
  v_state := nullif(current_setting('ftf.property_state', true), '');
  if v_state is not null then
    new.state := v_state;
  end if;
  return new;
end;
$$;

create trigger properties_apply_trusted_state
before insert or update on public.properties
for each row execute function public.ftf_apply_trusted_property_state();

alter function public.ftf_write_operational_resource_unlocked(uuid, uuid, text, text, uuid, integer, jsonb)
  rename to ftf_write_operational_resource_without_property_state;

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
  v_state text;
begin
  if p_resource = 'properties' and p_operation <> 'archive' then
    v_state := p_data->>'state';
    if v_state is null or v_state not in ('NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT') then
      raise exception 'property state must be an Australian state or territory code';
    end if;
    perform set_config('ftf.property_state', v_state, true);
  end if;

  return public.ftf_write_operational_resource_without_property_state(
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

revoke all on function public.ftf_apply_trusted_property_state() from public, anon, authenticated;
revoke all on function public.ftf_write_operational_resource_unlocked(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.ftf_write_operational_resource_without_property_state(uuid, uuid, text, text, uuid, integer, jsonb) from public, anon, authenticated, service_role;
