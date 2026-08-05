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

function uuid(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw apiError(400, 'VALIDATION_ERROR', `${field} must be a UUID.`);
  return value;
}

function assertSameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return;
  let host;
  try { host = new URL(origin).host; } catch (_) { throw apiError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not permitted.'); }
  if (host !== req.headers?.host) throw apiError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not permitted.');
}

function privateSafe(value, permitted) {
  if (permitted || !value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => privateSafe(item, false));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['evidence','internal_file_id','internalFileId','checksum_sha256','checksumSha256','provenance'].includes(key)).map(([key,item]) => [key, privateSafe(item, false)]));
}

function validateCredential(body) {
  const credentialType = String(body.credentialType || '').toUpperCase();
  if (!['REPL','AROC'].includes(credentialType)) throw apiError(400, 'VALIDATION_ERROR', 'credentialType must be RePL or AROC.');
  for (const field of ['identifier','issuer','issueDate']) if (typeof body[field] !== 'string' || !body[field].trim()) throw apiError(400, 'VALIDATION_ERROR', `${field} is required.`);
  if (Number.isNaN(Date.parse(body.issueDate))) throw apiError(400, 'VALIDATION_ERROR', 'issueDate must be a valid date.');
  if (credentialType === 'AROC' && body.expiryDate && Number.isNaN(Date.parse(body.expiryDate))) throw apiError(400, 'VALIDATION_ERROR', 'expiryDate must be a valid date.');
  const evidence = body.evidence;
  if (!evidence || typeof evidence !== 'object') throw apiError(400, 'VALIDATION_ERROR', 'Certificate evidence is required.');
  uuid(evidence.internalFileId, 'evidence.internalFileId');
  if (!Number.isInteger(Number(evidence.fileVersion)) || Number(evidence.fileVersion) < 1 || !/^[a-f0-9]{64}$/i.test(String(evidence.checksumSha256 || '')) || !evidence.originalFilename || !['application/pdf','image/png','image/jpeg','image/webp'].includes(evidence.contentType) || !Number.isInteger(Number(evidence.sizeBytes)) || Number(evidence.sizeBytes) < 1 || !evidence.provenance) throw apiError(400, 'VALIDATION_ERROR', 'Certificate evidence metadata is incomplete or invalid.');
  for (const field of ['categories','ratings','aircraftTypes']) if (!Array.isArray(body[field])) throw apiError(400, 'VALIDATION_ERROR', `${field} must be an array.`);
  return {...body,personnelId:uuid(body.personnelId,'personnelId'),credentialType:credentialType === 'REPL' ? 'RePL' : 'AROC',expiryDate:credentialType === 'REPL' ? null : (body.expiryDate || null)};
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

function createPersonnelCasaCredentialsHandler(dependencies = {}) {
  const repository = dependencies.repository || new ComplianceRepository();
  const getContext = dependencies.resolveContext || resolveRequestContext;
  return async function personnelCasaCredentialsHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store');res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const context = await getContext(req, res);const action = req.query?.action;
      if (req.method === 'GET') {
        if (!hasPermission(context,'personnel.read')) throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');
        if (action !== 'eligibility') throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Personnel credential action.');
        let requirements={};try{requirements=req.query?.requirements?JSON.parse(req.query.requirements):{};}catch(_){throw apiError(400,'VALIDATION_ERROR','requirements must be valid JSON.');}
        const result=await repository.evaluatePersonnelMissionEligibility(context,uuid(req.query?.personnelId,'personnelId'),requirements);
        return res.status(200).json({data:privateSafe(result,hasPermission(context,'personnel.private.read'))});
      }
      if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);
      if(action==='create'){
        if(!hasPermission(context,'personnel.update'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');
        const result=await repository.writePersonnelCasaCredential(context,validateCredential(req.body||{}));return res.status(201).json({data:privateSafe(result,hasPermission(context,'personnel.private.read'))});
      }
      if(action==='verify'){
        if(!hasPermission(context,'compliance.verify'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');
        const body=req.body||{},expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1||!['VERIFIED','REJECTED','SUSPENDED','CANCELLED'].includes(body.decision))throw apiError(400,'VALIDATION_ERROR','Verification decision and expectedVersion are required.');
        const result=await repository.verifyPersonnelCasaCredential(context,{credentialId:uuid(body.credentialId,'credentialId'),expectedVersion,decision:body.decision,notes:body.notes});if(result?.conflict)throw apiError(409,'VERSION_CONFLICT','Credential changed before verification.');return res.status(201).json({data:privateSafe(result,hasPermission(context,'personnel.private.read'))});
      }
      throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Personnel credential action.');
    } catch(error){const{status,response}=errorEnvelope(error);return res.status(status).json(response);}
  };
}

module.exports = { createComplianceHandler, createPersonnelCasaCredentialsHandler };
