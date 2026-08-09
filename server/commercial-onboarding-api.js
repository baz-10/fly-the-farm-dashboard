const crypto = require('crypto');
const { resolvePlatformRequestContext } = require('./platform-request-context');
const { supabaseRequest } = require('./supabase');

const MAX_BODY_BYTES = 24 * 1024;
const APPLICATION_READ = 'platform.onboarding.application.read';
const APPLICATION_REVIEW = 'platform.onboarding.application.review';
const INVITATION_ISSUE = 'platform.onboarding.invitation.issue';
const INVITATION_REVOKE = 'platform.onboarding.invitation.revoke';

function apiError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function first(value) { return Array.isArray(value) ? value[0] : value; }

async function rpc(name, body) {
  return first(await supabaseRequest(`rest/v1/rpc/${name}`, {
    method: 'POST', body: JSON.stringify(body), publicMessage: 'Commercial onboarding could not be updated.',
  }));
}

class CommercialOnboardingRepository {
  submitApplication(application) {
    return rpc('ftf_submit_commercial_application', { p_application: application });
  }

  reviewApplication(applicationId, platformUserId, expectedVersion, decision, notes) {
    return rpc('ftf_review_commercial_application', {
      p_application_id: applicationId, p_platform_user_id: platformUserId,
      p_expected_version: expectedVersion, p_decision: decision, p_notes: notes || null,
    });
  }

  issueInvitation(applicationId, platformUserId, expectedVersion, token, notes, expiresAt) {
    return rpc('ftf_issue_commercial_invitation', {
      p_application_id: applicationId, p_platform_user_id: platformUserId,
      p_expected_application_version: expectedVersion, p_token: token,
      p_notes: notes || null, p_expires_at: expiresAt,
    });
  }

  revokeInvitation(invitationId, platformUserId, expectedVersion, reason) {
    return rpc('ftf_revoke_commercial_invitation', {
      p_invitation_id: invitationId, p_platform_user_id: platformUserId,
      p_expected_version: expectedVersion, p_reason: reason,
    });
  }

  async listApplications() {
    const applicationSelect = 'id,application_reference,business_name,intended_administrator_name,intended_administrator_email,intended_administrator_phone,submitted_payload,consent_version,application_notes,status,row_version,submitted_at,updated_at,reviewed_by_platform_user_id,reviewed_at,decision_notes';
    const eventSelect = 'id,application_id,event_type,from_status,to_status,actor_platform_user_id,event_payload,created_at';
    const invitationSelect = 'id,application_id,status,issued_by_platform_user_id,issuance_notes,expires_at,sent_at,revoked_at,revoked_by_platform_user_id,revocation_reason,accepted_at,resulting_organisation_id,resulting_organisation_reference,row_version,created_at,updated_at';
    const invitationEventSelect = 'id,invitation_id,application_id,event_type,from_status,to_status,actor_platform_user_id,event_payload,created_at';
    const applications = await supabaseRequest(`rest/v1/commercial_onboarding_applications?select=${encodeURIComponent(applicationSelect)}&order=submitted_at.desc&limit=100`, { publicMessage: 'Applications could not be loaded.' });
    if (!applications?.length) return [];
    const applicationFilter = applications.map((application) => encodeURIComponent(application.id)).join(',');
    const [events, invitations] = await Promise.all([
      supabaseRequest(`rest/v1/commercial_onboarding_application_events?application_id=in.(${applicationFilter})&select=${encodeURIComponent(eventSelect)}&order=created_at.asc`, { publicMessage: 'Application history could not be loaded.' }),
      supabaseRequest(`rest/v1/commercial_onboarding_invitations?application_id=in.(${applicationFilter})&select=${encodeURIComponent(invitationSelect)}&order=created_at.desc`, { publicMessage: 'Invitation evidence could not be loaded.' }),
    ]);
    const invitationFilter = (invitations || []).map((invitation) => encodeURIComponent(invitation.id)).join(',');
    const invitationEvents = invitationFilter ? await supabaseRequest(`rest/v1/commercial_onboarding_invitation_events?invitation_id=in.(${invitationFilter})&select=${encodeURIComponent(invitationEventSelect)}&order=created_at.asc`, { publicMessage: 'Invitation history could not be loaded.' }) : [];
    const actorIds = new Set();
    for (const application of applications) if (application.reviewed_by_platform_user_id) actorIds.add(application.reviewed_by_platform_user_id);
    for (const event of [...(events || []), ...(invitationEvents || [])]) if (event.actor_platform_user_id) actorIds.add(event.actor_platform_user_id);
    for (const invitation of invitations || []) {
      if (invitation.issued_by_platform_user_id) actorIds.add(invitation.issued_by_platform_user_id);
      if (invitation.revoked_by_platform_user_id) actorIds.add(invitation.revoked_by_platform_user_id);
    }
    const actorFilter = [...actorIds].map((id) => encodeURIComponent(id)).join(',');
    const actors = actorFilter ? await supabaseRequest(`rest/v1/platform_users?id=in.(${actorFilter})&select=id,display_name`, { publicMessage: 'Platform actor evidence could not be loaded.' }) : [];
    const actorNames = new Map((actors || []).map((actor) => [actor.id, actor.display_name]));
    return (applications || []).map((application) => ({
      ...application,
      reviewer: application.reviewed_by_platform_user_id ? { id: application.reviewed_by_platform_user_id, display_name: actorNames.get(application.reviewed_by_platform_user_id) || 'Platform user' } : null,
      application_events: (events || []).filter((event) => event.application_id === application.id).map((event) => ({ ...event, actor: event.actor_platform_user_id ? { id: event.actor_platform_user_id, display_name: actorNames.get(event.actor_platform_user_id) || 'Platform user' } : null })),
      invitations: (invitations || []).filter((invitation) => invitation.application_id === application.id).map((invitation) => ({
        ...invitation,
        issuer: invitation.issued_by_platform_user_id ? { id: invitation.issued_by_platform_user_id, display_name: actorNames.get(invitation.issued_by_platform_user_id) || 'Platform user' } : null,
        revoker: invitation.revoked_by_platform_user_id ? { id: invitation.revoked_by_platform_user_id, display_name: actorNames.get(invitation.revoked_by_platform_user_id) || 'Platform user' } : null,
        invitation_events: (invitationEvents || []).filter((event) => event.invitation_id === invitation.id).map((event) => ({ ...event, actor: event.actor_platform_user_id ? { id: event.actor_platform_user_id, display_name: actorNames.get(event.actor_platform_user_id) || 'Platform user' } : null })),
      })),
    }));
  }
}

function correlationId(req) {
  const supplied = String(req.correlationId || req.headers?.['x-request-id'] || '');
  return /^[A-Za-z0-9._:-]{8,100}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function enforceSameOrigin(req) {
  if (String(req.headers?.['sec-fetch-site'] || '').toLowerCase() === 'cross-site') throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.');
  const origin = String(req.headers?.origin || '').trim();
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  if (!origin || !host) throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.');
  const forwardedProtocol = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProtocol || (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  let trustedOrigin;
  try { trustedOrigin = new URL(`${protocol}://${host}`).origin; } catch { throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.'); }
  if (origin !== trustedOrigin) throw apiError(403, 'CROSS_ORIGIN_REQUEST', 'Request origin is not allowed.');
}

function parseBody(req) {
  const declaredLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    throw apiError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw apiError(400, 'INVALID_BODY', 'Request body is invalid.');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_BODY_BYTES) throw apiError(413, 'PAYLOAD_TOO_LARGE', 'Request payload is too large.');
  return body;
}

function plainText(value, minimum, maximum) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= minimum && text.length <= maximum && !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) ? text : null;
}

function validTimezone(value) {
  const timezone = plainText(value, 1, 100);
  if (!timezone) return null;
  try { new Intl.DateTimeFormat('en-AU', { timeZone: timezone }).format(); return timezone; } catch { return null; }
}

function normalizeApplication(body) {
  const base = body.base && typeof body.base === 'object' && !Array.isArray(body.base) ? body.base : {};
  const latitude = Number(base.latitude);
  const longitude = Number(base.longitude);
  const application = {
    businessName: plainText(body.businessName, 2, 200),
    administratorName: plainText(body.administratorName, 2, 200),
    administratorEmail: typeof body.administratorEmail === 'string' ? body.administratorEmail.trim().toLowerCase() : '',
    administratorPhone: plainText(body.administratorPhone, 5, 50),
    base: {
      name: plainText(base.name, 2, 200), address: plainText(base.address, 3, 500),
      latitude, longitude, timezone: validTimezone(base.timezone),
      addressSource: base.addressSource === 'MANUALLY_ADJUSTED' ? 'MANUALLY_ADJUSTED' : base.addressSource === 'GEOCODED' ? 'GEOCODED' : null,
      locationConfirmedAt: typeof base.locationConfirmedAt === 'string' && Number.isFinite(Date.parse(base.locationConfirmedAt)) ? base.locationConfirmedAt : null,
    },
    consentVersion: plainText(body.consentVersion, 1, 100),
    notes: body.notes == null || body.notes === '' ? '' : plainText(body.notes, 1, 4000),
  };
  const valid = application.businessName && application.administratorName && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.administratorEmail)
    && application.administratorEmail.length <= 320 && application.administratorPhone
    && application.base.name && application.base.address && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 && application.base.timezone
    && application.base.addressSource && application.base.locationConfirmedAt && application.consentVersion && application.notes !== null;
  if (!valid) throw apiError(400, 'APPLICATION_INVALID', 'Check the application details and confirm the Base location.');
  return application;
}

function requirePermission(context, permission) {
  if (!context.permissions?.includes(permission)) throw apiError(403, 'FORBIDDEN', 'Required Platform permission is missing.');
}

function requiredText(body, field, minimum = 1, maximum = 4000) {
  const value = plainText(body[field], minimum, maximum);
  if (!value) throw apiError(400, 'ACTION_INVALID', 'Required decision evidence is missing.');
  return value;
}

function requiredVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) throw apiError(400, 'ACTION_INVALID', 'Expected version is invalid.');
  return version;
}

function checkDomainResult(result) {
  if (result?.not_found) throw apiError(404, 'NOT_FOUND', 'Onboarding record was not found.');
  if (result?.conflict) throw apiError(409, 'VERSION_CONFLICT', 'This onboarding record changed. Reload it and try again.');
  if (result?.code) {
    const code = String(result.code).toUpperCase();
    if (code.endsWith('_FORBIDDEN')) throw apiError(403, 'FORBIDDEN', 'The transition is not permitted.');
    if (code.includes('REQUIRED') || code.includes('EXISTS') || code.includes('ACCEPTED')) throw apiError(409, code, 'The onboarding record is not in the required state.');
    throw apiError(400, code, 'The onboarding transition is invalid.');
  }
  return result;
}

function safeActor(actor) { return actor ? { id: actor.id || null, name: actor.display_name || 'Platform user' } : null; }
function safeEvent(event) { return { id: event.id, type: event.event_type, fromStatus: event.from_status, toStatus: event.to_status, actor: safeActor(event.actor), notes: event.event_payload?.notes || event.event_payload?.reason || null, createdAt: event.created_at }; }
function safeInvitation(invitation) {
  return {
    id: invitation.id, status: invitation.status, rowVersion: invitation.row_version,
    issuedBy: safeActor(invitation.issuer), issuanceNotes: invitation.issuance_notes || null,
    createdAt: invitation.created_at, sentAt: invitation.sent_at, expiresAt: invitation.expires_at,
    revokedAt: invitation.revoked_at, revokedBy: safeActor(invitation.revoker), revocationReason: invitation.revocation_reason || null,
    acceptedAt: invitation.accepted_at,
    resultingOrganisation: invitation.status === 'ACCEPTED' ? { id: invitation.resulting_organisation_id, reference: invitation.resulting_organisation_reference } : null,
    events: (invitation.invitation_events || []).map(safeEvent),
  };
}
function safeApplication(application) {
  const payload = application.submitted_payload || {};
  return {
    id: application.id, applicationReference: application.application_reference,
    businessName: application.business_name, administrator: {
      name: application.intended_administrator_name, email: application.intended_administrator_email,
      phone: application.intended_administrator_phone,
    },
    base: payload.base ? { name: payload.base.name, address: payload.base.address, latitude: payload.base.latitude, longitude: payload.base.longitude, timezone: payload.base.timezone, addressSource: payload.base.addressSource } : null,
    consentVersion: application.consent_version, applicationNotes: application.application_notes || null,
    status: application.status, rowVersion: application.row_version, submittedAt: application.submitted_at, updatedAt: application.updated_at,
    reviewedAt: application.reviewed_at, reviewedBy: safeActor(application.reviewer), decisionNotes: application.decision_notes || null,
    events: (application.application_events || []).map(safeEvent), invitations: (application.invitations || []).map(safeInvitation),
  };
}

function createCommercialOnboardingHandler(dependencies = {}) {
  const repository = dependencies.repository || new CommercialOnboardingRepository();
  const getPlatformContext = dependencies.resolvePlatformContext || resolvePlatformRequestContext;
  const randomToken = dependencies.randomToken || (() => crypto.randomBytes(32).toString('base64url'));
  const now = dependencies.now || (() => new Date());
  return async function commercialOnboardingHandler(req, res) {
    const requestCorrelationId = correlationId(req);
    req.correlationId = requestCorrelationId;
    res.setHeader('X-Correlation-ID', requestCorrelationId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const action = String(req.query?.action || (req.method === 'GET' ? 'list' : ''));
      if (req.method === 'GET') {
        if (action !== 'list') throw apiError(400, 'UNSUPPORTED_ACTION', 'Unsupported commercial onboarding action.');
        const context = await getPlatformContext(req, res);
        requirePermission(context, APPLICATION_READ);
        return res.status(200).json({ data: (await repository.listApplications()).map(safeApplication), meta: { correlationId: requestCorrelationId } });
      }
      if (req.method !== 'POST') throw apiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
      enforceSameOrigin(req);
      const body = parseBody(req);
      if (action === 'apply') {
        const result = checkDomainResult(await repository.submitApplication(normalizeApplication(body)));
        if (!result?.submitted) throw apiError(400, 'APPLICATION_INVALID', 'Check the application details and try again.');
        return res.status(201).json({ data: { submitted: true, applicationReference: result.application_reference }, meta: { correlationId: requestCorrelationId } });
      }

      const context = await getPlatformContext(req, res);
      if (['review', 'approve', 'decline'].includes(action)) {
        requirePermission(context, APPLICATION_REVIEW);
        const decision = action === 'review' ? 'UNDER_REVIEW' : action === 'approve' ? 'APPROVE' : 'DECLINE';
        const result = checkDomainResult(await repository.reviewApplication(requiredText(body, 'applicationId', 1, 100), context.platformUser.id, requiredVersion(body.expectedVersion), decision, requiredText(body, 'notes', 3, 4000)));
        return res.status(200).json({ data: result, meta: { correlationId: requestCorrelationId } });
      }
      if (action === 'issue' || action === 'resend') {
        requirePermission(context, INVITATION_ISSUE);
        const token = randomToken();
        const requestedExpiry = body.expiresAt ? new Date(body.expiresAt) : new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000);
        if (!Number.isFinite(requestedExpiry.getTime()) || requestedExpiry.getTime() <= now().getTime() || requestedExpiry.getTime() > now().getTime() + 31 * 24 * 60 * 60 * 1000) throw apiError(400, 'ACTION_INVALID', 'Invitation expiry is invalid.');
        const result = checkDomainResult(await repository.issueInvitation(requiredText(body, 'applicationId', 1, 100), context.platformUser.id, requiredVersion(body.expectedVersion), token, requiredText(body, 'notes', 3, 4000), requestedExpiry.toISOString()));
        return res.status(201).json({ data: { ...result, invitationPath: `/onboarding/accept?token=${encodeURIComponent(token)}` }, meta: { correlationId: requestCorrelationId } });
      }
      if (action === 'revoke') {
        requirePermission(context, INVITATION_REVOKE);
        const result = checkDomainResult(await repository.revokeInvitation(requiredText(body, 'invitationId', 1, 100), context.platformUser.id, requiredVersion(body.expectedVersion), requiredText(body, 'reason', 3, 2000)));
        return res.status(200).json({ data: result, meta: { correlationId: requestCorrelationId } });
      }
      throw apiError(400, 'UNSUPPORTED_ACTION', 'Unsupported commercial onboarding action.');
    } catch (error) {
      const status = error.statusCode || 500;
      const code = error.code || (status === 401 ? 'UNAUTHENTICATED' : status === 403 ? 'FORBIDDEN' : 'INTERNAL_ERROR');
      const message = status < 500 ? (error.publicMessage || error.message) : 'Commercial onboarding request failed.';
      return res.status(status).json({ error: { code, message, correlationId: requestCorrelationId } });
    }
  };
}

module.exports = { CommercialOnboardingRepository, createCommercialOnboardingHandler };
