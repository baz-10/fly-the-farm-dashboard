import type { SafetyPlanField, SafetyPlanSection, SafetyPlanTemplate } from '../types/safetyPlan';

export const SAFETY_PLAN_NOTICE =
  'CASA/ReOC aligned. This plan is not CASA approved and does not replace the operator’s approved manuals, authorisations, legal obligations or professional judgement.';

function field(
  id: string,
  label: string,
  helpText: string,
  type: SafetyPlanField['type'],
  required: boolean
): SafetyPlanField {
  return { id, label, helpText, type, required, companyEditable: true };
}

function section(
  id: string,
  title: string,
  helpText: string,
  required: boolean,
  fields: SafetyPlanField[]
): SafetyPlanSection {
  return { id, title, helpText, required, companyEditable: true, fields };
}

function freezeTemplate(template: SafetyPlanTemplate): SafetyPlanTemplate {
  for (const planSection of template.sections) {
    Object.freeze(planSection.fields);
    for (const planField of planSection.fields) Object.freeze(planField);
    Object.freeze(planSection);
  }
  Object.freeze(template.sections);
  return Object.freeze(template);
}

export const AU_REOC_SAFETY_PLAN_STANDARD = freezeTemplate({
  id: 'au-reoc-safety-plan',
  name: 'Australian CASA/ReOC-aligned Safety Plan',
  version: 'AU-REOC-1.0',
  jurisdiction: 'AU',
  notice: SAFETY_PLAN_NOTICE,
  isPlatformStandard: true,
  sections: [
    section('plan_identity_scope_version', 'Plan identity, scope and controlled version', 'Record the controlled plan reference, scope and version.', true, [
      field('plan_reference', 'Plan reference', 'Unique controlled reference for this plan.', 'text', true),
      field('plan_scope', 'Scope', 'Describe the work and operational scope covered by this plan.', 'textarea', true),
      field('controlled_version', 'Controlled version', 'Record the human-readable controlled version.', 'text', true),
    ]),
    section('company_responsibilities_operational_authority', 'Company responsibilities and nominated operational authority', 'Identify company responsibilities and the authority accountable for operational decisions.', true, [
      field('company_responsibilities', 'Company responsibilities', 'State the company responsibilities relevant to this job.', 'textarea', true),
      field('operational_authority', 'Nominated operational authority', 'Identify the nominated operational authority.', 'person_list', true),
    ]),
    section('job_client_property_location_operating_dates', 'Job, client, property, location and operating dates', 'Capture the job and operating-location details used for this snapshot.', true, [
      field('job_details', 'Job details', 'Record the job name or reference.', 'text', true),
      field('client_property_location', 'Client, property and location', 'Identify the client, property and operating location.', 'textarea', true),
      field('operating_dates', 'Operating dates', 'Record the planned operating dates.', 'date_range', true),
    ]),
    section('crew_roles_acknowledgements', 'Crew, roles and acknowledgements', 'List assigned crew, their roles and acknowledgement status.', true, [
      field('assigned_crew', 'Assigned crew and roles', 'Identify the PIC, crew and their assigned roles.', 'person_list', true),
      field('crew_acknowledgement_notes', 'Acknowledgement notes', 'Record any relevant crew acknowledgement notes.', 'textarea', false),
    ]),
    section('aircraft_vehicles_trailers_equipment', 'Aircraft, vehicles, trailers, equipment kits and support equipment', 'List the aircraft and supporting assets planned for the job.', true, [
      field('operational_assets', 'Operational assets', 'Identify aircraft, vehicles, trailers, kits and support equipment.', 'asset_list', true),
    ]),
    section('chemicals_payloads_sds_hazardous_substances', 'Chemicals, payloads, SDS references and hazardous substances', 'Record payloads, hazardous substances and SDS references.', true, [
      field('chemicals_payloads', 'Chemicals and payloads', 'List chemicals, payloads and relevant quantities.', 'textarea', true),
      field('sds_references', 'SDS references', 'Attach or reference current safety data sheets.', 'attachment_list', true),
    ]),
    section('site_access_public_protection_signage_exclusion', 'Site access, public protection, signage and exclusion areas', 'Set the access, public-protection and exclusion-area controls.', true, [
      field('site_access_controls', 'Site access controls', 'Describe access arrangements and visitor controls.', 'textarea', true),
      field('public_protection_exclusion_areas', 'Public protection and exclusion areas', 'Describe signage, public protection and exclusion areas.', 'textarea', true),
    ]),
    section('airspace_weather_operational_constraints', 'Airspace, weather and operational constraints', 'Record operational airspace, weather and other constraints.', true, [
      field('airspace_constraints', 'Airspace constraints', 'Document airspace, approvals and operational limitations.', 'textarea', true),
      field('weather_constraints', 'Weather constraints', 'Record weather limits and monitoring requirements.', 'textarea', true),
    ]),
    section('consolidated_jsa_hazards_controls', 'Consolidated JSA hazards, risk scores, mitigations and controls', 'Consolidate imported and company-authored hazards and controls.', true, [
      field('hazards_and_risk_scores', 'Hazards and risk scores', 'List the consolidated JSA hazards and risk scores.', 'textarea', true),
      field('mitigations_and_controls', 'Mitigations and controls', 'Record the controls and residual-risk measures.', 'textarea', true),
    ]),
    section('communications_command_lost_contact', 'Communications, command structure and lost-contact procedures', 'Define communications, command and lost-contact arrangements.', true, [
      field('communications_plan', 'Communications plan', 'Record communication methods, call signs and escalation paths.', 'textarea', true),
      field('lost_contact_procedures', 'Lost-contact procedures', 'Record procedures for loss of contact or communications.', 'textarea', true),
    ]),
    section('emergency_incident_fire_response', 'Emergency response, incident and fire procedures', 'Set emergency, incident and fire response procedures.', true, [
      field('emergency_response', 'Emergency response', 'Describe emergency response and escalation procedures.', 'textarea', true),
      field('incident_and_fire_procedures', 'Incident and fire procedures', 'Describe incident reporting and fire procedures.', 'textarea', true),
    ]),
    section('first_aid_spill_environmental_protection', 'First aid, spill response and environmental protection', 'Record first-aid, spill-response and environmental controls.', true, [
      field('first_aid_arrangements', 'First aid arrangements', 'Record first-aid resources and contacts.', 'textarea', true),
      field('spill_environmental_controls', 'Spill response and environmental protection', 'Record spill response and environmental protection controls.', 'textarea', true),
    ]),
    section('attachments_supporting_evidence', 'Attachments and supporting evidence', 'List supporting evidence retained with this version.', false, [
      field('supporting_evidence', 'Supporting evidence', 'Attach or reference maps, approvals, SDS and other evidence.', 'attachment_list', false),
    ]),
    section('submission_approval_revision_acknowledgements', 'Submission, approval, revision history and acknowledgements', 'Record submission, approval, revision and acknowledgement details.', true, [
      field('submission_review', 'Submission and review', 'Record the submission and review outcome.', 'textarea', true),
      field('revision_history', 'Revision history', 'Record controlled revision history.', 'textarea', true),
    ]),
  ],
});
