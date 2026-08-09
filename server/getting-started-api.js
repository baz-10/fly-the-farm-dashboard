const { createHttpError } = require('./supabase');
const { resolveRequestContext } = require('./request-context');
const { OperationalRepository } = require('./operational-repository');
const { ComplianceRepository } = require('./compliance-repository');

const REQUIRED_READ_PERMISSIONS = Object.freeze([
  'organisation.branding.read',
  'operating_locations.read',
  'aircraft.read',
  'equipment_kits.read',
  'personnel.read',
  'clients.read',
  'properties.read',
  'fields.read',
  'jobs.read',
  'missions.read',
  'compliance.read',
]);

const STEP_DEFINITIONS = Object.freeze([
  { code: 'ORGANISATION', label: 'Organisation', actionCode: 'REVIEW_ORGANISATION', actionLabel: 'Review organisation details', route: '/admin' },
  { code: 'BASE', label: 'Base', actionCode: 'CONFIRM_BASE', actionLabel: 'Confirm your Base', route: '/getting-started#base' },
  { code: 'AIRCRAFT', label: 'Aircraft', actionCode: 'ADD_AIRCRAFT', actionLabel: 'Add your first aircraft', route: '/aircraft?onboarding=aircraft&returnTo=%2Fgetting-started' },
  { code: 'EQUIPMENT', label: 'Equipment', actionCode: 'ADD_EQUIPMENT', actionLabel: 'Add your first equipment kit', route: '/aircraft?onboarding=equipment&returnTo=%2Fgetting-started' },
  { code: 'PERSONNEL', label: 'Personnel', actionCode: 'ADD_PERSONNEL', actionLabel: 'Add Personnel', route: '/personnel?onboarding=personnel&returnTo=%2Fgetting-started' },
  { code: 'CLIENT', label: 'First Client', actionCode: 'ADD_CLIENT', actionLabel: 'Add your first Client', route: '/jobs?onboarding=client&returnTo=%2Fgetting-started' },
  { code: 'PROPERTY', label: 'First Property', actionCode: 'ADD_PROPERTY', actionLabel: 'Add your first Property', route: '/jobs?view=properties&onboarding=property&returnTo=%2Fgetting-started' },
  { code: 'FIELD', label: 'First Field', actionCode: 'ADD_FIELD', actionLabel: 'Add your first Field', route: '/jobs?view=fields&onboarding=field&returnTo=%2Fgetting-started' },
  { code: 'JOB', label: 'First Job', actionCode: 'ADD_JOB', actionLabel: 'Add your first Job', route: '/jobs?view=jobs&onboarding=job&returnTo=%2Fgetting-started' },
  { code: 'MISSION', label: 'First Mission', actionCode: 'ADD_MISSION', actionLabel: 'Plan your first Mission', route: '/missions/new?returnTo=%2Fgetting-started' },
]);

function hasPermission(context, code) {
  const permissions = new Set(context.permissions || []);
  const scope = code.slice(0, code.lastIndexOf('.'));
  return permissions.has('*') || permissions.has(code) || permissions.has(`${scope}.*`);
}

function assertGettingStartedAccess(context) {
  if (!Array.isArray(context.roles) || !context.roles.includes('admin')) {
    const error = createHttpError(403, 'Getting Started is available to Organisation Administrators.');
    error.code = 'FORBIDDEN';
    throw error;
  }
  if (!REQUIRED_READ_PERMISSIONS.every((permission) => hasPermission(context, permission))) {
    const error = createHttpError(403, 'You do not have permission to read Getting Started progress.');
    error.code = 'FORBIDDEN';
    throw error;
  }
}

function belongsToOrganisation(record, organisationId) {
  return Boolean(record && record.organisation_id === organisationId);
}

function atAssignedLocation(record, assignedLocationIds) {
  return Boolean(record && assignedLocationIds.has(record.operating_location_id));
}

function personnelAtAssignedLocation(record, assignedLocationIds) {
  return Array.isArray(record?.operating_location_ids)
    && record.operating_location_ids.some((id) => assignedLocationIds.has(id));
}

function hasConfirmedCoordinates(location) {
  const hasCoordinate = (value) => (typeof value === 'number' && Number.isFinite(value))
    || (typeof value === 'string' && value.trim().length > 0);
  if (!hasCoordinate(location?.latitude) || !hasCoordinate(location?.longitude)) return false;
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const confirmedAt = location?.location_confirmed_at || location?.locationConfirmedAt;
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && typeof confirmedAt === 'string' && confirmedAt.trim().length > 0
    && Number.isFinite(Date.parse(confirmedAt));
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function step(definition, state, summary, count, optional = false) {
  return {
    code: definition.code,
    label: definition.label,
    state,
    summary,
    count,
    optional,
    action: {
      code: definition.actionCode,
      label: definition.actionLabel,
      route: definition.route,
    },
  };
}

const PERSONNEL_ROUTE = '/personnel?onboarding=personnel&returnTo=%2Fgetting-started';

function complianceRoute(code, fallback) {
  if (['REOC_MISSING', 'REOC_EVIDENCE_MISSING', 'REOC_EXPIRED'].includes(code)) return '/compliance/reoc';
  return typeof fallback === 'string' && fallback.startsWith('/compliance') ? fallback : '/compliance';
}

function complianceLabel(code, affectedArea) {
  if (code === 'REOC_MISSING') return 'ReOC certificate missing';
  if (code === 'REOC_EVIDENCE_MISSING') return 'ReOC certificate evidence missing';
  if (code === 'REOC_EXPIRED') return 'ReOC certificate expired';
  if (affectedArea) return `${affectedArea} needs attention`;
  return 'Compliance evidence needs attention';
}

function projectComplianceAdvisories(complianceOverview) {
  if (complianceOverview?.unavailable === true || !complianceOverview?.healthScore) {
    return [{
      code: 'COMPLIANCE_EVIDENCE_UNAVAILABLE',
      label: 'Compliance evidence could not be assessed',
      reason: 'Review CASA Compliance before relying on the organisation’s operational evidence.',
      route: '/compliance',
      requiresAttention: true,
    }];
  }

  const score = complianceOverview.healthScore;
  const advisories = [];
  const seen = new Set();
  for (const blocker of Array.isArray(score.criticalBlockers) ? score.criticalBlockers : []) {
    const code = String(blocker?.criticalRuleCode || 'COMPLIANCE_CRITICAL');
    if (seen.has(code)) continue;
    seen.add(code);
    if (code.startsWith('REOC_')) seen.add('REOC_EVIDENCE_ATTENTION');
    advisories.push({
      code,
      label: complianceLabel(code, blocker?.affectedArea),
      reason: String(blocker?.reason || 'Authoritative compliance evidence needs attention.'),
      route: complianceRoute(code, blocker?.route),
      requiresAttention: true,
      modelVersion: score.modelVersion || null,
    });
  }

  for (const category of Array.isArray(score.categories) ? score.categories : []) {
    const counts = category?.counts || {};
    const missing = Number(counts.missing || 0);
    const expired = Number(counts.expired || 0);
    const blocking = Number(counts.blocking || 0);
    if (missing + expired + blocking < 1) continue;
    const code = `${String(category?.code || 'COMPLIANCE').toUpperCase()}_EVIDENCE_ATTENTION`;
    if (seen.has(code)) continue;
    seen.add(code);
    const firstSource = Array.isArray(category?.sources) ? category.sources[0] : null;
    advisories.push({
      code,
      label: `${category?.label || 'Compliance evidence'} needs attention`,
      reason: String(firstSource?.reason || 'Required authoritative compliance evidence is missing, expired or blocking.'),
      route: complianceRoute(code, firstSource?.route),
      requiresAttention: true,
      modelVersion: score.modelVersion || null,
    });
  }

  if (advisories.length === 0 && score.status && score.status !== 'STRONG') {
    advisories.push({
      code: 'COMPLIANCE_REVIEW_RECOMMENDED',
      label: 'Review your compliance position',
      reason: 'CASA Compliance contains items worth reviewing before operations.',
      route: '/compliance',
      requiresAttention: false,
      modelVersion: score.modelVersion || null,
    });
  }
  return advisories;
}

function projectGettingStarted(context, records) {
  const organisationId = context.organisation.id;
  const assignedLocationIds = new Set(context.operatingLocationIds || []);
  const tenantRecords = (items) => (Array.isArray(items) ? items : [])
    .filter((record) => belongsToOrganisation(record, organisationId));
  const locationRecords = (items) => tenantRecords(items)
    .filter((record) => atAssignedLocation(record, assignedLocationIds));

  const bases = tenantRecords(records.operatingLocations)
    .filter((location) => assignedLocationIds.has(location.id));
  const confirmedBases = bases.filter((location) => hasText(location.address)
    && hasText(location.timezone)
    && hasConfirmedCoordinates(location));
  const aircraft = locationRecords(records.aircraft);
  const equipmentKits = locationRecords(records.equipmentKits);
  const personnel = tenantRecords(records.personnel)
    .filter((record) => personnelAtAssignedLocation(record, assignedLocationIds))
    .filter((record) => record.is_active !== false && !record.archived_at);
  const clients = tenantRecords(records.clients);
  const properties = tenantRecords(records.properties);
  const fields = tenantRecords(records.fields);
  const jobs = tenantRecords(records.jobs);
  const missions = locationRecords(records.missions);
  const draftMissions = missions.filter((record) => ['PLANNING', 'DRAFT'].includes(String(record.status || '').toUpperCase()));

  const brandingProfile = records.branding?.organisation?.profile || records.branding?.organisation || {};
  const displayName = brandingProfile.report_display_name
    || brandingProfile.trading_name
    || brandingProfile.legal_business_name
    || context.organisation.name;

  const states = {
    ORGANISATION: ['COMPLETE', 'Your organisation identity is active.', 1, false],
    BASE: [confirmedBases.length > 0 ? 'COMPLETE' : bases.length > 0 ? 'NEEDS_ATTENTION' : 'NOT_STARTED', confirmedBases.length > 0 ? 'Your Base address and map location are confirmed.' : bases.length > 0 ? 'Confirm the address and map location for your Base.' : 'Add and confirm your first Base.', bases.length, false],
    AIRCRAFT: [aircraft.length > 0 ? 'COMPLETE' : 'NOT_STARTED', aircraft.length > 0 ? `${aircraft.length} aircraft available.` : 'Add the aircraft you will use for work.', aircraft.length, false],
    EQUIPMENT: [equipmentKits.length > 0 ? 'COMPLETE' : 'NOT_STARTED', equipmentKits.length > 0 ? `${equipmentKits.length} equipment kit${equipmentKits.length === 1 ? '' : 's'} available.` : 'Add the equipment kit carried by your aircraft.', equipmentKits.length, false],
    PERSONNEL: [personnel.length > 0 ? 'COMPLETE' : 'OPTIONAL', personnel.length > 0 ? `${personnel.length} Personnel record${personnel.length === 1 ? '' : 's'} available.` : 'Add Personnel if your team will operate or authorise Missions.', personnel.length, personnel.length === 0],
    CLIENT: [clients.length > 0 ? 'COMPLETE' : 'NOT_STARTED', clients.length > 0 ? `${clients.length} Client record${clients.length === 1 ? '' : 's'} available.` : 'Add the first business or grower you will work for.', clients.length, false],
    PROPERTY: [properties.length > 0 ? 'COMPLETE' : 'NOT_STARTED', properties.length > 0 ? `${properties.length} Property record${properties.length === 1 ? '' : 's'} available.` : 'Add the first Property for a Client.', properties.length, false],
    FIELD: [fields.length > 0 ? 'COMPLETE' : 'NOT_STARTED', fields.length > 0 ? `${fields.length} Field record${fields.length === 1 ? '' : 's'} available.` : 'Add the first Field on a Property.', fields.length, false],
    JOB: [jobs.length > 0 ? 'COMPLETE' : 'NOT_STARTED', jobs.length > 0 ? `${jobs.length} Job record${jobs.length === 1 ? '' : 's'} available.` : 'Create the first Job for one or more Fields.', jobs.length, false],
    MISSION: [draftMissions.length > 0 ? 'COMPLETE' : 'NOT_STARTED', draftMissions.length > 0 ? `${draftMissions.length} Draft Mission${draftMissions.length === 1 ? '' : 's'} available.` : 'Plan the first Mission from an authoritative Job.', draftMissions.length, false],
  };
  const steps = STEP_DEFINITIONS.map((definition) => step(definition, ...states[definition.code]));
  const requiredSteps = steps.filter((item) => item.code !== 'PERSONNEL');
  const completedSteps = requiredSteps.filter((item) => item.state === 'COMPLETE').length;
  const requiredActions = requiredSteps
    .filter((item) => item.state !== 'COMPLETE')
    .map((item) => ({ ...item.action, stepCode: item.code, reason: item.summary }));
  const complianceAdvisories = projectComplianceAdvisories(records.complianceOverview);
  const onboardingComplete = requiredActions.length === 0;
  const needsOperationalAttention = complianceAdvisories.some((item) => item.requiresAttention);
  const readinessState = !onboardingComplete
    ? 'GETTING_STARTED'
    : needsOperationalAttention ? 'NEEDS_OPERATIONAL_ATTENTION' : 'READY_TO_PLAN';
  const firstDraftMission = draftMissions[0] || null;
  const primaryAction = onboardingComplete && firstDraftMission
    ? { code: 'OPEN_MISSION', label: 'Open your first Mission', route: `/missions/${firstDraftMission.id}` }
    : requiredActions[0] || null;
  const nextStep = requiredSteps.find((item) => item.state !== 'COMPLETE')
    || steps.find((item) => item.state === 'NEEDS_ATTENTION')
    || steps.find((item) => item.code === 'MISSION');
  const nextAction = onboardingComplete && primaryAction
    ? { ...primaryAction, stepCode: 'MISSION' }
    : nextStep ? { ...nextStep.action, stepCode: nextStep.code } : null;

  return {
    organisation: { id: organisationId, name: context.organisation.name, displayName },
    base: bases[0] ? {
      id: bases[0].id,
      name: bases[0].name,
      address: bases[0].address || '',
      timezone: bases[0].timezone || '',
      latitude: bases[0].latitude == null ? null : Number(bases[0].latitude),
      longitude: bases[0].longitude == null ? null : Number(bases[0].longitude),
      addressSource: bases[0].address_source || null,
      locationConfirmedAt: bases[0].location_confirmed_at || null,
      rowVersion: Number(bases[0].row_version || 0),
      createdAt: bases[0].created_at || null,
      updatedAt: bases[0].updated_at || null,
    } : null,
    steps,
    operationalReadiness: {
      state: readinessState,
      headline: readinessState === 'READY_TO_PLAN'
        ? 'Your Spray Command workspace is ready'
        : readinessState === 'NEEDS_OPERATIONAL_ATTENTION'
          ? 'Your workspace needs operational attention'
          : 'Your workspace is taking shape',
      summary: readinessState === 'GETTING_STARTED'
        ? 'Complete the remaining essentials to begin normal Mission planning.'
        : 'Your first operational records are in place and your Mission workspace is available.',
      missionAuthorisationClaim: false,
      completedSteps,
      requiredSteps: requiredSteps.length,
      requiredActions,
      advisories: complianceAdvisories,
      personnel: {
        state: personnel.length > 0 ? 'RECORDED' : 'NOT_RECORDED',
        headline: personnel.length > 0 ? 'Personnel is recorded' : 'Personnel is not recorded yet',
        reason: personnel.length > 0
          ? 'Each Mission will still evaluate eligible Personnel through the existing readiness and authorisation gates.'
          : 'Add eligible Personnel before a Mission can be authorised or operated.',
        route: PERSONNEL_ROUTE,
      },
      primaryAction,
    },
    nextAction,
  };
}

function uniqueById(records) {
  return Array.from(new Map(records.filter(Boolean).map((record) => [record.id, record])).values());
}

async function readSources(repository, complianceRepository, context) {
  const list = async (resource) => {
    const pageSize = 100;
    const records = [];
    for (let page = 1; ; page += 1) {
      const pageRecords = await repository.list(resource, context, { page, pageSize });
      const items = Array.isArray(pageRecords) ? pageRecords : [];
      records.push(...items);
      if (items.length < pageSize) return records;
    }
  };
  const personnelReads = (context.operatingLocationIds || []).map((operatingLocationId) =>
    repository.listPersonnel(context, { operatingLocationId, includePrivate: false }));
  const [branding, operatingLocations, aircraft, equipmentKits, clients, properties, fields, jobs, missions, personnelGroups, complianceOverview] = await Promise.all([
    repository.readOrganisationBranding(context),
    list('operating_locations'),
    list('aircraft'),
    list('equipment-kits'),
    list('clients'),
    list('properties'),
    list('fields'),
    list('jobs'),
    list('missions'),
    Promise.all(personnelReads),
    complianceRepository.readOverview(context).catch(() => ({ unavailable: true })),
  ]);
  return {
    branding, operatingLocations, aircraft, equipmentKits, clients, properties, fields, jobs, missions,
    personnel: uniqueById(personnelGroups.flat()),
    complianceOverview,
  };
}

function errorEnvelope(error) {
  const status = error.statusCode || error.status || 500;
  return {
    status,
    response: {
      error: {
        code: error.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR'),
        message: error.publicMessage || 'Getting Started progress could not be loaded.',
      },
    },
  };
}

function createGettingStartedHandler(dependencies = {}) {
  const repository = dependencies.repository || new OperationalRepository();
  const complianceRepository = dependencies.complianceRepository || new ComplianceRepository();
  const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function gettingStartedHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' } });
    }
    try {
      const context = await getContext(req, res);
      assertGettingStartedAccess(context);
      const sources = await readSources(repository, complianceRepository, context);
      return res.status(200).json({ data: projectGettingStarted(context, sources) });
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

module.exports = {
  REQUIRED_READ_PERMISSIONS,
  createGettingStartedHandler,
  projectGettingStarted,
};
