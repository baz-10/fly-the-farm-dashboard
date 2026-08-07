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
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => privateSafe(item, permitted));
  const providerKeys=new Set(['providerKey','provider_key','storageBucket','storage_bucket','storageProvider','storage_provider']);
  const privateKeys=new Set(['evidence','internal_file_id','internalFileId','checksum_sha256','checksumSha256','provenance']);
  return Object.fromEntries(Object.entries(value).filter(([key])=>!providerKeys.has(key)&&(permitted||!privateKeys.has(key))).map(([key,item])=>[key,privateSafe(item,permitted)]));
}
function publicFileEvidence(e){return{internalFileId:e.internalFileId,fileVersion:e.fileVersion,originalFilename:e.originalFilename,contentType:e.contentType,sizeBytes:e.sizeBytes,checksumSha256:e.checksumSha256,provenance:{source:e.provenance?.source,uploadedAt:e.provenance?.uploadedAt,uploadedByInternalUserId:e.provenance?.uploadedByInternalUserId}};}
const AUTHORITY_TYPES=new Set(['REOC_CERTIFICATE','REOC_VARIATION','INSTRUMENT','SPECIAL_APPROVAL','EXEMPTION','OTHER_CASA_AUTHORITY']);
function validateUploadMetadata(body){if(typeof body.originalFilename!=='string'||!body.originalFilename.trim()||/[\\/\0]/.test(body.originalFilename)||!['application/pdf','image/png','image/jpeg','image/webp'].includes(body.contentType)||!Number.isInteger(Number(body.sizeBytes))||Number(body.sizeBytes)<1||Number(body.sizeBytes)>20971520)throw apiError(400,'VALIDATION_ERROR','Choose a PDF, PNG, JPEG or WebP file up to 20 MB.');return{originalFilename:body.originalFilename.trim(),contentType:body.contentType,sizeBytes:Number(body.sizeBytes),evidenceRole:String(body.evidenceRole||'DOCUMENT'),description:String(body.description||'').trim()||null};}
function validateAuthority(body){if(!AUTHORITY_TYPES.has(body.authorityTypeCode)||typeof body.authorityNumber!=='string'||!body.authorityNumber.trim()||!Array.isArray(body.uploads)||body.uploads.length<1)throw apiError(400,'VALIDATION_ERROR','Authority type, number and at least one evidence file are required.');for(const upload of body.uploads)uuid(upload.uploadId,'uploads.uploadId');return body;}

function validateCredential(body) {
  const credentialType = String(body.credentialType || '').toUpperCase();
  if (!['REPL','AROC'].includes(credentialType)) throw apiError(400, 'VALIDATION_ERROR', 'credentialType must be RePL or AROC.');
  for (const field of ['arn','identifier','issuer','issueDate']) if (typeof body[field] !== 'string' || !body[field].trim()) throw apiError(400, 'VALIDATION_ERROR', `${field} is required.`);
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
      const action = req.query?.action || 'overview';
      if(req.method==='GET'){if (!hasPermission(context, 'compliance.read')) throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');if(action==='overview')return res.status(200).json({data:await repository.readOverview(context)});if(action==='register')return res.status(200).json({data:await repository.readOperatingAuthorityRegister(context)});throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Compliance action.');}
      if(req.method!=='POST')throw apiError(405,'METHOD_NOT_ALLOWED','Method not allowed.');assertSameOrigin(req);const body=req.body||{};
      if(action==='instrument'){if(!hasPermission(context,'compliance.manage'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');let staged=null;try{staged=body.file?await repository.stageComplianceFile(context,body.instrumentId||'new-instrument',body.file):null;const result=await repository.writeInstrument(context,body),record=result.record||result;if(result?.conflict)throw apiError(409,'VERSION_CONFLICT','Compliance certificate changed before save.');if(staged&&record?.id)await repository.recordInstrumentEvidence(context,record.id,publicFileEvidence(staged));return res.status(201).json({data:{record,evidence:staged?publicFileEvidence(staged):null}});}catch(error){if(staged)await repository.removeStagedComplianceFile(staged);throw error;}}
      if(action==='manual'){if(!hasPermission(context,'compliance.publish'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');let staged=null;try{staged=await repository.stageComplianceFile(context,body.documentId||'operations-manual',body.file);let documentId=body.documentId,expectedVersion=Number(body.expectedVersion||1);if(!documentId){const created=await repository.createControlledDocument(context,{documentType:'OPERATIONS_MANUAL',title:body.title||'RPAS Operations Manual'}),record=created.record||created;documentId=record.id;expectedVersion=record.row_version||1;}const published=await repository.publishControlledDocument(context,documentId,expectedVersion,{effectiveDate:body.effectiveDate,reviewDueDate:body.reviewDueDate||null,internalFileId:staged.internalFileId,fileVersion:staged.fileVersion,originalFilename:staged.originalFilename,checksum:staged.checksumSha256,provenance:staged.provenance,approvedByPersonnelId:body.approvedByPersonnelId||null,approverSnapshot:body.approverSnapshot||null});if(published?.conflict)throw apiError(409,'VERSION_CONFLICT','Operations Manual changed before publication.');return res.status(201).json({data:{record:published.record||published,evidence:publicFileEvidence(staged)}});}catch(error){if(staged)await repository.removeStagedComplianceFile(staged);throw error;}}
      if(action==='upload-authorise'){if(!hasPermission(context,'compliance.manage'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');return res.status(201).json({data:await repository.authoriseComplianceUpload(context,validateUploadMetadata(body))});}
      if(action==='authority-create'){if(!hasPermission(context,'compliance.manage'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');validateAuthority(body);const uploads=[];for(const upload of body.uploads)uploads.push(await repository.verifyComplianceUpload(context,upload.uploadId));const result=await repository.finalizeOperatingAuthority(context,{...body,uploads});if(result?.conflict)throw apiError(409,'VERSION_CONFLICT','Operating authority changed before save.');if(result?.upload_invalid)throw apiError(400,'UPLOAD_VERIFICATION_FAILED','One or more uploaded files could not be verified.');return res.status(201).json({data:result});}
      if(action==='evidence-append'){if(!hasPermission(context,'compliance.manage'))throw apiError(403,'FORBIDDEN','You do not have permission for this operation.');const authorityId=uuid(body.authorityId,'authorityId'),expectedVersion=Number(body.expectedVersion);if(!Number.isInteger(expectedVersion)||expectedVersion<1||!Array.isArray(body.uploads)||!body.uploads.length)throw apiError(400,'VALIDATION_ERROR','Authority version and uploaded evidence are required.');const uploads=[];for(const upload of body.uploads){uuid(upload.uploadId,'uploads.uploadId');uploads.push(await repository.verifyComplianceUpload(context,upload.uploadId));}const result=await repository.appendOperatingAuthorityEvidence(context,authorityId,expectedVersion,{uploads});if(result?.conflict)throw apiError(409,'VERSION_CONFLICT','Operating authority changed before save.');if(result?.not_found)throw apiError(404,'NOT_FOUND','Operating authority was not found.');return res.status(201).json({data:result});}
      throw apiError(400,'UNSUPPORTED_ACTION','Unsupported Compliance action.');
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
        const body=req.body||{};let staged=null;
        try{if(body.file){const personnelId=uuid(body.personnelId,'personnelId');staged=await repository.stagePersonnelCertificate(context,personnelId,body.file);}const result=await repository.writePersonnelCasaCredential(context,validateCredential({...body,evidence:staged||body.evidence}));return res.status(201).json({data:privateSafe(result,hasPermission(context,'personnel.private.read'))});}
        catch(error){if(staged)await repository.removeStagedPersonnelCertificate(staged);throw error;}
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
