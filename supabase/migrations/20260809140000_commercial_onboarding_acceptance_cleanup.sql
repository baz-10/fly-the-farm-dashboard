-- Controlled Production Beta onboarding acceptance cleanup.
--
-- This boundary is deliberately narrower than ordinary organisation archival:
-- it accepts the exact evidence identifiers and optimistic row versions emitted
-- by the controlled acceptance verifier. It never mutates the immutable
-- commercial application or invitation history.

create or replace function public.ftf_archive_controlled_acceptance_rows(
  p_table_name text,
  p_organisation_id uuid,
  p_actor_internal_user_id uuid,
  p_expected jsonb,
  p_records_actor boolean default true,
  p_archive boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table regclass;
  v_expected_count integer;
  v_actual_count integer;
  v_matching_count integer;
  v_row record;
begin
  if p_table_name not in (
    'mission_versions','missions','job_fields','jobs','fields',
    'field_boundary_versions','properties','clients',
    'aircraft_equipment_kit_assignments','equipment_kits','aircraft',
    'role_permissions','permissions','roles'
  ) then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_TABLE_FORBIDDEN: %',p_table_name
      using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_expected,'[]'::jsonb))<>'array' then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: %',p_table_name
      using errcode='22023';
  end if;

  v_expected_count:=jsonb_array_length(coalesce(p_expected,'[]'::jsonb));
  if exists(
    select 1 from jsonb_array_elements(coalesce(p_expected,'[]'::jsonb)) item
    where jsonb_typeof(item)<>'object'
      or coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(item->>'rowVersion','') !~ '^[1-9][0-9]*$'
  ) or (
    select count(distinct item->>'id')
    from jsonb_array_elements(coalesce(p_expected,'[]'::jsonb)) item
  )<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: %',p_table_name
      using errcode='22023';
  end if;

  v_table:=to_regclass(format('public.%I',p_table_name));
  if v_table is null then
    if v_expected_count<>0 then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: %',p_table_name
        using errcode='55000';
    end if;
    return 0;
  end if;

  -- Lock the exact active set before comparing versions or archiving it.
  for v_row in execute format(
    'select id,row_version from public.%I where organisation_id=$1 and archived_at is null order by id for update',
    p_table_name
  ) using p_organisation_id loop
    null;
  end loop;

  execute format(
    'select count(*)::integer from public.%I where organisation_id=$1 and archived_at is null',
    p_table_name
  ) into v_actual_count using p_organisation_id;
  execute format(
    'select count(*)::integer
       from public.%I target
       join jsonb_to_recordset($2) expected(id uuid,"rowVersion" integer)
         on expected.id=target.id and expected."rowVersion"=target.row_version
      where target.organisation_id=$1 and target.archived_at is null',
    p_table_name
  ) into v_matching_count using p_organisation_id,coalesce(p_expected,'[]'::jsonb);

  if v_actual_count<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: %',p_table_name
      using errcode='55000';
  end if;
  if v_matching_count<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: %',p_table_name
      using errcode='40001';
  end if;

  -- Append-only evidence is validated against the exact controlled set but is
  -- retained unchanged. Archivable records continue through the branches below.
  if not p_archive then
    return v_matching_count;
  elsif p_records_actor then
    execute format(
      'update public.%I target
          set archived_at=now(),archived_by_internal_user_id=$2
         from jsonb_to_recordset($3) expected(id uuid,"rowVersion" integer)
        where target.organisation_id=$1 and target.id=expected.id
          and target.row_version=expected."rowVersion" and target.archived_at is null',
      p_table_name
    ) using p_organisation_id,p_actor_internal_user_id,coalesce(p_expected,'[]'::jsonb);
  else
    execute format(
      'update public.%I target
          set archived_at=now()
         from jsonb_to_recordset($2) expected(id uuid,"rowVersion" integer)
        where target.organisation_id=$1 and target.id=expected.id
          and target.row_version=expected."rowVersion" and target.archived_at is null',
      p_table_name
    ) using p_organisation_id,coalesce(p_expected,'[]'::jsonb);
  end if;
  get diagnostics v_actual_count=row_count;
  if v_actual_count<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: %',p_table_name
      using errcode='40001';
  end if;
  return v_actual_count;
end;
$$;

create or replace function public.ftf_remove_controlled_acceptance_equipment_links(
  p_organisation_id uuid,
  p_expected jsonb
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table regclass:=to_regclass('public.equipment_kit_aircraft_compatibility');
  v_expected_count integer;
  v_actual_count integer;
  v_matching_count integer;
  v_row record;
begin
  if jsonb_typeof(coalesce(p_expected,'[]'::jsonb))<>'array' then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: equipment_kit_aircraft_compatibility'
      using errcode='22023';
  end if;
  v_expected_count:=jsonb_array_length(coalesce(p_expected,'[]'::jsonb));
  if exists(
    select 1 from jsonb_array_elements(coalesce(p_expected,'[]'::jsonb)) item
    where jsonb_typeof(item)<>'object'
      or coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) or (
    select count(distinct item->>'id')
    from jsonb_array_elements(coalesce(p_expected,'[]'::jsonb)) item
  )<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: equipment_kit_aircraft_compatibility'
      using errcode='22023';
  end if;
  if v_table is null then
    if v_expected_count<>0 then
      raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: equipment_kit_aircraft_compatibility'
        using errcode='55000';
    end if;
    return 0;
  end if;

  for v_row in execute
    'select id from public.equipment_kit_aircraft_compatibility where organisation_id=$1 order by id for update'
    using p_organisation_id loop
    null;
  end loop;
  execute 'select count(*)::integer from public.equipment_kit_aircraft_compatibility where organisation_id=$1'
    into v_actual_count using p_organisation_id;
  execute 'select count(*)::integer
    from public.equipment_kit_aircraft_compatibility target
    join jsonb_to_recordset($2) expected(id uuid) on expected.id=target.id
    where target.organisation_id=$1'
    into v_matching_count using p_organisation_id,coalesce(p_expected,'[]'::jsonb);
  if v_actual_count<>v_expected_count or v_matching_count<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: equipment_kit_aircraft_compatibility'
      using errcode='55000';
  end if;
  execute 'delete from public.equipment_kit_aircraft_compatibility target
    using jsonb_to_recordset($2) expected(id uuid)
    where target.organisation_id=$1 and target.id=expected.id'
    using p_organisation_id,coalesce(p_expected,'[]'::jsonb);
  get diagnostics v_actual_count=row_count;
  if v_actual_count<>v_expected_count then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: equipment_kit_aircraft_compatibility'
      using errcode='55000';
  end if;
  return v_actual_count;
end;
$$;

create or replace function public.ftf_archive_controlled_commercial_onboarding(
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_application public.commercial_onboarding_applications%rowtype;
  v_invitation public.commercial_onboarding_invitations%rowtype;
  v_organisation public.organisations%rowtype;
  v_internal_user public.internal_users%rowtype;
  v_membership public.memberships%rowtype;
  v_location public.operating_locations%rowtype;
  v_seat_allocation public.organisation_seat_allocations%rowtype;
  v_seat_assignment public.internal_user_seat_assignments%rowtype;
  v_base_assignment public.membership_operating_location_assignments%rowtype;
  v_application_id uuid;
  v_invitation_id uuid;
  v_organisation_id uuid;
  v_auth_user_id uuid;
  v_internal_user_id uuid;
  v_membership_id uuid;
  v_operating_location_id uuid;
  v_seat_allocation_id uuid;
  v_seat_assignment_id uuid;
  v_base_assignment_id uuid;
  v_application_reference text;
  v_versions jsonb;
  v_records jsonb;
  v_archived_counts jsonb:='{}'::jsonb;
  v_count integer;
  v_role_id uuid;
begin
  if jsonb_typeof(p_evidence)<>'object'
    or jsonb_typeof(coalesce(p_evidence->'expectedVersions','null'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_evidence->'records','null'::jsonb))<>'object'
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID'
      using errcode='22023';
  end if;

  begin
    v_application_id:=(p_evidence->>'applicationId')::uuid;
    v_invitation_id:=(p_evidence->>'invitationId')::uuid;
    v_organisation_id:=(p_evidence->>'organisationId')::uuid;
    v_auth_user_id:=(p_evidence->>'authUserId')::uuid;
    v_internal_user_id:=(p_evidence->>'internalUserId')::uuid;
    v_membership_id:=(p_evidence->>'membershipId')::uuid;
    v_operating_location_id:=(p_evidence->>'operatingLocationId')::uuid;
    v_seat_allocation_id:=(p_evidence->>'seatAllocationId')::uuid;
    v_seat_assignment_id:=(p_evidence->>'seatAssignmentId')::uuid;
    v_base_assignment_id:=(p_evidence->>'baseAssignmentId')::uuid;
  exception when others then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID'
      using errcode='22023';
  end;
  v_application_reference:=p_evidence->>'applicationReference';
  v_versions:=p_evidence->'expectedVersions';
  v_records:=p_evidence->'records';
  if v_application_id is null or v_invitation_id is null or v_organisation_id is null
    or v_auth_user_id is null or v_internal_user_id is null or v_membership_id is null
    or v_operating_location_id is null or v_seat_allocation_id is null
    or v_seat_assignment_id is null or v_base_assignment_id is null
    or nullif(btrim(v_application_reference),'') is null
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID'
      using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_organisation_id::text,0));

  select * into v_application
  from public.commercial_onboarding_applications
  where id=v_application_id
    and application_reference=v_application_reference
    and application_reference like 'SC-APP-%'
    and business_name like 'SC ACCEPTANCE — %'
    and status='APPROVED'
  for update;
  if not found then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: application'
      using errcode='55000';
  end if;
  if v_application.row_version is distinct from (v_versions->>'application')::integer then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: application'
      using errcode='40001';
  end if;

  select * into v_invitation
  from public.commercial_onboarding_invitations
  where id=v_invitation_id and application_id=v_application_id
    and status='ACCEPTED' and accepted_by_auth_user_id=v_auth_user_id
    and resulting_organisation_id=v_organisation_id
    and resulting_internal_user_id=v_internal_user_id
    and resulting_membership_id=v_membership_id
    and resulting_operating_location_id=v_operating_location_id
  for update;
  if not found then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: invitation'
      using errcode='55000';
  end if;
  if v_invitation.row_version is distinct from (v_versions->>'invitation')::integer then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: invitation'
      using errcode='40001';
  end if;
  if v_application.intended_administrator_email is distinct from lower((
    select email from auth.users where id=v_auth_user_id
  )) then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: auth identity'
      using errcode='55000';
  end if;
  if exists(select 1 from public.platform_users where auth_user_id=v_auth_user_id)
    or exists(select 1 from public.personnel where organisation_id=v_organisation_id)
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: forbidden identity'
      using errcode='55000';
  end if;

  select * into v_organisation from public.organisations
  where id=v_organisation_id and organisation_id=v_organisation_id
    and name=v_application.business_name and archived_at is null for update;
  select * into v_internal_user from public.internal_users
  where id=v_internal_user_id and organisation_id=v_organisation_id
    and auth_user_id=v_auth_user_id and is_active and archived_at is null for update;
  select * into v_membership from public.memberships
  where id=v_membership_id and organisation_id=v_organisation_id
    and internal_user_id=v_internal_user_id and is_active and archived_at is null for update;
  select * into v_location from public.operating_locations
  where id=v_operating_location_id and organisation_id=v_organisation_id
    and archived_at is null for update;
  select * into v_seat_allocation from public.organisation_seat_allocations
  where id=v_seat_allocation_id and organisation_id=v_organisation_id
    and allocated_seats=1 and archived_at is null for update;
  select * into v_seat_assignment from public.internal_user_seat_assignments
  where id=v_seat_assignment_id and organisation_id=v_organisation_id
    and organisation_seat_allocation_id=v_seat_allocation_id
    and internal_user_id=v_internal_user_id and membership_id=v_membership_id
    and status='active' and archived_at is null for update;
  select * into v_base_assignment from public.membership_operating_location_assignments
  where id=v_base_assignment_id and organisation_id=v_organisation_id
    and membership_id=v_membership_id and operating_location_id=v_operating_location_id
    and is_active and archived_at is null for update;
  if v_organisation.id is null or v_internal_user.id is null or v_membership.id is null
    or v_location.id is null or v_seat_allocation.id is null
    or v_seat_assignment.id is null or v_base_assignment.id is null
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_PROVENANCE_MISMATCH: identity chain'
      using errcode='55000';
  end if;
  if v_organisation.row_version is distinct from (v_versions->>'organisation')::integer
    or v_internal_user.row_version is distinct from (v_versions->>'internalUser')::integer
    or v_membership.row_version is distinct from (v_versions->>'membership')::integer
    or v_location.row_version is distinct from (v_versions->>'operatingLocation')::integer
    or v_seat_allocation.row_version is distinct from (v_versions->>'seatAllocation')::integer
    or v_seat_assignment.row_version is distinct from (v_versions->>'seatAssignment')::integer
    or v_base_assignment.row_version is distinct from (v_versions->>'baseAssignment')::integer
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: identity chain'
      using errcode='40001';
  end if;

  select m.role_id into v_role_id from public.memberships m
  join public.roles r on r.organisation_id=m.organisation_id and r.id=m.role_id
  where m.id=v_membership_id and m.organisation_id=v_organisation_id
    and r.code='admin' and r.archived_at is null;
  if v_role_id is null
    or (select count(*) from public.internal_users where organisation_id=v_organisation_id and archived_at is null)<>1
    or (select count(*) from public.memberships where organisation_id=v_organisation_id and archived_at is null)<>1
    or (select count(*) from public.operating_locations where organisation_id=v_organisation_id and archived_at is null)<>1
    or (select count(*) from public.organisation_seat_allocations where organisation_id=v_organisation_id and archived_at is null)<>1
    or (select count(*) from public.internal_user_seat_assignments where organisation_id=v_organisation_id and archived_at is null)<>1
    or (select count(*) from public.membership_operating_location_assignments where organisation_id=v_organisation_id and archived_at is null)<>1
    or (select count(*) from public.ftf_profiles where tenant_id=v_organisation_id and user_id=v_auth_user_id)<>1
    or exists(select 1 from public.ftf_store where tenant_id=v_organisation_id)
  then
    raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: identity chain'
      using errcode='55000';
  end if;

  -- Operational evidence is archived child-first, using the exact verifier set.
  v_count:=public.ftf_archive_controlled_acceptance_rows('mission_versions',v_organisation_id,v_internal_user_id,v_records->'mission_versions',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('mission_versions',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('missions',v_organisation_id,v_internal_user_id,v_records->'missions',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('missions',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('job_fields',v_organisation_id,v_internal_user_id,v_records->'job_fields',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('job_fields',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('jobs',v_organisation_id,v_internal_user_id,v_records->'jobs',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('jobs',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('fields',v_organisation_id,v_internal_user_id,v_records->'fields',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('fields',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('field_boundary_versions',v_organisation_id,v_internal_user_id,v_records->'field_boundary_versions',true,false);
  v_archived_counts:=v_archived_counts||jsonb_build_object('field_boundary_versions_preserved',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('properties',v_organisation_id,v_internal_user_id,v_records->'properties',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('properties',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('clients',v_organisation_id,v_internal_user_id,v_records->'clients',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('clients',v_count);
  v_count:=public.ftf_remove_controlled_acceptance_equipment_links(v_organisation_id,v_records->'equipment_kit_aircraft_compatibility');
  v_archived_counts:=v_archived_counts||jsonb_build_object('equipment_kit_aircraft_compatibility',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('aircraft_equipment_kit_assignments',v_organisation_id,v_internal_user_id,v_records->'aircraft_equipment_kit_assignments',false);
  v_archived_counts:=v_archived_counts||jsonb_build_object('aircraft_equipment_kit_assignments',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('equipment_kits',v_organisation_id,v_internal_user_id,v_records->'equipment_kits',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('equipment_kits',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('aircraft',v_organisation_id,v_internal_user_id,v_records->'aircraft',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('aircraft',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('role_permissions',v_organisation_id,v_internal_user_id,v_records->'role_permissions',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('role_permissions',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('permissions',v_organisation_id,v_internal_user_id,v_records->'permissions',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('permissions',v_count);
  v_count:=public.ftf_archive_controlled_acceptance_rows('roles',v_organisation_id,v_internal_user_id,v_records->'roles',true);
  v_archived_counts:=v_archived_counts||jsonb_build_object('roles',v_count);

  insert into public.audit_events(
    organisation_id,actor_internal_user_id,event_type,entity_type,entity_id,event_payload
  ) values(
    v_organisation_id,v_internal_user_id,'commercial_onboarding.acceptance_archived',
    'organisation',v_organisation_id,jsonb_build_object(
      'applicationId',v_application_id,'applicationReference',v_application_reference,
      'invitationId',v_invitation_id,'archivedCounts',v_archived_counts
    )
  );
  insert into public.transactional_outbox(
    organisation_id,topic,aggregate_type,aggregate_id,payload
  ) values(
    v_organisation_id,'commercial_onboarding.acceptance_archived','organisation',
    v_organisation_id,jsonb_build_object(
      'organisationId',v_organisation_id,'applicationId',v_application_id,
      'invitationId',v_invitation_id,'archivedCounts',v_archived_counts
    )
  );

  update public.internal_user_seat_assignments
    set status='revoked',revoked_at=now(),archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_seat_assignment_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'seatAssignment')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: seat assignment' using errcode='40001'; end if;
  update public.membership_operating_location_assignments
    set is_active=false,archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_base_assignment_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'baseAssignment')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: Base assignment' using errcode='40001'; end if;
  update public.organisation_seat_allocations
    set archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_seat_allocation_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'seatAllocation')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: seat allocation' using errcode='40001'; end if;
  delete from public.ftf_profiles where user_id=v_auth_user_id and tenant_id=v_organisation_id;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_SCOPE_MISMATCH: profile' using errcode='55000'; end if;
  update public.memberships
    set is_active=false,archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_membership_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'membership')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: membership' using errcode='40001'; end if;
  update public.operating_locations
    set archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_operating_location_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'operatingLocation')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: Base' using errcode='40001'; end if;
  update public.internal_users
    set is_active=false,archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_internal_user_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'internalUser')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: internal user' using errcode='40001'; end if;
  update public.organisations
    set archived_at=now(),archived_by_internal_user_id=v_internal_user_id
    where id=v_organisation_id and organisation_id=v_organisation_id
      and row_version=(v_versions->>'organisation')::integer and archived_at is null;
  if not found then raise exception 'COMMERCIAL_ONBOARDING_ACCEPTANCE_VERSION_CONFLICT: organisation' using errcode='40001'; end if;

  return jsonb_build_object(
    'archived',true,'applicationId',v_application_id,'invitationId',v_invitation_id,
    'organisationId',v_organisation_id,'archivedCounts',v_archived_counts
  );
end;
$$;

revoke all on function public.ftf_archive_controlled_acceptance_rows(text,uuid,uuid,jsonb,boolean,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.ftf_remove_controlled_acceptance_equipment_links(uuid,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.ftf_archive_controlled_commercial_onboarding(jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.ftf_archive_controlled_commercial_onboarding(jsonb) to service_role;
