const { supabaseRequest } = require('./supabase');

function failure(result) {
  if (!result || typeof result !== 'object') return null;
  if (result.error) return {
    error: result.error,
    currentVersion: result.current_version,
    currentDigest: result.current_digest,
  };
  if (result.forbidden) return { forbidden: true };
  if (result.location_forbidden) return { locationForbidden: true };
  if (result.readiness_blocked) return { readinessBlocked: true, readiness: result.readiness };
  return null;
}

function packageRevision(result) {
  const failed = failure(result);
  if (failed) return failed;
  const record = result?.record || result;
  return {
    id: record.id,
    missionId: record.mission_id,
    revisionNumber: record.version_number,
    fieldIds: result?.field_ids || record.field_ids,
    jsaRevisionId: record.jsa_revision_id,
    evidenceDigest: record.evidence_digest,
    state: result?.effective_state || record.state || record.package_state,
    createdAt: record.generated_at || record.created_at,
  };
}

function crpDecision(result) {
  const failed = failure(result);
  if (failed) return failed;
  const record = result?.record || result;
  return {
    id: record.id,
    packageRevisionId: record.mission_pack_revision_id || record.package_revision_id,
    decision: record.decision,
    decidedByInternalUserId: record.authorised_by_internal_user_id || record.decided_by_internal_user_id,
    decidedAt: record.authorised_at || record.decided_at,
    declaration: record.declaration,
  };
}

function jsaDayReview(record) {
  if (!record) return null;
  return {
    id: record.id,
    operatingDayId: record.operating_day_id,
    missionId: record.mission_id,
    jsaRevisionId: record.jsa_revision_id,
    outcome: record.outcome,
    notes: record.notes,
    reviewedByInternalUserId: record.reviewed_by_internal_user_id,
    reviewedAt: record.reviewed_at,
  };
}

function fieldActivity(record) {
  return {
    id: record.id,
    operatingDayId: record.operating_day_id,
    missionId: record.mission_id,
    fieldId: record.field_id,
    hectaresAttempted: record.hectares_attempted,
    hectaresCompleted: record.hectares_completed,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    status: record.status,
    notes: record.notes,
    rowVersion: record.row_version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function operatingDay(result) {
  const failed = failure(result);
  if (failed) return failed;
  const record = result?.day || result?.record || result;
  return {
    id: record.id,
    missionId: record.mission_id,
    workDate: record.work_date,
    timezone: record.timezone,
    packageRevisionId: record.package_revision_id,
    jsaRevisionId: record.jsa_revision_id,
    state: record.state,
    actualStartedAt: record.actual_started_at,
    actualFinishedAt: record.actual_finished_at,
    notes: record.notes,
    rowVersion: record.row_version,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    jsaReview: jsaDayReview(record.jsa_review),
    fieldActivities: (record.field_activities || []).map(fieldActivity),
  };
}

function flightActual(record) {
  return {
    id: record.id,
    aircraftDayActualId: record.aircraft_day_actual_id,
    missionId: record.mission_id,
    operatingDayId: record.operating_day_id,
    aircraftId: record.aircraft_id,
    flightIndex: record.flight_index,
    durationHours: record.duration_hours,
    startedAt: record.started_at,
    finishedAt: record.finished_at,
    fieldId: record.field_id,
    sourceImportId: record.source_import_id,
  };
}

function aircraftDayActual(record) {
  return {
    id: record.id,
    missionId: record.mission_id,
    operatingDayId: record.operating_day_id,
    packageRevisionId: record.package_revision_id,
    aircraftId: record.aircraft_id,
    missionAircraftAssignmentId: record.mission_aircraft_assignment_id,
    declaredTotalHours: record.declared_total_hours,
    totalFlightHours: record.total_flight_hours,
    flightsTotalHours: record.flights_total_hours,
    totalSource: record.total_source,
    reconciliationStatus: record.reconciliation_status,
    rowVersion: record.row_version,
    signedOffAt: record.signed_off_at,
    signedOffByInternalUserId: record.signed_off_by_internal_user_id,
    flights: (record.flights || []).map(flightActual),
  };
}

function aircraftDayActuals(result) {
  const failed = failure(result);
  if (failed) return failed;
  return {
    missionId: result.mission_id,
    operatingDayId: result.operating_day_id,
    packageRevisionId: result.package_revision_id,
    dayVersion: result.day_version,
    totalAircraftHours: result.total_aircraft_hours,
    readyForSignOff: result.ready_for_sign_off,
    actuals: (result.actuals || []).map(aircraftDayActual),
  };
}

class MissionOperationsRepository {
  constructor(request = supabaseRequest) { this.request = request; }

  rpc(name, body, publicMessage) {
    return this.request(`rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(body), publicMessage });
  }

  trusted(context) {
    return {
      p_organisation_id: context.organisation.id,
      p_actor_internal_user_id: context.internalUser.id,
    };
  }

  async saveScope(context, { missionId, expectedRevision, fieldIds }) {
    return packageRevision(await this.rpc('ftf_save_mission_package_scope', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_expected_revision: expectedRevision,
      p_field_ids: fieldIds,
    }, 'Mission package scope could not be saved.'));
  }

  async submitForApproval(context, { missionId, packageRevisionId, expectedRevision, evidenceDigest }) {
    return packageRevision(await this.rpc('ftf_submit_mission_package', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_package_revision_id: packageRevisionId,
      p_expected_revision: expectedRevision,
      p_evidence_digest: evidenceDigest,
    }, 'Mission package could not be submitted.'));
  }

  async decide(context, { missionId, packageRevisionId, expectedRevision, evidenceDigest, decision, declaration }) {
    return crpDecision(await this.rpc('ftf_decide_mission_package', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_package_revision_id: packageRevisionId,
      p_expected_revision: expectedRevision,
      p_evidence_digest: evidenceDigest,
      p_decision: decision,
      p_declaration: declaration,
    }, 'Mission package decision could not be recorded.'));
  }

  async readPackageHistory(context, missionId) {
    const result = await this.rpc('ftf_read_mission_package_history', {
      ...this.trusted(context),
      p_mission_id: missionId,
    }, 'Mission package history could not be loaded.');
    const failed = failure(result);
    if (failed) return failed;
    return {
      missionId: result.mission_id,
      currentRevision: result.current_revision,
      packages: (result.packages || []).map((record) => packageRevision(record)),
      decisions: (result.decisions || []).map((record) => crpDecision(record)),
    };
  }

  async createDay(context, { missionId, workDate, notes }) {
    return operatingDay(await this.rpc('ftf_create_mission_operating_day', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_work_date: workDate,
      p_notes: notes,
    }, 'Mission operating day could not be created.'));
  }

  async reviewJsa(context, { missionId, dayId, expectedVersion, outcome, notes }) {
    return operatingDay(await this.rpc('ftf_review_mission_day_jsa', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_operating_day_id: dayId,
      p_expected_version: expectedVersion,
      p_outcome: outcome,
      p_notes: notes,
    }, 'Mission day JSA review could not be recorded.'));
  }

  async startDay(context, { missionId, dayId, expectedVersion, startedAt }) {
    return operatingDay(await this.rpc('ftf_start_mission_operating_day', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_operating_day_id: dayId,
      p_expected_version: expectedVersion,
      p_started_at: startedAt,
    }, 'Mission operating day could not be started.'));
  }

  async saveFieldActivity(context, input) {
    return operatingDay(await this.rpc('ftf_save_mission_day_field_activity', {
      ...this.trusted(context),
      p_mission_id: input.missionId,
      p_operating_day_id: input.dayId,
      p_activity_id: input.activityId,
      p_expected_version: input.expectedVersion,
      p_field_id: input.fieldId,
      p_hectares_attempted: input.hectaresAttempted,
      p_hectares_completed: input.hectaresCompleted,
      p_started_at: input.startedAt,
      p_finished_at: input.finishedAt,
      p_status: input.status,
      p_notes: input.notes,
    }, 'Mission day Field activity could not be saved.'));
  }

  async completeDay(context, { missionId, dayId, expectedVersion, finishedAt, notes }) {
    return operatingDay(await this.rpc('ftf_complete_mission_operating_day', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_operating_day_id: dayId,
      p_expected_version: expectedVersion,
      p_finished_at: finishedAt,
      p_notes: notes,
    }, 'Mission operating day could not be completed.'));
  }

  async readDays(context, missionId) {
    const result = await this.rpc('ftf_read_mission_operating_days', {
      ...this.trusted(context),
      p_mission_id: missionId,
    }, 'Mission operating days could not be loaded.');
    const failed = failure(result);
    if (failed) return failed;
    return {
      missionId: result.mission_id,
      days: (result.days || []).map((record) => operatingDay(record)),
    };
  }

  async saveAircraftActuals(context, input) {
    return aircraftDayActuals(await this.rpc('ftf_save_mission_aircraft_day_actuals', {
      ...this.trusted(context),
      p_mission_id: input.missionId,
      p_operating_day_id: input.dayId,
      p_expected_version: input.expectedVersion,
      p_total_aircraft_hours: input.totalAircraftHours,
      p_aircraft_totals: input.aircraftTotals,
      p_flights: input.flights,
    }, 'Mission aircraft-day actuals could not be saved.'));
  }

  async readAircraftActuals(context, missionId, dayId) {
    return aircraftDayActuals(await this.rpc('ftf_read_mission_aircraft_day_actuals', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_operating_day_id: dayId,
    }, 'Mission aircraft-day actuals could not be loaded.'));
  }

  async reconcileAircraftActuals(context, missionId, dayId) {
    return aircraftDayActuals(await this.rpc('ftf_reconcile_mission_aircraft_day_actuals', {
      ...this.trusted(context),
      p_mission_id: missionId,
      p_operating_day_id: dayId,
    }, 'Mission aircraft-day actuals could not be reconciled.'));
  }
}

module.exports = { MissionOperationsRepository };
