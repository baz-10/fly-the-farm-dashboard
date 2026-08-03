const {
  createChemicalReviewsHandler,
  createFieldBoundaryVersionHandler,
  createMissionMapHandler,
  createMissionChemicalsHandler,
  createMissionPersonnelHandler,
  createMissionWeatherHandler,
  createOperationalHandler,
  createPersonnelHandler,
  createSessionHandler,
} = require('./operational-api');

function createDefaultHandlers() {
  return Object.freeze({
    clients: createOperationalHandler('clients'),
    properties: createOperationalHandler('properties'),
    fields: createOperationalHandler('fields'),
    jobs: createOperationalHandler('jobs'),
    missions: createOperationalHandler('missions'),
    aircraft: createOperationalHandler('aircraft'),
    'equipment-kits': createOperationalHandler('equipment-kits'),
    'operating-locations': createOperationalHandler('operating_locations'),
    'field-boundary-versions': createFieldBoundaryVersionHandler(),
    'mission-maps': createMissionMapHandler(),
    personnel: createPersonnelHandler(),
    'mission-personnel': createMissionPersonnelHandler(),
    'mission-weather': createMissionWeatherHandler(),
    'mission-chemicals': createMissionChemicalsHandler(),
    'chemical-reviews': createChemicalReviewsHandler(),
    session: createSessionHandler(),
  });
}

function createVersionedApiDispatcher(handlerMap = createDefaultHandlers()) {
  return async function dispatchVersionedApiRequest(req, res) {
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
