do $$
declare
  v_count bigint;
  v_digest text;
begin
  if (select count(*) from supabase_migrations.schema_migrations where version='20260813130000')<>1 then
    raise exception 'CLIENT_TO_MISSION_PREFLIGHT: migration 20260813130000 mismatch';
  end if;

  if (select count(*) from public.commercial_onboarding_applications
      where id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid and status='APPROVED' and row_version=3)<>1
    or (select count(*) from public.commercial_onboarding_invitations
      where id='29b9b342-335e-4959-9402-4cb4e1090427'::uuid and status='ACCEPTED' and row_version=3)<>1
    or (select count(*) from public.organisations
      where id='961a4354-40f5-479d-a577-74839596ad14'::uuid and archived_at is not null)<>1
    or (select count(*) from public.internal_users
      where id='2dd42623-5095-47ef-a46e-ace0f684dcf4'::uuid and not is_active and archived_at is not null)<>1
    or (select count(*) from public.memberships
      where id='d8a1ab9e-227b-46a6-b4b4-ea73c2d520be'::uuid and not is_active and archived_at is not null)<>1
    or (select count(*) from public.operating_locations
      where id='5afd5961-be47-4504-89bf-a51e737f3cf7'::uuid and archived_at is not null)<>1
    or (select count(*) from public.organisation_seat_allocations
      where id='eca3b587-bca1-40da-b91b-fb0eef7555ea'::uuid and archived_at is not null)<>1
    or (select count(*) from public.internal_user_seat_assignments
      where id='ca153101-1ce5-451e-b21d-95133434a701'::uuid and status='revoked' and archived_at is not null)<>1
    or (select count(*) from public.membership_operating_location_assignments
      where id='d6b51071-817d-4b58-bf14-780d7d9d8fd8'::uuid and not is_active and archived_at is not null)<>1
  then
    raise exception 'CLIENT_TO_MISSION_PREFLIGHT: controlled archive state mismatch';
  end if;

  if (select count(*) from public.audit_events
      where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid
        and event_type='commercial_onboarding.acceptance_archived')<>1
    or (select count(*) from public.transactional_outbox
      where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid
        and topic='commercial_onboarding.acceptance_archived')<>1
    or (select count(*) from public.ftf_store
      where tenant_id='961a4354-40f5-479d-a577-74839596ad14'::uuid)<>0
    or (select count(*) from public.platform_users
      where auth_user_id='ef06368d-6981-4fa6-8317-657bd6418f32'::uuid)<>0
    or (select count(*) from public.personnel
      where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid)<>0
  then
    raise exception 'CLIENT_TO_MISSION_PREFLIGHT: controlled evidence boundary mismatch';
  end if;

  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.clients t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>27 or v_digest<>'361ec0ed3203caf8f71f5a0e580fb98f' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: clients'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.properties t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>23 or v_digest<>'8481208a52acf250dcb45d8ddd954297' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: properties'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.fields t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>20 or v_digest<>'ac6d293bc50227acac86e26feaaac141' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: fields'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.jobs t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>18 or v_digest<>'e2c080779ebb0c3eda4f6ba63eb7a712' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: jobs'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.missions t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>18 or v_digest<>'341a30e6f87afdcaaab99d8622c95ba8' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: missions'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.organisations t where id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>7 or v_digest<>'7544fdbf2a4820630183588eaa0d542a' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: organisations'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
    into v_count,v_digest from public.personnel t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>3 or v_digest<>'ea98f788724f969e823071afdcbb1ec4' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: personnel'; end if;
  select count(*),md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by tenant_id::text,collection,record_id),''))
    into v_count,v_digest from public.ftf_store t where tenant_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid;
  if v_count<>6 or v_digest<>'f29ee3e6379136074b2f69dc715e2d46' then raise exception 'CLIENT_TO_MISSION_PREFLIGHT: digest mismatch: ftf_store'; end if;
end
$$;

select jsonb_build_object(
  'verified',true,
  'migration','20260813130000',
  'controlledFixture','archived',
  'genuineBaseline','unchanged'
) as client_to_mission_production_preflight;
