with controlled_applications as (
  select application.*
  from public.commercial_onboarding_applications application
  where application.business_name like 'SC ACCEPTANCE — %'
), controlled_invitations as (
  select invitation.*
  from public.commercial_onboarding_invitations invitation
  join controlled_applications application on application.id=invitation.application_id
), controlled_organisations as (
  select organisation.*
  from public.organisations organisation
  where organisation.name like 'SC ACCEPTANCE — %'
), application_inventory as (
  select jsonb_build_object(
    'applicationId',application.id,
    'applicationReference',application.application_reference,
    'businessName',application.business_name,
    'submittedAt',application.submitted_at,
    'updatedAt',application.updated_at,
    'reviewedAt',application.reviewed_at,
    'status',application.status,
    'rowVersion',application.row_version,
    'reviewerPlatformUserId',application.reviewed_by_platform_user_id,
    'submittedPayloadKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(application.submitted_payload) key),
    'approvedOrganisationSnapshotKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(coalesce(application.approved_organisation_snapshot,'{}'::jsonb)) key),
    'approvedBaseSnapshotKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(coalesce(application.approved_base_snapshot,'{}'::jsonb)) key),
    'events',(select coalesce(jsonb_agg(jsonb_build_object(
      'eventId',event.id,'eventType',event.event_type,'fromStatus',event.from_status,
      'toStatus',event.to_status,'createdAt',event.created_at,
      'payloadKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(event.event_payload) key)
    ) order by event.created_at,event.id),'[]'::jsonb)
      from public.commercial_onboarding_application_events event where event.application_id=application.id),
    'invitations',(select coalesce(jsonb_agg(invitation.id order by invitation.created_at,invitation.id),'[]'::jsonb)
      from controlled_invitations invitation where invitation.application_id=application.id)
  ) record
  from controlled_applications application
), invitation_inventory as (
  select jsonb_build_object(
    'invitationId',invitation.id,
    'applicationId',invitation.application_id,
    'createdAt',invitation.created_at,
    'updatedAt',invitation.updated_at,
    'sentAt',invitation.sent_at,
    'expiresAt',invitation.expires_at,
    'revokedAt',invitation.revoked_at,
    'acceptedAt',invitation.accepted_at,
    'status',invitation.status,
    'rowVersion',invitation.row_version,
    'acceptedByAuthUserId',invitation.accepted_by_auth_user_id,
    'resultingOrganisationId',invitation.resulting_organisation_id,
    'resultingOrganisationReference',invitation.resulting_organisation_reference,
    'resultingInternalUserId',invitation.resulting_internal_user_id,
    'resultingMembershipId',invitation.resulting_membership_id,
    'resultingOperatingLocationId',invitation.resulting_operating_location_id,
    'events',(select coalesce(jsonb_agg(jsonb_build_object(
      'eventId',event.id,'eventType',event.event_type,'fromStatus',event.from_status,
      'toStatus',event.to_status,'createdAt',event.created_at,
      'payloadKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(event.event_payload) key)
    ) order by event.created_at,event.id),'[]'::jsonb)
      from public.commercial_onboarding_invitation_events event where event.invitation_id=invitation.id),
    'auditEvents',(select coalesce(jsonb_agg(jsonb_build_object(
      'auditId',audit.id,'eventType',audit.event_type,'entityType',audit.entity_type,'createdAt',audit.created_at,
      'payloadKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(audit.event_payload) key)
    ) order by audit.created_at,audit.id),'[]'::jsonb)
      from public.audit_events audit where audit.entity_id=invitation.id)
  ) record
  from controlled_invitations invitation
), organisation_inventory as (
  select jsonb_build_object(
    'organisationId',organisation.id,
    'name',organisation.name,
    'createdAt',organisation.created_at,
    'updatedAt',organisation.updated_at,
    'archivedAt',organisation.archived_at,
    'rowVersion',organisation.row_version,
    'linkedInvitationIds',(select coalesce(jsonb_agg(invitation.id order by invitation.created_at,invitation.id),'[]'::jsonb)
      from controlled_invitations invitation where invitation.resulting_organisation_id=organisation.id),
    'internalUsers',(select coalesce(jsonb_agg(jsonb_build_object(
      'internalUserId',internal_user.id,'authUserId',internal_user.auth_user_id,'isActive',internal_user.is_active,
      'archivedAt',internal_user.archived_at,'createdAt',internal_user.created_at
    ) order by internal_user.created_at,internal_user.id),'[]'::jsonb)
      from public.internal_users internal_user where internal_user.organisation_id=organisation.id),
    'memberships',(select coalesce(jsonb_agg(jsonb_build_object(
      'membershipId',membership.id,'internalUserId',membership.internal_user_id,'isActive',membership.is_active,
      'archivedAt',membership.archived_at,'createdAt',membership.created_at
    ) order by membership.created_at,membership.id),'[]'::jsonb)
      from public.memberships membership where membership.organisation_id=organisation.id),
    'operatingLocations',(select coalesce(jsonb_agg(jsonb_build_object(
      'operatingLocationId',location.id,'archivedAt',location.archived_at,'createdAt',location.created_at
    ) order by location.created_at,location.id),'[]'::jsonb)
      from public.operating_locations location where location.organisation_id=organisation.id),
    'seatAllocations',(select coalesce(jsonb_agg(jsonb_build_object(
      'seatAllocationId',allocation.id,'allocatedSeats',allocation.allocated_seats,
      'allocationSource',allocation.allocation_source,'archivedAt',allocation.archived_at,'createdAt',allocation.created_at
    ) order by allocation.created_at,allocation.id),'[]'::jsonb)
      from public.organisation_seat_allocations allocation where allocation.organisation_id=organisation.id),
    'seatAssignments',(select coalesce(jsonb_agg(jsonb_build_object(
      'seatAssignmentId',assignment.id,'internalUserId',assignment.internal_user_id,'membershipId',assignment.membership_id,
      'status',assignment.status,'assignmentSource',assignment.assignment_source,
      'archivedAt',assignment.archived_at,'createdAt',assignment.created_at
    ) order by assignment.created_at,assignment.id),'[]'::jsonb)
      from public.internal_user_seat_assignments assignment where assignment.organisation_id=organisation.id),
    'locationAssignments',(select coalesce(jsonb_agg(jsonb_build_object(
      'locationAssignmentId',assignment.id,'membershipId',assignment.membership_id,
      'operatingLocationId',assignment.operating_location_id,'isActive',assignment.is_active,
      'assignmentSource',assignment.assignment_source,'archivedAt',assignment.archived_at,'createdAt',assignment.created_at
    ) order by assignment.created_at,assignment.id),'[]'::jsonb)
      from public.membership_operating_location_assignments assignment where assignment.organisation_id=organisation.id),
    'auditEvents',(select coalesce(jsonb_agg(jsonb_build_object(
      'auditId',audit.id,'eventType',audit.event_type,'entityType',audit.entity_type,
      'entityId',audit.entity_id,'createdAt',audit.created_at,
      'payloadKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(audit.event_payload) key)
    ) order by audit.created_at,audit.id),'[]'::jsonb)
      from public.audit_events audit where audit.organisation_id=organisation.id),
    'outboxEvents',(select coalesce(jsonb_agg(jsonb_build_object(
      'outboxId',outbox.id,'topic',outbox.topic,'aggregateType',outbox.aggregate_type,
      'aggregateId',outbox.aggregate_id,'createdAt',outbox.created_at,'processedAt',outbox.processed_at,
      'payloadKeys',(select coalesce(jsonb_agg(key order by key),'[]'::jsonb) from jsonb_object_keys(outbox.payload) key)
    ) order by outbox.created_at,outbox.id),'[]'::jsonb)
      from public.transactional_outbox outbox where outbox.organisation_id=organisation.id),
    'operationalCounts',jsonb_build_object(
      'clients',(select count(*) from public.clients where organisation_id=organisation.id),
      'properties',(select count(*) from public.properties where organisation_id=organisation.id),
      'fields',(select count(*) from public.fields where organisation_id=organisation.id),
      'jobs',(select count(*) from public.jobs where organisation_id=organisation.id),
      'missions',(select count(*) from public.missions where organisation_id=organisation.id),
      'personnel',(select count(*) from public.personnel where organisation_id=organisation.id),
      'ftfStore',(select count(*) from public.ftf_store where tenant_id=organisation.id)
    )
  ) record
  from controlled_organisations organisation
)
select jsonb_build_object(
  'diagnostic','SC_ACCEPTANCE_INVENTORY_V1',
  'readOnly',true,
  'applicationCount',(select count(*) from controlled_applications),
  'invitationCount',(select count(*) from controlled_invitations),
  'organisationCount',(select count(*) from controlled_organisations),
  'applications',(select coalesce(jsonb_agg(record order by record->>'submittedAt',record->>'applicationId'),'[]'::jsonb) from application_inventory),
  'invitations',(select coalesce(jsonb_agg(record order by record->>'createdAt',record->>'invitationId'),'[]'::jsonb) from invitation_inventory),
  'organisations',(select coalesce(jsonb_agg(record order by record->>'createdAt',record->>'organisationId'),'[]'::jsonb) from organisation_inventory)
)::text;
