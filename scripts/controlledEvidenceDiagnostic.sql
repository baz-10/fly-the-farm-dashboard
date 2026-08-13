select jsonb_build_object(
  'archiveAuditCount',(select count(*) from public.audit_events
    where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid
      and event_type='commercial_onboarding.acceptance_archived'),
  'archiveOutboxCount',(select count(*) from public.transactional_outbox
    where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid
      and topic='commercial_onboarding.acceptance_archived'),
  'controlledStoreRecordCount',(select count(*) from public.ftf_store
    where tenant_id='961a4354-40f5-479d-a577-74839596ad14'::uuid),
  'controlledPlatformUserCount',(select count(*) from public.platform_users
    where auth_user_id='ef06368d-6981-4fa6-8317-657bd6418f32'::uuid),
  'controlledPersonnelCount',(select count(*) from public.personnel
    where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid),
  'applicationStatuses',(select array_agg(to_status order by created_at,id)
    from public.commercial_onboarding_application_events
    where application_id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid),
  'invitationStatuses',(select array_agg(to_status order by created_at,id)
    from public.commercial_onboarding_invitation_events
    where invitation_id='29b9b342-335e-4959-9402-4cb4e1090427'::uuid
      and application_id='a865f157-c334-447e-aa1e-661ee0db7b85'::uuid),
  'acceptanceAuditCount',(select count(*) from public.audit_events
    where organisation_id='961a4354-40f5-479d-a577-74839596ad14'::uuid
      and event_type='commercial_onboarding.accepted'
      and entity_id='29b9b342-335e-4959-9402-4cb4e1090427'::uuid),
  'replacementApplicationCount',(select count(*) from public.commercial_onboarding_applications
    where business_name like 'SC ACCEPTANCE — %'
      and id<>'a865f157-c334-447e-aa1e-661ee0db7b85'::uuid),
  'replacementInvitationCount',(select count(*) from public.commercial_onboarding_invitations invitation
    join public.commercial_onboarding_applications application on application.id=invitation.application_id
    where application.business_name like 'SC ACCEPTANCE — %'
      and invitation.id<>'29b9b342-335e-4959-9402-4cb4e1090427'::uuid),
  'replacementOrganisationCount',(select count(*) from public.organisations
    where name like 'SC ACCEPTANCE — %'
      and id<>'961a4354-40f5-479d-a577-74839596ad14'::uuid)
)::text;
