const crypto = require('crypto');
const { getSupabaseConfig, supabaseRequest } = require('./supabase');
const { renderReportPdf } = require('./report-renderer');

class ReportWorkerRepository {
  async claim(workerId) {
    return supabaseRequest('rest/v1/rpc/ftf_claim_report_generation_job', { method: 'POST', body: JSON.stringify({ p_worker_id: workerId, p_lease_seconds: 120 }), publicMessage: 'Report job could not be claimed.' });
  }

  async store(job, bytes) {
    const artefact = job.artefact;
    const internalFileId = crypto.randomUUID();
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    const bucket = 'generated-reports';
    const name = `${artefact.report_type.toLowerCase()}-v${artefact.version_number}.pdf`;
    const key = `${artefact.organisation_id}/${artefact.mission_id}/${artefact.id}/${internalFileId}/${name}`;
    await supabaseRequest(`storage/v1/object/${bucket}/${key}`, { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, publicMessage: 'Generated report could not be stored.' });
    return { internalFileId, fileVersion: 1, originalFilename: name, contentType: 'application/pdf', byteSize: bytes.length, checksum, storageProvider: 'supabase', storageBucket: bucket, providerKey: key };
  }

  async loadLogo(job) {
    const artefact = job.artefact;
    const profile = artefact.branding_snapshot?.profile || {};
    const fileId = profile.active_logo_file_id;
    const fileVersion = profile.active_logo_file_version;
    if (!fileId || !fileVersion) return null;
    const query = `rest/v1/organisation_logo_files?organisation_id=eq.${encodeURIComponent(artefact.organisation_id)}&internal_file_id=eq.${encodeURIComponent(fileId)}&file_version=eq.${encodeURIComponent(fileVersion)}&select=content_type,sha256_checksum,storage_bucket,provider_key&limit=1`;
    const records = await supabaseRequest(query, { publicMessage: 'Organisation logo could not be loaded for the report.' });
    const record = records?.[0];
    if (!record) return null;
    const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${record.storage_bucket}/${record.provider_key}`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
    if (!response.ok) throw new Error('Organisation logo could not be loaded for the report.');
    const bytes = Buffer.from(await response.arrayBuffer());
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    if (checksum !== record.sha256_checksum) throw new Error('Organisation logo integrity check failed.');
    return { bytes, contentType: record.content_type };
  }

  async complete(jobId, artefactId, file) {
    return supabaseRequest('rest/v1/rpc/ftf_complete_report_generation_job', { method: 'POST', body: JSON.stringify({ p_job_id: jobId, p_artefact_id: artefactId, p_file: file }), publicMessage: 'Report completion could not be retained.' });
  }

  async fail(jobId, artefactId, code, message) {
    return supabaseRequest('rest/v1/rpc/ftf_fail_report_generation_job', { method: 'POST', body: JSON.stringify({ p_job_id: jobId, p_artefact_id: artefactId, p_error_code: code, p_error_message: message }), publicMessage: 'Report failure could not be retained.' });
  }
}

async function processNextReportJob({ workerId, repository = new ReportWorkerRepository(), renderer = renderReportPdf }) {
  const job = await repository.claim(workerId);
  if (!job?.id) return { processed: false };
  try {
    const artefact = job.artefact;
    let branding = artefact.branding_snapshot || {};
    const logo = repository.loadLogo ? await repository.loadLogo(job) : null;
    if (logo) branding = { ...branding, logoData: logo.bytes, logoType: logo.contentType };
    const bytes = renderer({
      reportType: artefact.report_type,
      templateVersion: artefact.template_version,
      branding,
      evidence: artefact.evidence_manifest,
      artefact: { id: artefact.id, version: artefact.version_number, createdAt: artefact.created_at },
    });
    const file = await repository.store(job, bytes);
    await repository.complete(job.id, artefact.id, file);
    return { processed: true, jobId: job.id, artefactId: artefact.id };
  } catch {
    await repository.fail(job.id, job.artefact.id, 'RENDER_FAILED', 'Report generation failed.');
    return { processed: false, jobId: job.id, failed: true };
  }
}

module.exports = { ReportWorkerRepository, processNextReportJob };
