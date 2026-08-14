do $$
begin
  if (select count(*) from supabase_migrations.schema_migrations
      where version='20260813140000')<>1
    or (select max(version) from supabase_migrations.schema_migrations)<>'20260813140000'
    or exists(select 1 from supabase_migrations.schema_migrations where version>'20260813140000')
  then
    raise exception 'PRODUCTION_STATE_INTEGRITY: migration head mismatch';
  end if;

  if (select count(*) from public.commercial_onboarding_applications
      where id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid
        and status='APPROVED' and row_version=3)<>1
    or (select count(*) from public.commercial_onboarding_invitations
      where id='29b9b342-335e-4959-9402-4cb4e1090427'::uuid
        and application_id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid
        and accepted_by_auth_user_id='ef06368d-6981-4fa6-8317-657bd6418f32'::uuid
        and status='ACCEPTED' and row_version=3)<>1
    or (select count(*) from auth.users
      where id='ef06368d-6981-4fa6-8317-657bd6418f32'::uuid)<>1
    or (select count(*) from public.organisations
      where id='961a4354-40f5-479d-a577-74839596ad14'::uuid
        and archived_at is not null)<>1
    or (select count(*) from public.internal_users
      where id='2dd42623-5095-47ef-a46e-ace0f684dcf4'::uuid
        and auth_user_id='ef06368d-6981-4fa6-8317-657bd6418f32'::uuid
        and not is_active and archived_at is not null)<>1
    or (select count(*) from public.memberships
      where id='d8a1ab9e-227b-46a6-b4b4-ea73c2d520be'::uuid
        and internal_user_id='2dd42623-5095-47ef-a46e-ace0f684dcf4'::uuid
        and not is_active and archived_at is not null)<>1
    or (select count(*) from public.operating_locations
      where id='5afd5961-be47-4504-89bf-a51e737f3cf7'::uuid
        and archived_at is not null)<>1
    or (select count(*) from public.organisation_seat_allocations
      where id='eca3b587-bca1-40da-b91b-fb0eef7555ea'::uuid
        and archived_at is not null)<>1
    or (select count(*) from public.internal_user_seat_assignments
      where id='ca153101-1ce5-451e-b21d-95133434a701'::uuid
        and status='revoked' and archived_at is not null)<>1
    or (select count(*) from public.membership_operating_location_assignments
      where id='d6b51071-817d-4b58-bf14-780d7d9d8fd8'::uuid
        and not is_active and archived_at is not null)<>1
  then
    raise exception 'PRODUCTION_STATE_INTEGRITY: controlled identity mismatch';
  end if;
end
$$;

-- BEGIN CONTROLLED ACCEPTANCE INTEGRITY
do $controlled_acceptance_integrity$
begin
  -- A name is only a candidate marker. Canonical application identity,
  -- lifecycle, invitation provenance and resulting organisation state must
  -- all agree before the record is treated as controlled evidence.
  if (select count(*)
      from public.commercial_onboarding_applications application
      join public.commercial_onboarding_invitations invitation
        on invitation.id='29b9b342-335e-4959-9402-4cb4e1090427'::uuid
       and invitation.application_id=application.id
      join public.organisations organisation
        on organisation.id='961a4354-40f5-479d-a577-74839596ad14'::uuid
       and organisation.id=invitation.resulting_organisation_id
       and organisation.name=application.business_name
      where application.id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid
        and application.application_reference='SC-APP-FD04165C43EA'
        and application.business_name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
        and organisation.archived_at is not null)<>1

    -- Every controlled application remains immutable, approved and backed by
    -- its exact canonical status sequence. Historical rows are not rejected.
    or exists(
      select 1 from public.commercial_onboarding_applications application
      where application.application_reference ~ '^SC-APP-[A-Z0-9]+$'
        and application.business_name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
        and (
          application.status<>'APPROVED' or application.row_version<>3
          or (select array_agg(event.to_status order by event.created_at,event.id)
              from public.commercial_onboarding_application_events event
              where event.application_id=application.id)
            is distinct from array['SUBMITTED','UNDER_REVIEW','APPROVED']::text[]
          or (select count(*) from public.commercial_onboarding_invitations invitation
              where invitation.application_id=application.id)<>1
        )
    )

    -- The observed retained invitation forms are either SENT without any
    -- resulting identity, or ACCEPTED with exact lifecycle and provenance.
    or exists(
      select 1
      from public.commercial_onboarding_invitations invitation
      join public.commercial_onboarding_applications application on application.id=invitation.application_id
      where application.application_reference ~ '^SC-APP-[A-Z0-9]+$'
        and application.business_name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
        and case invitation.status
          when 'SENT' then invitation.row_version<>2
            or invitation.accepted_by_auth_user_id is not null
            or invitation.resulting_organisation_id is not null
            or invitation.resulting_internal_user_id is not null
            or invitation.resulting_membership_id is not null
            or invitation.resulting_operating_location_id is not null
            or (select array_agg(event.to_status order by event.created_at,event.id)
                from public.commercial_onboarding_invitation_events event
                where event.invitation_id=invitation.id and event.application_id=application.id)
              is distinct from array['PENDING','SENT']::text[]
          when 'ACCEPTED' then invitation.row_version<>3
            or invitation.accepted_by_auth_user_id is null
            or invitation.resulting_organisation_id is null
            or invitation.resulting_internal_user_id is null
            or invitation.resulting_membership_id is null
            or invitation.resulting_operating_location_id is null
            or (select array_agg(event.to_status order by event.created_at,event.id)
                from public.commercial_onboarding_invitation_events event
                where event.invitation_id=invitation.id and event.application_id=application.id)
              is distinct from array['PENDING','SENT','ACCEPTED']::text[]
            or (select count(*) from public.audit_events audit
                where audit.organisation_id=invitation.resulting_organisation_id
                  and audit.event_type='commercial_onboarding.accepted'
                  and audit.entity_id=invitation.id)<>1
          else true
        end
    )

    -- Accepted controlled provenance resolves to exactly one matching
    -- organisation, and every exact controlled organisation resolves back to
    -- exactly one accepted invitation. This rejects ambiguous replacements.
    or exists(
      select 1
      from public.commercial_onboarding_invitations invitation
      join public.commercial_onboarding_applications application on application.id=invitation.application_id
      where application.application_reference ~ '^SC-APP-[A-Z0-9]+$'
        and application.business_name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
        and invitation.status='ACCEPTED'
        and (select count(*) from public.organisations organisation
             where organisation.id=invitation.resulting_organisation_id
               and organisation.name=application.business_name)<>1
    )
    or exists(
      select 1 from public.organisations organisation
      where organisation.name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
        and (select count(*)
             from public.commercial_onboarding_invitations invitation
             join public.commercial_onboarding_applications application on application.id=invitation.application_id
             where invitation.status='ACCEPTED'
               and invitation.resulting_organisation_id=organisation.id
               and application.application_reference ~ '^SC-APP-[A-Z0-9]+$'
               and application.business_name=organisation.name)<>1
    )

    -- An accepted controlled organisation is legitimate only in the fully
    -- archived terminal state. Active residue is never historical evidence.
    or exists(
      select 1
      from public.organisations organisation
      join public.commercial_onboarding_invitations invitation
        on invitation.resulting_organisation_id=organisation.id and invitation.status='ACCEPTED'
      join public.commercial_onboarding_applications application
        on application.id=invitation.application_id and application.business_name=organisation.name
      where application.application_reference ~ '^SC-APP-[A-Z0-9]+$'
        and application.business_name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
        and (
          organisation.archived_at is null
          or (select count(*) from public.internal_users row
              where row.organisation_id=organisation.id)<>1
          or (select count(*) from public.internal_users row
              where row.id=invitation.resulting_internal_user_id
                and row.organisation_id=organisation.id
                and row.auth_user_id=invitation.accepted_by_auth_user_id
                and not row.is_active and row.archived_at is not null)<>1
          or (select count(*) from public.memberships row
              where row.organisation_id=organisation.id)<>1
          or (select count(*) from public.memberships row
              where row.id=invitation.resulting_membership_id
                and row.organisation_id=organisation.id
                and row.internal_user_id=invitation.resulting_internal_user_id
                and not row.is_active and row.archived_at is not null)<>1
          or (select count(*) from public.operating_locations row
              where row.organisation_id=organisation.id)<>1
          or (select count(*) from public.operating_locations row
              where row.id=invitation.resulting_operating_location_id
                and row.organisation_id=organisation.id
                and row.archived_at is not null)<>1
          or (select count(*) from public.organisation_seat_allocations row
              where row.organisation_id=organisation.id and row.archived_at is not null)<>1
          or (select count(*) from public.internal_user_seat_assignments row
              where row.organisation_id=organisation.id)<>1
          or (select count(*) from public.internal_user_seat_assignments row
              where row.organisation_id=organisation.id
                and row.internal_user_id=invitation.resulting_internal_user_id
                and row.membership_id=invitation.resulting_membership_id
                and row.organisation_seat_allocation_id=(
                  select allocation.id from public.organisation_seat_allocations allocation
                  where allocation.organisation_id=organisation.id
                )
                and row.status='revoked' and row.archived_at is not null)<>1
          or (select count(*) from public.membership_operating_location_assignments row
              where row.organisation_id=organisation.id)<>1
          or (select count(*) from public.membership_operating_location_assignments row
              where row.organisation_id=organisation.id
                and row.membership_id=invitation.resulting_membership_id
                and row.operating_location_id=invitation.resulting_operating_location_id
                and not row.is_active and row.archived_at is not null)<>1
          or exists(select 1 from public.internal_users row where row.organisation_id=organisation.id and (row.is_active or row.archived_at is null))
          or exists(select 1 from public.memberships row where row.organisation_id=organisation.id and (row.is_active or row.archived_at is null))
          or exists(select 1 from public.operating_locations row where row.organisation_id=organisation.id and row.archived_at is null)
          or exists(select 1 from public.organisation_seat_allocations row where row.organisation_id=organisation.id and row.archived_at is null)
          or exists(select 1 from public.internal_user_seat_assignments row where row.organisation_id=organisation.id and (row.status<>'revoked' or row.archived_at is null))
          or exists(select 1 from public.membership_operating_location_assignments row where row.organisation_id=organisation.id and (row.is_active or row.archived_at is null))
          or exists(select 1 from public.platform_users row where row.auth_user_id=invitation.accepted_by_auth_user_id)
          or exists(select 1 from public.personnel row where row.organisation_id=organisation.id)
          or exists(select 1 from public.ftf_profiles row where row.tenant_id=organisation.id)
          or exists(select 1 from public.ftf_store row where row.tenant_id=organisation.id)
          or exists(select 1 from public.clients row where row.organisation_id=organisation.id and row.archived_at is null)
          or exists(select 1 from public.properties row where row.organisation_id=organisation.id and row.archived_at is null)
          or exists(select 1 from public.fields row where row.organisation_id=organisation.id and row.archived_at is null)
          or exists(select 1 from public.jobs row where row.organisation_id=organisation.id and row.archived_at is null)
          or exists(select 1 from public.missions row where row.organisation_id=organisation.id and row.archived_at is null)
          or (select count(*) from public.audit_events audit
              where audit.organisation_id=organisation.id
                and audit.event_type='commercial_onboarding.acceptance_archived'
                and audit.entity_type='organisation'
                and audit.entity_id=organisation.id
                and audit.event_payload->>'applicationId'=application.id::text
                and audit.event_payload->>'invitationId'=invitation.id::text)<>1
          or (select count(*) from public.transactional_outbox outbox
              where outbox.organisation_id=organisation.id
                and outbox.topic='commercial_onboarding.acceptance_archived'
                and outbox.aggregate_type='organisation'
                and outbox.aggregate_id=organisation.id
                and outbox.payload->>'organisationId'=organisation.id::text
                and outbox.payload->>'applicationId'=application.id::text
                and outbox.payload->>'invitationId'=invitation.id::text)<>1
        )
    )
  then
    raise exception 'PRODUCTION_STATE_INTEGRITY: controlled evidence mismatch';
  end if;
end
$controlled_acceptance_integrity$;
-- END CONTROLLED ACCEPTANCE INTEGRITY

do $$
begin
  if (select count(*) from public.clients t
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>27
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.clients t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'361ec0ed3203caf8f71f5a0e580fb98f'
    or (select count(*) from public.properties t
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>23
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.properties t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'8481208a52acf250dcb45d8ddd954297'
    or (select count(*) from public.fields t
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>20
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.fields t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'ac6d293bc50227acac86e26feaaac141'
    or (select count(*) from public.jobs t
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>18
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.jobs t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'e2c080779ebb0c3eda4f6ba63eb7a712'
    or (select count(*) from public.missions t
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>18
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.missions t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'341a30e6f87afdcaaab99d8622c95ba8'
    or (select count(*) from public.organisations t
      where id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>7
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.organisations t where id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'7544fdbf2a4820630183588eaa0d542a'
    or (select count(*) from public.personnel t
      where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>3
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by id::text),''))
      from public.personnel t where organisation_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'ea98f788724f969e823071afdcbb1ec4'
    or (select count(*) from public.ftf_store t
      where tenant_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>6
    or (select md5(coalesce(string_agg(md5(row_to_json(t)::text),'' order by tenant_id::text,collection,record_id),''))
      from public.ftf_store t where tenant_id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)<>'f29ee3e6379136074b2f69dc715e2d46'
  then
    raise exception 'PRODUCTION_STATE_INTEGRITY: frozen genuine baseline mismatch';
  end if;
end
$$;

select jsonb_build_object(
  'verified',true,
  'migrationHead','20260813140000',
  'controlledFixture','MATCH',
  'genuineBaseline','MATCH',
  'frozen',jsonb_build_object(
    'clients',jsonb_build_object('count',27,'digest','361ec0ed3203caf8f71f5a0e580fb98f'),
    'properties',jsonb_build_object('count',23,'digest','8481208a52acf250dcb45d8ddd954297'),
    'fields',jsonb_build_object('count',20,'digest','ac6d293bc50227acac86e26feaaac141'),
    'jobs',jsonb_build_object('count',18,'digest','e2c080779ebb0c3eda4f6ba63eb7a712'),
    'missions',jsonb_build_object('count',18,'digest','341a30e6f87afdcaaab99d8622c95ba8'),
    'organisations',jsonb_build_object('count',7,'digest','7544fdbf2a4820630183588eaa0d542a'),
    'personnel',jsonb_build_object('count',3,'digest','ea98f788724f969e823071afdcbb1ec4'),
    'ftfStore',jsonb_build_object('count',6,'digest','f29ee3e6379136074b2f69dc715e2d46')
  ),
  'historyClassification','NOT PREVIOUSLY FROZEN',
  'applicationEventCount',(select count(*) from public.commercial_onboarding_application_events where application_id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid),
  'invitationEventCount',(select count(*) from public.commercial_onboarding_invitation_events where invitation_id='29b9b342-335e-4959-9402-4cb4e1090427'::uuid)
)::text;
