const { FinancialActualsRepository } = require('./financial-actuals-repository');
const { resolveOperationalActorContext } = require('./operational-actor-context');
const { decodeFinancialActualExportAuthority } = require('./financial-actual-export-contract');
const { FINANCIAL_ACTUAL_REPORT_VERSION, renderFinancialActualPdf } = require('./financial-actual-renderer');

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS=Object.freeze({
  list:{method:'GET',permission:'financial_actuals.read'},read:{method:'GET',permission:'financial_actuals.read'},
  prefill:{method:'GET',permission:'financial_actuals.update'},'source-drift':{method:'GET',permission:'financial_actuals.read'},
  create:{method:'POST',permission:'financial_actuals.create'},'update-draft':{method:'POST',permission:'financial_actuals.update'},
  'accept-prefill':{method:'POST',permission:'financial_actuals.update'},finalise:{method:'POST',permission:'financial_actuals.finalise'},
  'create-correction':{method:'POST',permission:'financial_actuals.update'},'revision-history':{method:'GET',permission:'financial_actuals.read'},
  'historical-revision':{method:'GET',permission:'financial_actuals.read'},archive:{method:'POST',permission:'financial_actuals.archive'},export:{method:'POST',permissions:['financial_actuals.read','financial_actuals.export']},
});
function permitted(context,permission){return(context.permissions||[]).includes('*')||(context.permissions||[]).includes(permission);}
function permittedFor(context,definition){return definition.permissions?definition.permissions.every(permission=>permitted(context,permission)):permitted(context,definition.permission);}
function fail(statusCode,code,message){throw Object.assign(new Error(message),{statusCode,code,publicMessage:message});}
function uuid(value,name){if(typeof value!=='string'||!UUID.test(value))fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID',`${name} is invalid.`);return value;}
function version(value,name){if(!Number.isInteger(value)||value<1)fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID',`${name} is invalid.`);return value;}
function payload(value){if(!value||typeof value!=='object'||Array.isArray(value))fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID','Financial Actual input is invalid.');let encoded;try{encoded=JSON.stringify(value);}catch{fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID','Financial Actual input is invalid.');}if(Buffer.byteLength(encoded)>200000)fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID','Financial Actual input is too large.');return value;}
function reason(value,name,maxLength=1000){if(typeof value!=='string'||value.trim().length<1||value.trim().length>maxLength||/[\u0000-\u001f\u007f]/.test(value))fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID',`${name} is invalid.`);return value.trim();}
function sameOrigin(req){const origin=req.headers?.origin,protocol=req.headers?.['x-forwarded-proto']||'https',host=req.headers?.host;if(!origin||origin!==`${protocol}://${host}`)fail(403,'SAME_ORIGIN_REQUIRED','Same-origin requests are required.');}
function safeError(error){
  if(['FINANCIAL_ACTUAL_REQUEST_INVALID','SAME_ORIGIN_REQUIRED','UNSUPPORTED_ACTION','METHOD_NOT_ALLOWED'].includes(error?.code))return{status:error.statusCode,code:error.code,message:error.publicMessage};
  if(error?.statusCode===401)return{status:401,code:'UNAUTHENTICATED',message:'Authentication is required.'};
  if(error?.statusCode===403)return{status:403,code:'FORBIDDEN',message:'You do not have permission to use Financial Actuals.'};
  if(error?.statusCode===404)return{status:404,code:'NOT_FOUND',message:'Financial Actual was not found.'};
  return{status:Number.isInteger(error?.statusCode)&&error.statusCode>=500&&error.statusCode<=599?error.statusCode:500,code:'FINANCIAL_ACTUAL_UNAVAILABLE',message:'Financial Actuals are temporarily unavailable.'};
}
function createFinancialActualsHandler(dependencies={}){
  const repository=dependencies.repository||new FinancialActualsRepository(),resolveContext=dependencies.resolveContext||resolveOperationalActorContext;
  return async function financialActualsHandler(req,res){res.setHeader('Cache-Control','no-store');try{
    const action=typeof req.query?.action==='string'?req.query.action:'list',definition=ACTIONS[action];
    if(!definition||req.method!==definition.method)fail(definition?405:400,definition?'METHOD_NOT_ALLOWED':'UNSUPPORTED_ACTION',definition?'Method not allowed.':'Unsupported Financial Actual action.');
    const context=await resolveContext(req,res);if(!context?.organisation?.id||!context?.internalUser?.id)fail(403,'FORBIDDEN','Financial Actuals require an organisation user.');
    if(!permittedFor(context,definition))fail(403,'FORBIDDEN','You do not have permission to use Financial Actuals.');
    if(req.method==='POST')sameOrigin(req);
    let result,status=200;
    if(action==='list'){const pageSize=req.query?.pageSize==null?25:Number(req.query.pageSize);if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID','Page size is invalid.');result=await repository.list(context,{operatingLocationId:req.query?.operatingLocationId?uuid(req.query.operatingLocationId,'Operating location'):null,afterId:req.query?.afterId?uuid(req.query.afterId,'Cursor'):null,pageSize});}
    else if(action==='read')result=await repository.read(context,uuid(req.query?.actualId,'Financial Actual'));
    else if(action==='prefill')result=await repository.readPrefill(context,uuid(req.query?.actualId,'Financial Actual'));
    else if(action==='source-drift')result=await repository.readSourceDrift(context,uuid(req.query?.actualId,'Financial Actual'));
    else if(action==='revision-history'){const pageSize=req.query?.pageSize==null?25:Number(req.query.pageSize),before=req.query?.beforeRevisionNumber==null?null:Number(req.query.beforeRevisionNumber);if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100||before!==null&&(!Number.isInteger(before)||before<1))fail(400,'FINANCIAL_ACTUAL_REQUEST_INVALID','Revision page is invalid.');result=await repository.revisionHistory(context,{actualId:uuid(req.query?.actualId,'Financial Actual'),beforeRevisionNumber:before,pageSize});}
    else if(action==='historical-revision')result=await repository.historicalRevision(context,{actualId:uuid(req.query?.actualId,'Financial Actual'),revisionId:uuid(req.query?.revisionId,'Revision')});
    else if(action==='create'){result=await repository.create(context,payload(req.body?.payload));status=201;}
    else if(action==='update-draft')result=await repository.updateDraft(context,{actualId:uuid(req.body?.actualId,'Financial Actual'),revisionId:uuid(req.body?.revisionId,'Revision'),expectedVersion:version(req.body?.expectedVersion,'Expected version'),payload:payload(req.body?.payload)});
    else if(action==='accept-prefill')result=await repository.acceptPrefill(context,{actualId:uuid(req.body?.actualId,'Financial Actual'),revisionId:uuid(req.body?.revisionId,'Revision'),expectedVersion:version(req.body?.expectedVersion,'Expected version'),payload:payload(req.body?.payload)});
    else if(action==='finalise')result=await repository.finalise(context,{actualId:uuid(req.body?.actualId,'Financial Actual'),revisionId:uuid(req.body?.revisionId,'Revision'),expectedAggregateVersion:version(req.body?.expectedAggregateVersion,'Expected aggregate version'),expectedRevisionVersion:version(req.body?.expectedRevisionVersion,'Expected revision version')});
    else if(action==='create-correction'){result=await repository.createCorrection(context,{actualId:uuid(req.body?.actualId,'Financial Actual'),expectedAggregateVersion:version(req.body?.expectedAggregateVersion,'Expected aggregate version'),expectedFinalRevisionId:uuid(req.body?.expectedFinalRevisionId,'Current FINAL revision'),expectedFinalRevisionVersion:version(req.body?.expectedFinalRevisionVersion,'Expected FINAL revision version'),correctionReason:reason(req.body?.correctionReason,'Correction reason')});status=201;}
    else if(action==='archive')result=await repository.archive(context,{actualId:uuid(req.body?.actualId,'Financial Actual'),expectedAggregateVersion:version(req.body?.expectedAggregateVersion,'Expected aggregate version'),archiveReason:reason(req.body?.archiveReason,'Archive reason',500)});
    else if(action==='export'){
      const actualId=uuid(req.body?.actualId,'Financial Actual'),revisionId=uuid(req.body?.revisionId,'Revision'),generatedAt=new Date().toISOString();
      const authority=await repository.read(context,actualId);if(authority?.not_found)return res.status(404).json({error:{code:'NOT_FOUND',message:'Financial Actual was not found.'}});
      let historical=null;if(authority?.final?.id!==revisionId){historical=await repository.historicalRevision(context,{actualId,revisionId});if(historical?.not_found)return res.status(404).json({error:{code:'NOT_FOUND',message:'Financial Actual revision was not found.'}});}
      const model=(dependencies.decodeExport||decodeFinancialActualExportAuthority)({authority,historical,requestedActualId:actualId,requestedRevisionId:revisionId,generatedAt,reportVersion:FINANCIAL_ACTUAL_REPORT_VERSION});
      const pdf=(dependencies.renderExport||renderFinancialActualPdf)(model);if(!Buffer.isBuffer(pdf)||pdf.length<4||pdf.length>5*1024*1024||pdf.subarray(0,4).toString()!=='%PDF')fail(500,'FINANCIAL_ACTUAL_EXPORT_UNAVAILABLE','Financial Actual export is unavailable.');
      const evidence=await repository.recordExportEvidence(context,{actualId,revisionId,revisionNumber:model.revision.revisionNumber,inputDigest:model.revision.inputDigest,formulaVersion:model.revision.formulaVersion,reportVersion:model.reportVersion,generatedAt:model.generatedAt});
      if(!evidence||evidence.schemaVersion!=='FINANCIAL_ACTUAL_EXPORT_EVIDENCE_V1'||evidence.financialActualId!==actualId||evidence.revisionId!==revisionId||evidence.revisionNumber!==model.revision.revisionNumber||evidence.inputDigest!==model.revision.inputDigest||evidence.formulaVersion!==model.revision.formulaVersion||evidence.reportVersion!==model.reportVersion||evidence.generatedAt!==model.generatedAt)fail(500,'FINANCIAL_ACTUAL_EXPORT_UNAVAILABLE','Financial Actual export is unavailable.');
      const safeReference=String(model.financialActual.reference).replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,40);res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="${safeReference}-revision-${model.revision.revisionNumber}.pdf"`);res.setHeader('Content-Length',String(pdf.length));return res.status(200).end(pdf);
    }
    if(result?.conflict)return res.status(409).json({error:{code:'FINANCIAL_ACTUAL_CONFLICT',message:'This Financial Actual was updated in another session.',currentVersion:result.current_version}});
    if(result?.active_draft_conflict)return res.status(409).json({error:{code:'ACTIVE_DRAFT_CONFLICT',message:'Resolve the active Financial Actual Draft before archiving.'}});
    if(result?.not_found)return res.status(404).json({error:{code:'NOT_FOUND',message:'Financial Actual was not found.'}});
    return res.status(status).json({data:result});
  }catch(error){const safe=safeError(error);return res.status(safe.status).json({error:{code:safe.code,message:safe.message}});}};
}
module.exports={createFinancialActualsHandler};
