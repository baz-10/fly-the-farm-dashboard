const { supabaseRequest } = require('./supabase');

function rpc(name, body, publicMessage) {
  return supabaseRequest(`rest/v1/rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(body),
    publicMessage,
  });
}

class TechnicalCatalogueRepository {
  readAssetCatalogue(context, assetId, asOf) {
    return rpc('ftf_read_asset_technical_catalogue', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_maintainable_asset_id: assetId,
      p_as_of: asOf,
    }, 'Technical catalogue could not be loaded.');
  }

  resolveAssetRoute(context, source, sourceRecordId) {
    return rpc('ftf_resolve_maintainable_asset_route', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_source: source,
      p_source_record_id: sourceRecordId,
    }, 'Asset route could not be resolved.');
  }

  readPreferences(context) {
    return rpc('ftf_read_organisation_technical_preferences', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
    }, 'Technical preferences could not be loaded.');
  }

  readApplicableServiceTemplateVersion(context, assetId, serviceTemplateVersionId, asOf) {
    return rpc('ftf_read_applicable_service_template_version', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_maintainable_asset_id: assetId,
      p_service_template_version_id: serviceTemplateVersionId,
      p_as_of: asOf,
    }, 'Service Template version could not be loaded.');
  }

  createOrganisationProposal(context, proposalType, proposedData, evidence, proposedByType) {
    return rpc('ftf_create_organisation_technical_proposal', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_proposal_type: proposalType,
      p_proposed_data: proposedData,
      p_evidence: evidence,
      p_proposed_by_type: proposedByType,
    }, 'Technical proposal could not be created.');
  }

  reviewOrganisationProposal(context, proposalId, expectedVersion, decision, reviewEvidence, reviewNotes) {
    return rpc('ftf_review_organisation_technical_proposal', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_proposal_id: proposalId,
      p_expected_version: expectedVersion,
      p_decision: decision,
      p_review_evidence: reviewEvidence,
      p_review_notes: reviewNotes,
    }, 'Technical proposal could not be reviewed.');
  }

  createPlatformProposal(context, proposalType, proposedData, evidence, proposedByType) {
    return rpc('ftf_create_platform_technical_proposal', {
      p_platform_user_id: context.platformUser.id,
      p_proposal_type: proposalType,
      p_proposed_data: proposedData,
      p_evidence: evidence,
      p_proposed_by_type: proposedByType,
    }, 'Platform technical proposal could not be created.');
  }

  reviewPlatformProposal(context, proposalId, expectedVersion, decision, reviewEvidence, reviewNotes) {
    return rpc('ftf_review_platform_technical_proposal', {
      p_platform_user_id: context.platformUser.id,
      p_proposal_id: proposalId,
      p_expected_version: expectedVersion,
      p_decision: decision,
      p_review_evidence: reviewEvidence,
      p_review_notes: reviewNotes,
    }, 'Platform technical proposal could not be reviewed.');
  }

  writePreference(context, preferenceType, preferenceId, expectedVersion, data) {
    return rpc('ftf_write_organisation_technical_preference', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_preference_type: preferenceType,
      p_preference_id: preferenceId,
      p_expected_version: expectedVersion,
      p_data: data,
    }, 'Technical preference could not be saved.');
  }

  publishOrganisationServiceTemplate(context, serviceTemplateVersionId, expectedVersion, effectiveFrom) {
    return rpc('ftf_publish_service_template_version', {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
      p_service_template_version_id: serviceTemplateVersionId,
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom,
    }, 'Service Template could not be published.');
  }

  publishTechnicalVersion(context, entityType, entityId, expectedVersion, effectiveFrom) {
    return rpc('ftf_publish_technical_version', {
      p_platform_user_id: context.platformUser.id,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom,
    }, 'Technical version could not be published.');
  }

  publishPartEquivalence(context, equivalenceId, expectedVersion, effectiveFrom) {
    return rpc('ftf_publish_part_equivalence', {
      p_platform_user_id: context.platformUser.id,
      p_equivalence_id: equivalenceId,
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom,
    }, 'Part equivalence could not be published.');
  }

  publishTechnicalApplicability(context, applicabilityType, applicabilityId, expectedVersion, effectiveFrom) {
    return rpc('ftf_publish_technical_applicability', {
      p_platform_user_id: context.platformUser.id,
      p_applicability_type: applicabilityType,
      p_applicability_id: applicabilityId,
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom,
    }, 'Technical applicability could not be published.');
  }

  publishPlatformServiceTemplate(context, serviceTemplateVersionId, expectedVersion, effectiveFrom) {
    return rpc('ftf_publish_platform_service_template_version', {
      p_platform_user_id: context.platformUser.id,
      p_service_template_version_id: serviceTemplateVersionId,
      p_expected_version: expectedVersion,
      p_effective_from: effectiveFrom,
    }, 'Platform Service Template could not be published.');
  }
}

module.exports = { TechnicalCatalogueRepository };
