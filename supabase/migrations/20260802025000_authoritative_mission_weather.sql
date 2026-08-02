-- Immutable, versioned Weather evidence used by Mission planning and authorisation.
create function public.ftf_calculate_delta_t(p_temperature_c numeric,p_relative_humidity numeric)
returns numeric language plpgsql immutable strict as $$
declare v_wet_bulb numeric;
begin
 if p_relative_humidity<0 or p_relative_humidity>100 then raise exception 'relative humidity must be between 0 and 100';end if;
 v_wet_bulb=p_temperature_c*atan(0.151977*sqrt(p_relative_humidity+8.313659))+atan(p_temperature_c+p_relative_humidity)-atan(p_relative_humidity-1.676331)+0.00391838*power(p_relative_humidity,1.5)*atan(0.023101*p_relative_humidity)-4.686035;
 return round(p_temperature_c-v_wet_bulb,1);
end $$;

create function public.ftf_weather_freshness(p_observed_at timestamptz,p_evaluated_at timestamptz,p_freshness_minutes integer,p_approaching_minutes integer)
returns text language plpgsql immutable strict as $$
declare v_age interval;
begin
 if p_freshness_minutes<=0 or p_approaching_minutes<0 or p_approaching_minutes>p_freshness_minutes then raise exception 'invalid weather freshness policy';end if;
 v_age=p_evaluated_at-p_observed_at;
 if v_age<interval '0 seconds' then return 'CURRENT';end if;
 if v_age>make_interval(mins=>p_freshness_minutes) then return 'EXPIRED';end if;
 if v_age>=make_interval(mins=>p_freshness_minutes-p_approaching_minutes) then return 'APPROACHING_EXPIRY';end if;
 return 'CURRENT';
end $$;

create table public.organisation_weather_policies(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,manual_freshness_minutes integer not null default 60 check(manual_freshness_minutes>0),provider_freshness_minutes integer not null default 120 check(provider_freshness_minutes>0),approaching_expiry_minutes integer not null default 15 check(approaching_expiry_minutes>=0),require_mission_assignment boolean not null default true,require_second_person_verification boolean not null default false,row_version integer not null default 1 check(row_version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organisation_id),foreign key(organisation_id) references public.organisations(id)
);
create table public.mission_weather_observations(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,mission_id uuid not null,version_number integer not null check(version_number>0),source text not null check(source in('MANUAL','OPEN_METEO')),provider_identifier text,observer_personnel_id uuid,observation_location text not null,latitude numeric(9,6) not null check(latitude between -90 and 90),longitude numeric(9,6) not null check(longitude between -180 and 180),observed_at timestamptz not null,retrieved_at timestamptz,temperature_c numeric(5,2) not null,relative_humidity numeric(5,2) not null check(relative_humidity between 0 and 100),delta_t_c numeric(5,1) not null,wind_speed_kmh numeric(6,2) not null check(wind_speed_kmh>=0),wind_direction_degrees numeric(5,1) not null check(wind_direction_degrees>=0 and wind_direction_degrees<360),precipitation_mm numeric(7,2) not null default 0 check(precipitation_mm>=0),cloud_description text,inversion_assessment text not null check(inversion_assessment in('NOT_ASSESSED','UNLIKELY','POSSIBLE','LIKELY','CONFIRMED','UNABLE_TO_DETERMINE')),inversion_assessment_source text not null,inversion_assessor_personnel_id uuid,inversion_assessed_at timestamptz not null,inversion_notes text,manual_reason text,notes text,provider_snapshot jsonb,transformation_metadata jsonb not null default '{}'::jsonb,record_version integer not null default 1,created_at timestamptz not null default now(),created_by_internal_user_id uuid not null,
 unique(organisation_id,id),unique(organisation_id,mission_id,version_number),foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),foreign key(organisation_id,observer_personnel_id) references public.personnel(organisation_id,id),foreign key(organisation_id,inversion_assessor_personnel_id) references public.personnel(organisation_id,id),foreign key(organisation_id,created_by_internal_user_id) references public.internal_users(organisation_id,id),check((source='MANUAL' and observer_personnel_id is not null and length(trim(manual_reason))>0) or source='OPEN_METEO')
);
create table public.mission_weather_selections(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,operating_location_id uuid not null,mission_id uuid not null,observation_id uuid not null,observation_version integer not null,selection_version integer not null check(selection_version>0),selected_at timestamptz not null default now(),selected_by_internal_user_id uuid not null,unique(organisation_id,mission_id,selection_version),foreign key(organisation_id,mission_id) references public.missions(organisation_id,id),foreign key(organisation_id,observation_id) references public.mission_weather_observations(organisation_id,id),foreign key(organisation_id,operating_location_id) references public.operating_locations(organisation_id,id),foreign key(organisation_id,selected_by_internal_user_id) references public.internal_users(organisation_id,id)
);
create index mission_weather_history_idx on public.mission_weather_observations(organisation_id,mission_id,version_number desc);
do $$declare t text;begin foreach t in array array['organisation_weather_policies','mission_weather_observations','mission_weather_selections'] loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('create policy %I on public.%I for select to authenticated using(public.current_user_has_organisation_access(organisation_id))',t||'_tenant_read',t);execute format('revoke all on table public.%I from public,anon,authenticated',t);execute format('grant select,insert,update,delete on table public.%I to service_role',t);end loop;end$$;
insert into public.organisation_weather_policies(organisation_id)select id from public.organisations on conflict(organisation_id)do nothing;
create function public.ftf_provision_weather_policy()returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin insert into public.organisation_weather_policies(organisation_id)values(new.id)on conflict(organisation_id)do nothing;return new;end$$;
create trigger organisations_provision_weather_policy after insert on public.organisations for each row execute function public.ftf_provision_weather_policy();
revoke all on function public.ftf_calculate_delta_t(numeric,numeric),public.ftf_weather_freshness(timestamptz,timestamptz,integer,integer) from public,anon,authenticated;
grant execute on function public.ftf_calculate_delta_t(numeric,numeric),public.ftf_weather_freshness(timestamptz,timestamptz,integer,integer) to service_role;
