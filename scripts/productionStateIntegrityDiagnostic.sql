with controlled_applications as (
  select application.*
  from public.commercial_onboarding_applications application
  where application.application_reference ~ '^SC-APP-[A-Z0-9]+$'
    and application.business_name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
), current_controlled_chain_issues as (
  select 'a865f157-c334-447e-aa1e-661ee0db7b85'::uuid id
  where (select count(*)
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
), application_lifecycle_issues as (
  select application.id
  from controlled_applications application
  where application.status<>'APPROVED' or application.row_version<>3
    or (select array_agg(event.to_status order by event.created_at,event.id)
        from public.commercial_onboarding_application_events event
        where event.application_id=application.id)
      is distinct from array['SUBMITTED','UNDER_REVIEW','APPROVED']::text[]
    or (select count(*) from public.commercial_onboarding_invitations invitation
        where invitation.application_id=application.id)<>1
), invitation_lifecycle_issues as (
  select invitation.id
  from public.commercial_onboarding_invitations invitation
  join controlled_applications application on application.id=invitation.application_id
  where case invitation.status
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
    else true end
), accepted_organisation_link_issues as (
  select invitation.id
  from public.commercial_onboarding_invitations invitation
  join controlled_applications application on application.id=invitation.application_id
  where invitation.status='ACCEPTED'
    and (select count(*) from public.organisations organisation
         where organisation.id=invitation.resulting_organisation_id
           and organisation.name=application.business_name)<>1
), organisation_reverse_link_issues as (
  select organisation.id
  from public.organisations organisation
  where organisation.name ~ '^SC ACCEPTANCE — [0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z ONBOARDING$'
    and (select count(*)
         from public.commercial_onboarding_invitations invitation
         join controlled_applications application on application.id=invitation.application_id
         where invitation.status='ACCEPTED'
           and invitation.resulting_organisation_id=organisation.id
           and application.business_name=organisation.name)<>1
), accepted_controlled as (
  select application.id application_id, invitation.id invitation_id,
    invitation.accepted_by_auth_user_id, invitation.resulting_internal_user_id,
    invitation.resulting_membership_id, invitation.resulting_operating_location_id,
    organisation.id organisation_id, organisation.archived_at
  from controlled_applications application
  join public.commercial_onboarding_invitations invitation
    on invitation.application_id=application.id and invitation.status='ACCEPTED'
  join public.organisations organisation
    on organisation.id=invitation.resulting_organisation_id
   and organisation.name=application.business_name
), archived_identity_chain_issues as (
  select accepted.organisation_id id
  from accepted_controlled accepted
  where accepted.archived_at is null
    or (select count(*) from public.internal_users row where row.organisation_id=accepted.organisation_id)<>1
    or (select count(*) from public.internal_users row
        where row.id=accepted.resulting_internal_user_id and row.organisation_id=accepted.organisation_id
          and row.auth_user_id=accepted.accepted_by_auth_user_id
          and not row.is_active and row.archived_at is not null)<>1
    or (select count(*) from public.memberships row where row.organisation_id=accepted.organisation_id)<>1
    or (select count(*) from public.memberships row
        where row.id=accepted.resulting_membership_id and row.organisation_id=accepted.organisation_id
          and row.internal_user_id=accepted.resulting_internal_user_id
          and not row.is_active and row.archived_at is not null)<>1
    or (select count(*) from public.operating_locations row where row.organisation_id=accepted.organisation_id)<>1
    or (select count(*) from public.operating_locations row
        where row.id=accepted.resulting_operating_location_id and row.organisation_id=accepted.organisation_id
          and row.archived_at is not null)<>1
    or (select count(*) from public.organisation_seat_allocations row
        where row.organisation_id=accepted.organisation_id and row.archived_at is not null)<>1
    or (select count(*) from public.internal_user_seat_assignments row
        where row.organisation_id=accepted.organisation_id)<>1
    or (select count(*) from public.internal_user_seat_assignments row
        where row.organisation_id=accepted.organisation_id
          and row.internal_user_id=accepted.resulting_internal_user_id
          and row.membership_id=accepted.resulting_membership_id
          and row.organisation_seat_allocation_id=(select allocation.id
            from public.organisation_seat_allocations allocation
            where allocation.organisation_id=accepted.organisation_id)
          and row.status='revoked' and row.archived_at is not null)<>1
    or (select count(*) from public.membership_operating_location_assignments row
        where row.organisation_id=accepted.organisation_id)<>1
    or (select count(*) from public.membership_operating_location_assignments row
        where row.organisation_id=accepted.organisation_id
          and row.membership_id=accepted.resulting_membership_id
          and row.operating_location_id=accepted.resulting_operating_location_id
          and not row.is_active and row.archived_at is not null)<>1
    or exists(select 1 from public.internal_users row where row.organisation_id=accepted.organisation_id and (row.is_active or row.archived_at is null))
    or exists(select 1 from public.memberships row where row.organisation_id=accepted.organisation_id and (row.is_active or row.archived_at is null))
    or exists(select 1 from public.operating_locations row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
    or exists(select 1 from public.organisation_seat_allocations row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
    or exists(select 1 from public.internal_user_seat_assignments row where row.organisation_id=accepted.organisation_id and (row.status<>'revoked' or row.archived_at is null))
    or exists(select 1 from public.membership_operating_location_assignments row where row.organisation_id=accepted.organisation_id and (row.is_active or row.archived_at is null))
), unexpected_operational_link_issues as (
  select accepted.organisation_id id
  from accepted_controlled accepted
  where exists(select 1 from public.platform_users row where row.auth_user_id=accepted.accepted_by_auth_user_id)
    or exists(select 1 from public.personnel row where row.organisation_id=accepted.organisation_id)
    or exists(select 1 from public.ftf_profiles row where row.tenant_id=accepted.organisation_id)
    or exists(select 1 from public.ftf_store row where row.tenant_id=accepted.organisation_id)
    or exists(select 1 from public.clients row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
    or exists(select 1 from public.properties row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
    or exists(select 1 from public.fields row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
    or exists(select 1 from public.jobs row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
    or exists(select 1 from public.missions row where row.organisation_id=accepted.organisation_id and row.archived_at is null)
), archive_audit_issues as (
  select accepted.organisation_id id
  from accepted_controlled accepted
  where (select count(*) from public.audit_events audit
    where audit.organisation_id=accepted.organisation_id
      and audit.event_type='commercial_onboarding.acceptance_archived'
      and audit.entity_type='organisation' and audit.entity_id=accepted.organisation_id
      and audit.event_payload->>'applicationId'=accepted.application_id::text
      and audit.event_payload->>'invitationId'=accepted.invitation_id::text)<>1
), archive_outbox_issues as (
  select accepted.organisation_id id
  from accepted_controlled accepted
  where (select count(*) from public.transactional_outbox outbox
    where outbox.organisation_id=accepted.organisation_id
      and outbox.topic='commercial_onboarding.acceptance_archived'
      and outbox.aggregate_type='organisation' and outbox.aggregate_id=accepted.organisation_id
      and outbox.payload->>'organisationId'=accepted.organisation_id::text
      and outbox.payload->>'applicationId'=accepted.application_id::text
      and outbox.payload->>'invitationId'=accepted.invitation_id::text)<>1
), checks as (
  select 'current_controlled_chain' check_name, id from current_controlled_chain_issues
  union all select 'application_lifecycle', id from application_lifecycle_issues
  union all select 'invitation_lifecycle', id from invitation_lifecycle_issues
  union all select 'accepted_organisation_link', id from accepted_organisation_link_issues
  union all select 'organisation_reverse_link', id from organisation_reverse_link_issues
  union all select 'archived_identity_chain', id from archived_identity_chain_issues
  union all select 'unexpected_operational_links', id from unexpected_operational_link_issues
  union all select 'archive_audit', id from archive_audit_issues
  union all select 'archive_outbox', id from archive_outbox_issues
), names(check_name) as (values
  ('current_controlled_chain'),('application_lifecycle'),('invitation_lifecycle'),
  ('accepted_organisation_link'),('organisation_reverse_link'),('archived_identity_chain'),
  ('unexpected_operational_links'),('archive_audit'),('archive_outbox')
)
select names.check_name,
  (select count(*) from checks where checks.check_name=names.check_name) failed_count,
  coalesce((select jsonb_agg(sample.id order by sample.id) from (
    select checks.id from checks where checks.check_name=names.check_name order by checks.id limit 10
  ) sample),'[]'::jsonb) sample_ids
from names
order by names.check_name;
