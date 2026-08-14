const EXACT_TARGETS = Object.freeze([
  Object.freeze({ applicationId: '19f7a127-8ab2-4d43-bf14-d23548f58bce', invitationId: '19e16095-016b-4bcf-8ed7-82b0fbddb5f6', organisationId: '0218251e-be2d-4e5c-96ca-29eff71b3a4a' }),
  Object.freeze({ applicationId: '4eb1579f-f7af-42c1-8ddb-6985b01df273', invitationId: '804587be-c32d-45d4-834c-cba4a1c31500', organisationId: '25a9353b-ed90-468b-9ae5-31a55d8f88dc' }),
  Object.freeze({ applicationId: 'f3f1df3d-0879-43a4-93e9-3a9357c5065f', invitationId: '374fe1f5-5812-45b2-9bfa-2d1b3c732cac', organisationId: 'e0f8ba14-ec34-45db-87b4-8429c2ea6288' }),
  Object.freeze({ applicationId: '3d645b15-7a9a-400b-8198-a92a9cb965d3', invitationId: 'ea870bc0-517b-4937-8fb4-b72492a3b0bc', organisationId: 'acfa5923-0edd-46ee-b81b-49d9deedc123' }),
  Object.freeze({ applicationId: '88579100-5424-4069-ae12-1919c99c209c', invitationId: '285e6444-2e59-402f-bbb1-8c57d96075eb', organisationId: '4096dbd0-b538-4e8a-aaaa-76338125908a' }),
]);

const count = async (rest, table, organisationId, extra = '') => (await rest(`${table}?organisation_id=eq.${organisationId}${extra}&select=id`)).length;

async function runDiagnostic({ rest, emit }) {
  for (const target of EXACT_TARGETS) {
    const applicationRows = await rest(`commercial_onboarding_applications?id=eq.${target.applicationId}&select=id,submitted_at,reviewed_at`);
    const invitationRows = await rest(`commercial_onboarding_invitations?id=eq.${target.invitationId}&application_id=eq.${target.applicationId}&resulting_organisation_id=eq.${target.organisationId}&select=id,application_id,created_at,sent_at,accepted_at,resulting_internal_user_id,resulting_membership_id`);
    const organisationRows = await rest(`organisations?id=eq.${target.organisationId}&select=id,created_at,updated_at,archived_at`);
    if (applicationRows.length !== 1 || invitationRows.length !== 1 || organisationRows.length !== 1) throw new Error(`Personnel diagnostic provenance is not exact for ${target.organisationId}.`);
    const application = applicationRows[0];
    const invitation = invitationRows[0];
    const organisation = organisationRows[0];
    const personnelRows = await rest(`personnel?organisation_id=eq.${target.organisationId}&select=id,organisation_id,internal_user_id,membership_id,engagement_status,is_active,archived_at,created_at,updated_at,created_by_internal_user_id,updated_by_internal_user_id&order=created_at.asc,id.asc`);
    emit({ recordType: 'personnel-summary', organisationId: target.organisationId, personnelCount: personnelRows.length });
    for (const person of personnelRows) {
      const auditRows = await rest(`audit_events?organisation_id=eq.${target.organisationId}&entity_type=eq.personnel&entity_id=eq.${person.id}&select=id,event_type,actor_internal_user_id,created_at&order=created_at.asc`);
      const createAudits = auditRows.filter(({ event_type: eventType }) => eventType === 'personnel.create');
      emit({ recordType: 'personnel', organisationId: target.organisationId, personnelId: person.id,
        createdAt: person.created_at, updatedAt: person.updated_at, archivedAt: person.archived_at,
        active: person.is_active === true && person.archived_at === null, engagementStatus: person.engagement_status,
        internalUserId: person.internal_user_id, membershipId: person.membership_id,
        creatorInternalUserId: person.created_by_internal_user_id, updaterInternalUserId: person.updated_by_internal_user_id,
        applicationId: target.applicationId, invitationId: target.invitationId,
        applicationSubmittedAt: application.submitted_at, applicationReviewedAt: application.reviewed_at,
        invitationCreatedAt: invitation.created_at, invitationSentAt: invitation.sent_at,
        invitationAcceptedAt: invitation.accepted_at, organisationCreatedAt: organisation.created_at,
        acceptanceActorMatch: person.created_by_internal_user_id === invitation.resulting_internal_user_id,
        identityLinkMatch: person.internal_user_id === invitation.resulting_internal_user_id && person.membership_id === invitation.resulting_membership_id,
        createAuditCount: createAudits.length,
        createAuditActorMatch: createAudits.length === 1 && createAudits[0].actor_internal_user_id === person.created_by_internal_user_id,
        operatingLocationLinkCount: await count(rest, 'personnel_operating_locations', target.organisationId, `&personnel_id=eq.${person.id}`),
        operationalRoleCount: await count(rest, 'personnel_operational_roles', target.organisationId, `&personnel_id=eq.${person.id}`),
        credentialCount: await count(rest, 'personnel_credentials', target.organisationId, `&personnel_id=eq.${person.id}`),
        evidenceCount: await count(rest, 'personnel_evidence', target.organisationId, `&personnel_id=eq.${person.id}`),
        missionAssignmentCount: await count(rest, 'mission_personnel_assignments', target.organisationId, `&personnel_id=eq.${person.id}`),
      });
    }
  }
}

module.exports = { EXACT_TARGETS, runDiagnostic };
