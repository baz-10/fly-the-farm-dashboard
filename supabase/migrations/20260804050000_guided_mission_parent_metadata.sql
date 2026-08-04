-- IMP-MIS-001: retain the minimum parent metadata captured by guided Mission creation.
alter table public.clients add column notes text;
alter table public.properties add column locality text;
alter table public.properties add column primary_contact_name text;
alter table public.properties add column access_notes text;
alter table public.properties add column notes text;
alter table public.properties add column latitude numeric(9,6) check(latitude between -90 and 90);
alter table public.properties add column longitude numeric(9,6) check(longitude between -180 and 180);

create function public.ftf_apply_guided_parent_metadata() returns trigger language plpgsql set search_path=public as $$begin
 if tg_table_name='clients' and current_setting('ftf.client.notes_present',true)='true' then new.notes=nullif(current_setting('ftf.client.notes',true),'');end if;
 if tg_table_name='properties' then
  if current_setting('ftf.property.locality_present',true)='true'then new.locality=nullif(current_setting('ftf.property.locality',true),'');end if;
  if current_setting('ftf.property.primary_contact_name_present',true)='true'then new.primary_contact_name=nullif(current_setting('ftf.property.primary_contact_name',true),'');end if;
  if current_setting('ftf.property.access_notes_present',true)='true'then new.access_notes=nullif(current_setting('ftf.property.access_notes',true),'');end if;
  if current_setting('ftf.property.notes_present',true)='true'then new.notes=nullif(current_setting('ftf.property.notes',true),'');end if;
  if current_setting('ftf.property.latitude_present',true)='true'then new.latitude=nullif(current_setting('ftf.property.latitude',true),'')::numeric;end if;
  if current_setting('ftf.property.longitude_present',true)='true'then new.longitude=nullif(current_setting('ftf.property.longitude',true),'')::numeric;end if;
 end if;return new;
end$$;
create trigger clients_apply_guided_metadata before insert or update on public.clients for each row execute function public.ftf_apply_guided_parent_metadata();
create trigger properties_apply_guided_metadata before insert or update on public.properties for each row execute function public.ftf_apply_guided_parent_metadata();

create or replace function public.ftf_write_operational_resource_unlocked(p_organisation_id uuid,p_actor_internal_user_id uuid,p_resource text,p_operation text,p_entity_id uuid default null,p_expected_version integer default null,p_data jsonb default'{}'::jsonb)returns jsonb language plpgsql security definer set search_path=public as $$declare v_state text;k text;begin
 if p_resource='properties'and p_operation<>'archive'then v_state=p_data->>'state';if v_state is null or v_state not in('NSW','VIC','QLD','SA','WA','TAS','NT','ACT')then raise exception'property state must be an Australian state or territory code';end if;perform set_config('ftf.property_state',v_state,true);end if;
 if p_resource='clients'and p_operation<>'archive'then perform set_config('ftf.client.notes_present',(p_data?'notes')::text,true);perform set_config('ftf.client.notes',coalesce(p_data->>'notes',''),true);end if;
 if p_resource='properties'and p_operation<>'archive'then foreach k in array array['locality','primaryContactName','accessNotes','notes','latitude','longitude']loop perform set_config('ftf.property.'||lower(regexp_replace(k,'([A-Z])','_\1','g'))||'_present',(p_data?k)::text,true);perform set_config('ftf.property.'||lower(regexp_replace(k,'([A-Z])','_\1','g')),coalesce(p_data->>k,''),true);end loop;end if;
 return public.ftf_write_operational_resource_without_property_state(p_organisation_id,p_actor_internal_user_id,p_resource,p_operation,p_entity_id,p_expected_version,p_data);
end$$;
revoke all on function public.ftf_apply_guided_parent_metadata()from public,anon,authenticated;
revoke all on function public.ftf_write_operational_resource_unlocked(uuid,uuid,text,text,uuid,integer,jsonb)from public,anon,authenticated,service_role;
