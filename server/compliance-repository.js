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
