const crypto = require('crypto');
const {
  createChemicalReviewsHandler,
  createCustomerAcceptanceHandler,
  createCustomerAcceptancePublicHandler,
  createFieldBoundaryVersionHandler,
  createMissionMapHandler,
  createMissionChemicalsHandler,
  createMissionJsaHandler,
  createMissionAuthorisationHandler,
  createMissionOperationalCloseoutHandler,
  createMissionOutcomesHandler,
  createMissionPersonnelHandler,
  createMissionWeatherHandler,
  createMissionSetupDraftsHandler,
  createOperationalHandler,
  createOrganisationBrandingHandler,
  createReportsHandler,
  createPersonnelHandler,
  createPersonnelIdentityHandler,
  createSessionHandler,
} = require('./operational-api');
const { createSupportHandler } = require('./support-api');
const { createComplianceHandler, createPersonnelCasaCredentialsHandler } = require('./compliance-api');
const { createChecklistsHandler } = require('./checklists-api');
const { createOperationsBriefHandler } = require('./operations-brief-api');
const { createCommercialOnboardingHandler } = require('./commercial-onboarding-api');
const { createGettingStartedHandler } = require('./getting-started-api');
const { createFleetMaintenanceHandler } = require('./fleet-maintenance-api');
const { createTechnicalCatalogueHandler } = require('./technical-catalogue-api');

function createDefaultHandlers() {
  return Object.freeze({
    clients: createOperationalHandler('clients'),
    properties: createOperationalHandler('properties'),
    fields: createOperationalHandler('fields'),
    jobs: createOperationalHandler('jobs'),
    missions: createOperationalHandler('missions'),
    'mission-setup-drafts': createMissionSetupDraftsHandler(),
    aircraft: createOperationalHandler('aircraft'),
    'fleet-assets': createOperationalHandler('fleet-assets'),
    'equipment-kits': createOperationalHandler('equipment-kits'),
    'operating-locations': createOperationalHandler('operating_locations'),
    'field-boundary-versions': createFieldBoundaryVersionHandler(),
    'mission-maps': createMissionMapHandler(),
    personnel: createPersonnelHandler(),
    'personnel-identity': createPersonnelIdentityHandler(),
    'mission-personnel': createMissionPersonnelHandler(),
    'mission-weather': createMissionWeatherHandler(),
    'mission-chemicals': createMissionChemicalsHandler(),
    'mission-jsa': createMissionJsaHandler(),
    'mission-authorisation': createMissionAuthorisationHandler(),
    'mission-operational-closeout': createMissionOperationalCloseoutHandler(),
    'mission-outcomes': createMissionOutcomesHandler(),
    'customer-acceptance': createCustomerAcceptanceHandler(),
    'customer-acceptance-public': createCustomerAcceptancePublicHandler(),
    'chemical-reviews': createChemicalReviewsHandler(),
    'organisation-branding': createOrganisationBrandingHandler(),
    reports: createReportsHandler(),
    session: createSessionHandler(),
    'assisted-support': createSupportHandler(),
    compliance: createComplianceHandler(),
    'personnel-casa-credentials': createPersonnelCasaCredentialsHandler(),
    checklists: createChecklistsHandler(),
    'operations-brief': createOperationsBriefHandler(),
    'commercial-onboarding': createCommercialOnboardingHandler(),
    'getting-started': createGettingStartedHandler(),
    'asset-maintenance': createFleetMaintenanceHandler(),
    'technical-catalogue': createTechnicalCatalogueHandler(),
  });
}

function createVersionedApiDispatcher(handlerMap = createDefaultHandlers()) {
  return async function dispatchVersionedApiRequest(req, res) {
    const suppliedRequestId = String(req.headers?.['x-request-id'] || '');
    const correlationId = /^[A-Za-z0-9._:-]{8,100}$/.test(suppliedRequestId) ? suppliedRequestId : crypto.randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    const resource = req.query?.resource;
    const handler = typeof resource === 'string' ? handlerMap[resource] : undefined;

    if (!handler) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'API endpoint not found.' },
      });
    }

    return handler(req, res);
  };
}

module.exports = { createDefaultHandlers, createVersionedApiDispatcher };
