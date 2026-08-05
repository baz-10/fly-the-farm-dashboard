const crypto = require('crypto');
const { supabaseRequest } = require('./supabase');

class ComplianceRepository {
  async readOverview(context) {
    return supabaseRequest('rest/v1/rpc/ftf_read_casa_compliance_overview', {
      method: 'POST',
      body: JSON.stringify({ p_organisation_id: context.organisation.id }),
      publicMessage: 'CASA Compliance overview could not be loaded.',
    });
  }

  async writePersonnelCasaCredential(context, payload) {
    return supabaseRequest('rest/v1/rpc/ftf_write_personnel_casa_credential', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_actor_internal_user_id: context.internalUser.id,
        p_personnel_id: payload.personnelId,
        p_payload: payload,
      }),
      publicMessage: 'CASA credential evidence could not be saved.',
    });
  }

  async writeInstrument(context,payload){return supabaseRequest('rest/v1/rpc/ftf_write_compliance_instrument',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_operation:payload.operation||'CREATE',p_instrument_id:payload.instrumentId||null,p_expected_version:Number(payload.expectedVersion||0),p_payload:payload}),publicMessage:'Compliance certificate could not be saved.'});}
  async recordInstrumentEvidence(context,instrumentId,evidence){return supabaseRequest('rest/v1/rpc/ftf_record_compliance_instrument_evidence',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_instrument_id:instrumentId,p_payload:evidence}),publicMessage:'Compliance certificate evidence could not be recorded.'});}
  async createControlledDocument(context,payload){return supabaseRequest('rest/v1/rpc/ftf_create_controlled_document',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_payload:payload}),publicMessage:'Controlled document could not be created.'});}
  async publishControlledDocument(context,documentId,expectedVersion,payload){return supabaseRequest('rest/v1/rpc/ftf_publish_controlled_document_version',{method:'POST',body:JSON.stringify({p_organisation_id:context.organisation.id,p_actor_internal_user_id:context.internalUser.id,p_document_id:documentId,p_expected_version:expectedVersion,p_payload:payload}),publicMessage:'Controlled document version could not be published.'});}
  async stageComplianceFile(context,subjectId,file){const match=typeof file?.dataUrl==='string'&&file.dataUrl.match(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/),bytes=match?Buffer.from(match[2],'base64'):null;if(!match||!bytes?.length||bytes.length>20971520||bytes.length!==Number(file.sizeBytes)||typeof file.fileName!=='string'||/[\\/\0]/.test(file.fileName))throw Object.assign(new Error('Compliance evidence file is invalid.'),{statusCode:400,code:'VALIDATION_ERROR'});const internalFileId=crypto.randomUUID(),bucket='compliance-evidence',safe=file.fileName.replace(/[^A-Za-z0-9._-]/g,'_'),providerKey=`${context.organisation.id}/${subjectId}/${internalFileId}/v1/${safe}`,checksumSha256=crypto.createHash('sha256').update(bytes).digest('hex');await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'POST',body:bytes,headers:{'Content-Type':match[1],'x-upsert':'false'},publicMessage:'Compliance evidence file could not be stored.'});return{internalFileId,fileVersion:1,originalFilename:file.fileName,contentType:match[1],sizeBytes:bytes.length,checksumSha256,checksum:checksumSha256,provenance:{source:'OPERATOR_UPLOAD',uploadedAt:new Date().toISOString(),uploadedByInternalUserId:context.internalUser.id,storageProvider:'supabase',storageBucket:bucket,providerKey},storageBucket:bucket,providerKey};}
  async removeStagedComplianceFile(evidence){if(evidence?.storageBucket&&evidence?.providerKey)await supabaseRequest(`storage/v1/object/${evidence.storageBucket}/${evidence.providerKey}`,{method:'DELETE',publicMessage:'Compliance evidence cleanup failed.'}).catch(()=>{});}

  async stagePersonnelCertificate(context, personnelId, file) {
    const match=typeof file?.dataUrl==='string'&&file.dataUrl.match(/^data:(application\/pdf|image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if(!match)throw Object.assign(new Error('A PDF, PNG, JPEG or WebP certificate is required.'),{statusCode:400,code:'VALIDATION_ERROR'});
    const bytes=Buffer.from(match[2],'base64');
    if(!bytes.length||bytes.length>10485760||Number(file.sizeBytes)!==bytes.length||typeof file.fileName!=='string'||!file.fileName.trim()||/[\\/\0]/.test(file.fileName))throw Object.assign(new Error('Certificate file metadata is invalid.'),{statusCode:400,code:'VALIDATION_ERROR'});
    const internalFileId=crypto.randomUUID(),fileVersion=1,checksumSha256=crypto.createHash('sha256').update(bytes).digest('hex'),bucket='personnel-compliance-evidence',safeName=file.fileName.replace(/[^A-Za-z0-9._-]/g,'_'),providerKey=`${context.organisation.id}/${personnelId}/${internalFileId}/v1/${safeName}`;
    await supabaseRequest(`storage/v1/object/${bucket}/${providerKey}`,{method:'POST',body:bytes,headers:{'Content-Type':match[1],'x-upsert':'false'},publicMessage:'Personnel certificate could not be stored.'});
    return {internalFileId,fileVersion,checksumSha256,originalFilename:file.fileName.trim(),contentType:match[1],sizeBytes:bytes.length,storageProvider:'supabase',storageBucket:bucket,providerKey,provenance:{source:'OPERATOR_UPLOAD',uploadedAt:new Date().toISOString(),uploadedByInternalUserId:context.internalUser.id,storageProvider:'supabase',storageBucket:bucket,providerKey}};
  }

  async removeStagedPersonnelCertificate(evidence) {
    if(evidence?.storageBucket&&evidence?.providerKey)await supabaseRequest(`storage/v1/object/${evidence.storageBucket}/${evidence.providerKey}`,{method:'DELETE',publicMessage:'Personnel certificate cleanup failed.'}).catch(()=>{});
  }

  async verifyPersonnelCasaCredential(context, payload) {
    return supabaseRequest('rest/v1/rpc/ftf_verify_personnel_credential', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_actor_internal_user_id: context.internalUser.id,
        p_credential_id: payload.credentialId,
        p_expected_version: payload.expectedVersion,
        p_decision: payload.decision,
        p_notes: payload.notes || null,
      }),
      publicMessage: 'CASA credential verification could not be saved.',
    });
  }

  async evaluatePersonnelMissionEligibility(context, personnelId, requirements) {
    return supabaseRequest('rest/v1/rpc/ftf_evaluate_personnel_mission_eligibility', {
      method: 'POST',
      body: JSON.stringify({
        p_organisation_id: context.organisation.id,
        p_personnel_id: personnelId,
        p_operation_date: requirements.operationDate || new Date().toISOString().slice(0,10),
        p_required_category: requirements.requiredCategory || null,
        p_required_rating: requirements.requiredRating || null,
        p_aircraft_type: requirements.aircraftType || null,
        p_aircraft_weight_kg: requirements.aircraftWeightKg ?? null,
        p_aroc_required: Boolean(requirements.arocRequired),
      }),
      publicMessage: 'Personnel mission eligibility could not be evaluated.',
    });
  }
}

module.exports = { ComplianceRepository };
