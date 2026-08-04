const { resolveRequestContext } = require('./request-context');
const { resolvePlatformRequestContext } = require('./platform-request-context');
const { SupportRepository } = require('./support-repository');

function apiError(status, code, message) { const error = new Error(message); error.statusCode = status; error.code = code; return error; }
function parseBody(req) { if (req.body && typeof req.body === 'object') return req.body; if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body); return {}; }
function requireOrganisationAdmin(context) { if (!context.roles?.includes('admin')) throw apiError(403, 'FORBIDDEN', 'Organisation Administrator permission is required.'); }
function requirePlatformSupport(context) { if (!context.permissions?.includes('platform.support.session')) throw apiError(403, 'FORBIDDEN', 'Platform Support permission is required.'); }
function envelope(error) { return { status: error.statusCode || 500, body: { error: { code: error.code || 'INTERNAL_ERROR', message: error.statusCode ? error.message : 'Assisted Support request failed.' } } }; }

function createSupportHandler(dependencies = {}) {
  const repository = dependencies.repository || new SupportRepository();
  const getOrganisationContext = dependencies.resolveOrganisationContext || resolveRequestContext;
  const getPlatformContext = dependencies.resolvePlatformContext || resolvePlatformRequestContext;
  return async function supportHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const action = String(req.query?.action || 'list');
      if (req.method === 'GET') {
        if (action === 'platform-list') { const context = await getPlatformContext(req, res); requirePlatformSupport(context); return res.status(200).json({ data: await repository.listPlatform(context) }); }
        const context = await getOrganisationContext(req, res); requireOrganisationAdmin(context); return res.status(200).json({ data: await repository.listOrganisation(context) });
      }
      if (req.method !== 'POST') throw apiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      const body = parseBody(req);
      if (action === 'start') { const context = await getPlatformContext(req, res); requirePlatformSupport(context); return res.status(201).json({ data: await repository.startSession(context.platformUser.id, body.requestId) }); }
      const context = await getOrganisationContext(req, res); requireOrganisationAdmin(context);
      if (action === 'request') return res.status(201).json({ data: await repository.createRequest(context, body) });
      if (action === 'approve') return res.status(201).json({ data: await repository.decideRequest(context, body) });
      if (action === 'revoke') return res.status(200).json({ data: await repository.revokeSession(context, body) });
      throw apiError(400, 'UNSUPPORTED_ACTION', 'Unsupported Assisted Support action.');
    } catch (error) { const failure = envelope(error); return res.status(failure.status).json(failure.body); }
  };
}

module.exports = { createSupportHandler };
