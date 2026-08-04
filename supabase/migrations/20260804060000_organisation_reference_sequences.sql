-- IMP-MIS-001: organisation-owned, collision-safe Job and Mission references.
alter table public.organisations add column reference_prefix text;

create function public.ftf_suggest_reference_prefix(p_name text) returns text
language plpgsql immutable set search_path=public as $$declare v_prefix text;begin
 select string_agg(left(word,1),'') into v_prefix from regexp_split_to_table(trim(coalesce(p_name,'')),'\s+') word where word<>'';
 v_prefix:=substring(regexp_replace(upper(coalesce(v_prefix,'')),'[^A-Z0-9]','','g') from 1 for 8);
 if length(v_prefix)<2 then v_prefix:=substring(regexp_replace(upper(coalesce(p_name,'ORG')),'[^A-Z0-9]','','g') from 1 for 8);end if;
 if length(v_prefix)<2 then v_prefix:='ORG';end if;
 return v_prefix;
end$$;

update public.organisations set reference_prefix=public.ftf_suggest_reference_prefix(name) where reference_prefix is null;
alter table public.organisations alter column reference_prefix set not null;
alter table public.organisations add constraint organisations_reference_prefix_format check(reference_prefix~'^[A-Z0-9]{2,8}$');

create table public.organisation_reference_sequences(
 organisation_id uuid not null references public.organisations(id),
 resource_type text not null check(resource_type in ('job','mission')),
 last_value bigint not null default 0 check(last_value>=0),
 updated_at timestamptz not null default now(),
 primary key(organisation_id,resource_type)
);
alter table public.organisation_reference_sequences enable row level security;

create function public.ftf_allocate_operational_reference(p_organisation_id uuid,p_resource_type text)returns text
language plpgsql security definer set search_path=public as $$declare v_prefix text;v_next bigint;v_marker text;begin
 if p_resource_type not in('job','mission')then raise exception'unsupported reference resource'using errcode='22023';end if;
 select reference_prefix into v_prefix from public.organisations where id=p_organisation_id and archived_at is null for update;
 if v_prefix is null then raise exception'active organisation reference prefix required'using errcode='22023';end if;
 insert into public.organisation_reference_sequences(organisation_id,resource_type,last_value)values(p_organisation_id,p_resource_type,0)on conflict do nothing;
 select last_value+1 into v_next from public.organisation_reference_sequences where organisation_id=p_organisation_id and resource_type=p_resource_type for update;
 update public.organisation_reference_sequences set last_value=v_next,updated_at=now()where organisation_id=p_organisation_id and resource_type=p_resource_type;
 v_marker:=case when p_resource_type='job'then'JOB'else'MIS'end;
 return v_prefix||'-'||v_marker||'-'||lpad(v_next::text,6,'0');
end$$;

alter function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)rename to ftf_write_operational_resource_before_reference_sequences;
create function public.ftf_write_operational_resource(p_organisation_id uuid,p_actor_internal_user_id uuid,p_resource text,p_operation text,p_entity_id uuid default null,p_expected_version integer default null,p_data jsonb default'{}'::jsonb)returns jsonb
language plpgsql security definer set search_path=public as $$declare v_data jsonb:=coalesce(p_data,'{}'::jsonb);v_reference text;begin
 perform pg_advisory_xact_lock(hashtext(p_organisation_id::text)::bigint);
 if not public.ftf_actor_has_active_beta_seat(p_organisation_id,p_actor_internal_user_id)then raise exception'active organisation actor seat required'using errcode='42501';end if;
 if p_operation='create'and p_resource in('jobs','missions')and coalesce((v_data->>'auto_generate_reference')::boolean,false)then
  v_reference:=public.ftf_allocate_operational_reference(p_organisation_id,case when p_resource='jobs'then'job'else'mission'end);
  v_data:=v_data-'auto_generate_reference'||jsonb_build_object(case when p_resource='jobs'then'reference'else'mission_number'end,v_reference);
 elsif v_data?'auto_generate_reference'then v_data:=v_data-'auto_generate_reference';end if;
 return public.ftf_write_operational_resource_before_reference_sequences(p_organisation_id,p_actor_internal_user_id,p_resource,p_operation,p_entity_id,p_expected_version,v_data);
end$$;

revoke all on function public.ftf_suggest_reference_prefix(text)from public,anon,authenticated;
revoke all on function public.ftf_allocate_operational_reference(uuid,text)from public,anon,authenticated;
revoke all on function public.ftf_write_operational_resource_before_reference_sequences(uuid,uuid,text,text,uuid,integer,jsonb)from public,anon,authenticated,service_role;
revoke all on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)from public,anon,authenticated;
grant execute on function public.ftf_write_operational_resource(uuid,uuid,text,text,uuid,integer,jsonb)to service_role;
