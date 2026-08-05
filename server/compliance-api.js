const { createHttpError } = require('./supabase');
const { resolveRequestContext } = require('./request-context');
const { errorEnvelope } = require('./operational-api');
const { ComplianceRepository } = require('./compliance-repository');

function apiError(statusCode, code, message) {
  const error = createHttpError(statusCode, message);
  error.code = code;
  return error;
}

function hasPermission(context, code) {
  const permissions = new Set(context.permissions || []);
  return permissions.has('*') || permissions.has(code) || permissions.has('compliance.*');
}

function createComplianceHandler(dependencies = {}) {
  const repository = dependencies.repository || new ComplianceRepository();
  const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function complianceHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const context = await getContext(req, res);
      if (!hasPermission(context, 'compliance.read')) throw apiError(403, 'FORBIDDEN', 'You do not have permission for this operation.');
      if (req.method !== 'GET') throw apiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      const action = req.query?.action || 'overview';
      if (action !== 'overview') throw apiError(400, 'UNSUPPORTED_ACTION', 'Unsupported Compliance action.');
      return res.status(200).json({ data: await repository.readOverview(context) });
    } catch (error) {
      const { status, response } = errorEnvelope(error);
      return res.status(status).json(response);
    }
  };
}

module.exports = { createComplianceHandler };
