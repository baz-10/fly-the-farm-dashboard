const { MissionOperationsRepository } = require('./mission-operations-repository');
const { resolveOperationalActorContext } = require('./operational-actor-context');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const ACTIONS = Object.freeze({
  scope: { method: 'POST', permission: 'mission.pack.generate' },
  submit: { method: 'POST', permission: 'mission.pack.generate' },
  authorise: { method: 'POST', permission: 'mission.authorisation.authorise' },
  reject: { method: 'POST', permission: 'mission.authorisation.authorise' },
  history: { method: 'GET', permissionsAny: ['mission.pack.read', 'mission.authorisation.read'] },
  'day-create': { method: 'POST', permission: 'mission.operational.write' },
  'day-jsa-review': { method: 'POST', permission: 'mission.operational.write' },
  'day-start': { method: 'POST', permission: 'mission.operational.write' },
  'field-activity-save': { method: 'POST', permission: 'mission.operational.write' },
  'day-complete': { method: 'POST', permission: 'mission.operational.write' },
  days: { method: 'GET', permission: 'mission.operational.read' },
  'aircraft-actuals-save': { method: 'POST', permission: 'mission.operational.write' },
  'aircraft-actuals-reconcile': { method: 'POST', permission: 'mission.operational.write' },
  'aircraft-actuals': { method: 'GET', permission: 'mission.operational.read' },
});

function fail(statusCode, code, message) {
  throw Object.assign(new Error(message), { statusCode, code, publicMessage: message });
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Mission Operations input is invalid.');
  const actual = Object.keys(value);
  if (actual.length !== keys.length || keys.some((key) => !(key in value)) || actual.some((key) => !keys.includes(key))) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Mission Operations input is invalid.');
  }
  return value;
}

function uuid(value, name) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', `${name} is invalid.`);
  return value;
}

function revision(value) {
  if (!Number.isInteger(value) || value < 0) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Expected revision is invalid.');
  return value;
}

function optionalUuid(value, name) {
  return value === null ? null : uuid(value, name);
}

function canonicalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Operating date is invalid.');
  }
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthLengths[month - 1]) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Operating date is invalid.');
  }
  return value;
}

function timestamp(value, name) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', `${name} is invalid.`);
  }
  canonicalDate(value.slice(0, 10));
  return value;
}

function optionalTimestamp(value, name) {
  return value === null ? null : timestamp(value, name);
}

function optionalNotes(value) {
  const hasControlCharacter = typeof value === 'string'
    && value.split('').some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (value !== null && (typeof value !== 'string' || value.length < 1 || value.length > 4000 || value.trim() !== value || hasControlCharacter)) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Notes are invalid.');
  }
  return value;
}

function decimalHectares(value) {
  if (value !== null && (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,11})\.\d{6}$/.test(value))) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Hectares are invalid.');
  }
  return value;
}

function decimalHours(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,5})\.\d{4}$/.test(value)) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Aircraft hours are invalid.');
  }
  return value;
}

function aircraftTotals(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Aircraft totals are invalid.');
  }
  const totals = value.map((candidate) => {
    const item = exactObject(candidate, ['aircraftId', 'totalFlightHours']);
    return { aircraftId: uuid(item.aircraftId, 'Aircraft'), totalFlightHours: decimalHours(item.totalFlightHours, true) };
  });
  if (new Set(totals.map((item) => item.aircraftId.toLowerCase())).size !== totals.length) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Aircraft totals contain duplicates.');
  }
  return totals;
}

function flightActuals(value, totals) {
  if (!Array.isArray(value) || value.length > 500) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Flight actuals are invalid.');
  const aircraft = new Set(totals.map((item) => item.aircraftId.toLowerCase()));
  return value.map((candidate) => {
    const item = exactObject(candidate, ['aircraftId', 'durationHours', 'startedAt', 'finishedAt', 'fieldId', 'sourceImportId']);
    const aircraftId = uuid(item.aircraftId, 'Aircraft');
    if (!aircraft.has(aircraftId.toLowerCase())) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Flight Aircraft is not included in daily totals.');
    const startedAt = optionalTimestamp(item.startedAt, 'Flight start timestamp');
    const finishedAt = optionalTimestamp(item.finishedAt, 'Flight finish timestamp');
    if (finishedAt !== null && (startedAt === null || Date.parse(finishedAt) < Date.parse(startedAt))) {
      fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Flight timestamps are invalid.');
    }
    return {
      aircraftId,
      durationHours: decimalHours(item.durationHours),
      startedAt,
      finishedAt,
      fieldId: optionalUuid(item.fieldId, 'Field'),
      sourceImportId: optionalUuid(item.sourceImportId, 'Operational import'),
    };
  });
}

function reviewOutcome(value) {
  if (!['CONDITIONS_COVERED', 'CHANGE_DECLARED'].includes(value)) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'JSA review outcome is invalid.');
  }
  return value;
}

function activityStatus(value) {
  if (!['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'NOT_WORKED'].includes(value)) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Field activity status is invalid.');
  }
  return value;
}

function fieldIds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Mission Field scope is invalid.');
  const ids = value.map((id) => uuid(id, 'Field'));
  if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Mission Field scope contains duplicates.');
  return ids;
}

function digest(value) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Evidence digest is invalid.');
  return value;
}

function declaration(value) {
  const hasControlCharacter = typeof value === 'string'
    && value.split('').some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 2000 || hasControlCharacter) {
    fail(400, 'MISSION_OPERATIONS_REQUEST_INVALID', 'Decision declaration is invalid.');
  }
  return value.trim();
}

function permitted(context, definition) {
  const permissions = context.permissions || [];
  if (permissions.includes('*')) return true;
  return definition.permissionsAny
    ? definition.permissionsAny.some((permission) => permissions.includes(permission))
    : permissions.includes(definition.permission);
}

function sameOrigin(req) {
  const origin = req.headers?.origin;
  const protocol = req.headers?.['x-forwarded-proto'] || 'https';
  const host = req.headers?.host;
  if (!origin || origin !== `${protocol}://${host}`) fail(403, 'SAME_ORIGIN_REQUIRED', 'Same-origin requests are required.');
}

function errorResponse(req, status, code, message, result = {}) {
  const error = { code, message, correlationId: req.correlationId };
  if (Number.isInteger(result.currentVersion)) error.currentVersion = result.currentVersion;
  if (typeof result.currentDigest === 'string') error.currentDigest = result.currentDigest;
  return { status, error };
}

function checkedFailure(req, result) {
  if (!result || typeof result !== 'object') return null;
  if (result.forbidden || result.locationForbidden) return errorResponse(req, 403, 'FORBIDDEN', 'You do not have permission to use Mission Operations.');
  if (result.readinessBlocked) return errorResponse(req, 409, 'READINESS_BLOCKED', 'Mission readiness must pass before this package can be authorised.', result);
  const code = result.error;
  if (!code) return null;
  if (code === 'MISSION_PACKAGE_NOT_FOUND') return errorResponse(req, 404, 'NOT_FOUND', 'Mission package was not found.');
  if (['MISSION_OPERATING_DAY_NOT_FOUND', 'MISSION_FIELD_ACTIVITY_NOT_FOUND'].includes(code)) {
    return errorResponse(req, 404, 'NOT_FOUND', 'Mission operating-day record was not found.');
  }
  if (code === 'MISSION_CRP_INELIGIBLE') return errorResponse(req, 403, 'CRP_INELIGIBLE', 'The signed-in user is not an eligible CRP for this Mission Base.');
  if (['MISSION_PACKAGE_VERSION_CONFLICT', 'MISSION_PACKAGE_EVIDENCE_STALE', 'MISSION_PACKAGE_DECISION_CONFLICT'].includes(code)) {
    const message = code === 'MISSION_PACKAGE_EVIDENCE_STALE'
      ? 'Mission package evidence changed. Reload before continuing.'
      : code === 'MISSION_PACKAGE_DECISION_CONFLICT'
        ? 'A CRP decision already exists for this package revision.'
        : 'Mission package revision changed in another session.';
    return errorResponse(req, 409, code, message, result);
  }
  if (['MISSION_NOT_AUTHORISED', 'JSA_DAY_REVIEW_REQUIRED', 'MISSION_PACKAGE_STALE',
    'MISSION_OPERATING_DAY_VERSION_CONFLICT', 'MISSION_OPERATING_DATE_CONFLICT',
    'MISSION_OPERATING_DAY_STATE_INVALID', 'MISSION_OPERATING_DAY_SIGNED_OFF',
    'MISSION_FIELD_ACTIVITY_VERSION_CONFLICT', 'MISSION_FIELD_ACTIVITY_CONFLICT',
    'JSA_DAY_REVIEW_CONFLICT', 'MISSION_DAY_FIELD_ACTIVITY_REQUIRED',
    'MISSION_AIRCRAFT_DAY_REQUIRED', 'MISSION_OPERATING_DAY_NOT_SIGNED_OFF',
    'AIRCRAFT_FLIGHT_HOURS_METER_REQUIRED', 'AIRCRAFT_FLIGHT_TOTAL_MISMATCH',
    'AIRCRAFT_DAY_TOTAL_MISMATCH'].includes(code)) {
    const messages = {
      MISSION_NOT_AUTHORISED: 'The Mission requires current CRP authority.',
      JSA_DAY_REVIEW_REQUIRED: 'Review the effective Mission JSA before starting this operating day.',
      MISSION_PACKAGE_STALE: 'The operating day is not bound to the current approved Mission package.',
      MISSION_OPERATING_DATE_CONFLICT: 'An operating day already exists for this Base-local date.',
    };
    return errorResponse(req, 409, code, messages[code] || 'The Mission operating day changed in another session.', result);
  }
  if (['MISSION_DAY_FIELD_NOT_AUTHORISED', 'MISSION_OPERATING_DAY_INPUT_INVALID',
    'MISSION_DAY_JSA_REVIEW_INVALID', 'MISSION_OPERATING_TIME_INVALID',
    'MISSION_FIELD_ACTIVITY_INPUT_INVALID', 'MISSION_DAY_AIRCRAFT_NOT_AUTHORISED',
    'MISSION_AIRCRAFT_DAY_INPUT_INVALID', 'MISSION_FLIGHT_FIELD_NOT_AUTHORISED',
    'MISSION_FLIGHT_IMPORT_NOT_FOUND'].includes(code)) {
    return errorResponse(req, 400, code, 'Mission operating-day input is invalid.');
  }
  if (['MISSION_SCOPE_EMPTY', 'MISSION_SCOPE_FIELD_INVALID', 'MISSION_SCOPE_FIELD_DUPLICATE', 'MISSION_SCOPE_FIELD_NOT_IN_JOB', 'MISSION_PACKAGE_JSA_REQUIRED', 'MISSION_PACKAGE_DECISION_INVALID', 'MISSION_PACKAGE_DECLARATION_INVALID'].includes(code)) {
    return errorResponse(req, 400, code, 'Mission package input is invalid.');
  }
  return errorResponse(req, 500, 'MISSION_OPERATIONS_UNAVAILABLE', 'Mission Operations are temporarily unavailable.');
}

function safeError(req, error) {
  if (['MISSION_OPERATIONS_REQUEST_INVALID', 'SAME_ORIGIN_REQUIRED', 'UNSUPPORTED_ACTION', 'METHOD_NOT_ALLOWED'].includes(error?.code)) {
    return errorResponse(req, error.statusCode, error.code, error.publicMessage);
  }
  if (error?.statusCode === 401) return errorResponse(req, 401, 'UNAUTHENTICATED', 'Authentication is required.');
  if (error?.statusCode === 403) return errorResponse(req, 403, 'FORBIDDEN', 'You do not have permission to use Mission Operations.');
  const status = Number.isInteger(error?.statusCode) && error.statusCode >= 500 && error.statusCode <= 599 ? error.statusCode : 500;
  return errorResponse(req, status, 'MISSION_OPERATIONS_UNAVAILABLE', 'Mission Operations are temporarily unavailable.');
}

function createMissionOperationsHandler(dependencies = {}) {
  const repository = dependencies.repository || new MissionOperationsRepository();
  const resolveContext = dependencies.resolveContext || resolveOperationalActorContext;
  return async function missionOperationsHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const action = typeof req.query?.action === 'string' ? req.query.action : '';
      const definition = ACTIONS[action];
      if (!definition) fail(400, 'UNSUPPORTED_ACTION', 'Unsupported Mission Operations action.');
      if (req.method !== definition.method) fail(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      const context = await resolveContext(req, res);
      if (!context?.organisation?.id || !context?.internalUser?.id || !permitted(context, definition)) {
        fail(403, 'FORBIDDEN', 'You do not have permission to use Mission Operations.');
      }
      if (req.method === 'POST') sameOrigin(req);
      let result;
      let status = 200;
      if (action === 'history') {
        result = await repository.readPackageHistory(context, uuid(req.query?.missionId, 'Mission'));
      } else if (action === 'days') {
        result = await repository.readDays(context, uuid(req.query?.missionId, 'Mission'));
      } else if (action === 'aircraft-actuals') {
        result = await repository.readAircraftActuals(
          context,
          uuid(req.query?.missionId, 'Mission'),
          uuid(req.query?.dayId, 'Operating day'),
        );
      } else if (action === 'scope') {
        const body = exactObject(req.body, ['missionId', 'expectedRevision', 'fieldIds']);
        result = await repository.saveScope(context, {
          missionId: uuid(body.missionId, 'Mission'),
          expectedRevision: revision(body.expectedRevision),
          fieldIds: fieldIds(body.fieldIds),
        });
        status = 201;
      } else if (action === 'submit') {
        const body = exactObject(req.body, ['missionId', 'packageRevisionId', 'expectedRevision', 'evidenceDigest']);
        result = await repository.submitForApproval(context, {
          missionId: uuid(body.missionId, 'Mission'),
          packageRevisionId: uuid(body.packageRevisionId, 'Package revision'),
          expectedRevision: revision(body.expectedRevision),
          evidenceDigest: digest(body.evidenceDigest),
        });
        status = 201;
      } else if (action === 'authorise' || action === 'reject') {
        const body = exactObject(req.body, ['missionId', 'packageRevisionId', 'expectedRevision', 'evidenceDigest', 'declaration']);
        result = await repository.decide(context, {
          missionId: uuid(body.missionId, 'Mission'),
          packageRevisionId: uuid(body.packageRevisionId, 'Package revision'),
          expectedRevision: revision(body.expectedRevision),
          evidenceDigest: digest(body.evidenceDigest),
          decision: action === 'authorise' ? 'AUTHORISED' : 'REJECTED',
          declaration: declaration(body.declaration),
        });
        status = 201;
      } else if (action === 'day-create') {
        const body = exactObject(req.body, ['missionId', 'workDate', 'notes']);
        result = await repository.createDay(context, {
          missionId: uuid(body.missionId, 'Mission'),
          workDate: canonicalDate(body.workDate),
          notes: optionalNotes(body.notes),
        });
      } else if (action === 'day-jsa-review') {
        const body = exactObject(req.body, ['missionId', 'dayId', 'expectedVersion', 'outcome', 'notes']);
        result = await repository.reviewJsa(context, {
          missionId: uuid(body.missionId, 'Mission'),
          dayId: uuid(body.dayId, 'Operating day'),
          expectedVersion: revision(body.expectedVersion),
          outcome: reviewOutcome(body.outcome),
          notes: optionalNotes(body.notes),
        });
      } else if (action === 'day-start') {
        const body = exactObject(req.body, ['missionId', 'dayId', 'expectedVersion', 'startedAt']);
        result = await repository.startDay(context, {
          missionId: uuid(body.missionId, 'Mission'),
          dayId: uuid(body.dayId, 'Operating day'),
          expectedVersion: revision(body.expectedVersion),
          startedAt: timestamp(body.startedAt, 'Start timestamp'),
        });
      } else if (action === 'field-activity-save') {
        const body = exactObject(req.body, [
          'missionId', 'dayId', 'activityId', 'expectedVersion', 'fieldId',
          'hectaresAttempted', 'hectaresCompleted', 'startedAt', 'finishedAt', 'status', 'notes',
        ]);
        result = await repository.saveFieldActivity(context, {
          missionId: uuid(body.missionId, 'Mission'),
          dayId: uuid(body.dayId, 'Operating day'),
          activityId: optionalUuid(body.activityId, 'Field activity'),
          expectedVersion: revision(body.expectedVersion),
          fieldId: uuid(body.fieldId, 'Field'),
          hectaresAttempted: decimalHectares(body.hectaresAttempted),
          hectaresCompleted: decimalHectares(body.hectaresCompleted),
          startedAt: optionalTimestamp(body.startedAt, 'Activity start timestamp'),
          finishedAt: optionalTimestamp(body.finishedAt, 'Activity finish timestamp'),
          status: activityStatus(body.status),
          notes: optionalNotes(body.notes),
        });
      } else if (action === 'aircraft-actuals-save') {
        const body = exactObject(req.body, [
          'missionId', 'dayId', 'expectedVersion', 'totalAircraftHours', 'aircraftTotals', 'flights',
        ]);
        const totals = aircraftTotals(body.aircraftTotals);
        result = await repository.saveAircraftActuals(context, {
          missionId: uuid(body.missionId, 'Mission'),
          dayId: uuid(body.dayId, 'Operating day'),
          expectedVersion: revision(body.expectedVersion),
          totalAircraftHours: decimalHours(body.totalAircraftHours),
          aircraftTotals: totals,
          flights: flightActuals(body.flights, totals),
        });
      } else if (action === 'aircraft-actuals-reconcile') {
        const body = exactObject(req.body, ['missionId', 'dayId']);
        result = await repository.reconcileAircraftActuals(
          context,
          uuid(body.missionId, 'Mission'),
          uuid(body.dayId, 'Operating day'),
        );
      } else {
        const body = exactObject(req.body, ['missionId', 'dayId', 'expectedVersion', 'finishedAt', 'notes']);
        result = await repository.completeDay(context, {
          missionId: uuid(body.missionId, 'Mission'),
          dayId: uuid(body.dayId, 'Operating day'),
          expectedVersion: revision(body.expectedVersion),
          finishedAt: timestamp(body.finishedAt, 'Finish timestamp'),
          notes: optionalNotes(body.notes),
        });
      }
      const checked = checkedFailure(req, result);
      if (checked) return res.status(checked.status).json({ error: checked.error });
      return res.status(status).json({ data: result });
    } catch (error) {
      const safe = safeError(req, error);
      return res.status(safe.status).json({ error: safe.error });
    }
  };
}

module.exports = { createMissionOperationsHandler };
