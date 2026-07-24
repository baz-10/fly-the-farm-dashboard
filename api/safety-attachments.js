const { createHash } = require('node:crypto');
const { authenticateRequest } = require('../server/session');
const {
  createHttpError,
  supabaseRawRequest,
  supabaseRequest,
} = require('../server/supabase');
const {
  MAX_ATTACHMENT_BYTES,
  assertAttachmentSize,
  assertSafeIdentifier,
  buildAttachmentPath,
  isAllowedAttachmentType,
  sanitiseAttachmentFileName,
} = require('../server/safetyAttachmentPolicy');

const BUCKET = 'ftf-safety-attachments';

function header(req, name) {
  const value = req.headers?.[name.toLowerCase()];
  if (Array.isArray(value)) throw createHttpError(400, `${name} is invalid.`);
  return String(value || '').trim();
}

function exactQueryValue(value, label) {
  if (Array.isArray(value)) throw createHttpError(400, `${label} is invalid.`);
  try {
    return assertSafeIdentifier(value);
  } catch {
    throw createHttpError(400, `${label} is invalid.`);
  }
}

function assertSameOrigin(req) {
  const origin = header(req, 'origin');
  if (!origin) {
    if (['POST', 'DELETE'].includes(req.method)) {
      throw createHttpError(403, 'A same-origin attachment request is required.');
    }
    return;
  }
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const proto = header(req, 'x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    throw createHttpError(403, 'Cross-origin attachment requests are not allowed.');
  }
  if (originUrl.host !== host || originUrl.protocol !== `${proto}:`) {
    throw createHttpError(403, 'Cross-origin attachment requests are not allowed.');
  }
}

function currentVersion(plan) {
  return Array.isArray(plan?.versions)
    ? plan.versions.find((version) => version?.id === plan.currentVersionId)
    : null;
}

function contractorAssigned(user, version) {
  return user.safetyPlanAuthority === true
    || version?.createdBy?.userId === user.id
    || (Array.isArray(version?.sourceSnapshot?.crew)
      && version.sourceSnapshot.crew.some((person) => person?.id === user.id));
}

function assertPlanAccess(user, plan, versionId, write = false) {
  if (!plan || plan.tenantId !== user.tenantId) {
    throw createHttpError(404, 'Safety Plan attachment was not found.');
  }
  if (!['admin', 'contractor'].includes(user.role)) {
    throw createHttpError(403, 'This account cannot access Safety Plan attachments.');
  }
  const version = currentVersion(plan);
  if (user.role === 'contractor' && !contractorAssigned(user, version)) {
    throw createHttpError(404, 'Safety Plan attachment was not found.');
  }
  if (!version || version.id !== versionId) {
    throw createHttpError(404, 'Safety Plan attachment was not found.');
  }
  if (write && (plan.status !== 'draft' || version.status !== 'draft')) {
    throw createHttpError(403, 'Only draft Safety Plan attachments can be changed.');
  }
  return version;
}

function hasExpectedMagicBytes(contentType, body) {
  if (contentType === 'application/pdf') {
    return body.length >= 5 && body.subarray(0, 5).equals(Buffer.from('%PDF-'));
  }
  if (contentType === 'image/jpeg') {
    return body.length >= 3
      && body[0] === 0xff
      && body[1] === 0xd8
      && body[2] === 0xff;
  }
  if (contentType === 'image/png') {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return body.length >= signature.length && body.subarray(0, signature.length).equals(signature);
  }
  return false;
}

function attachmentIdentityMatches(left, right) {
  return Boolean(left && right)
    && [
      'id',
      'tenantId',
      'versionId',
      'fileName',
      'contentType',
      'sizeBytes',
      'contentDigest',
      'source',
      'description',
    ].every((key) => (left[key] ?? null) === (right[key] ?? null))
    && ['userId', 'name', 'role', 'operationalAuthority'].every(
      (key) => (left.uploadedBy?.[key] ?? null) === (right.uploadedBy?.[key] ?? null)
    );
}

async function readRawBody(req, declaredLength) {
  if (Buffer.isBuffer(req.body) || req.body instanceof Uint8Array || typeof req.body === 'string') {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    if (body.length !== declaredLength) {
      throw createHttpError(400, 'Attachment body length does not match Content-Length.');
    }
    if (body.length > MAX_ATTACHMENT_BYTES) {
      throw createHttpError(413, 'Attachment exceeds the 3 MiB limit.');
    }
    return body;
  }
  if (req.body != null) {
    throw createHttpError(400, 'Attachment body must contain raw binary data.');
  }
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    received += buffer.length;
    if (received > MAX_ATTACHMENT_BYTES || received > declaredLength) {
      throw createHttpError(413, 'Attachment exceeds the declared size or 3 MiB limit.');
    }
    chunks.push(buffer);
  }
  if (received !== declaredLength) {
    throw createHttpError(400, 'Attachment body length does not match Content-Length.');
  }
  return Buffer.concat(chunks);
}

function encodeObjectPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function loadPlan(tenantId, planId) {
  const rows = await supabaseRequest(
    `rest/v1/ftf_store?tenant_id=eq.${encodeURIComponent(tenantId)}`
      + `&collection=eq.ftf_safety_plans&record_id=eq.${encodeURIComponent(planId)}`
      + '&select=payload&limit=1',
    { publicMessage: 'Safety Plan could not be loaded.' },
  );
  return Array.isArray(rows) ? rows[0]?.payload || null : null;
}

async function loadReceipt(tenantId, planId, versionId, attachmentId) {
  const recordId = `${planId}:${versionId}:${attachmentId}`;
  const rows = await supabaseRequest(
    `rest/v1/ftf_store?tenant_id=eq.${encodeURIComponent(tenantId)}`
      + '&collection=eq.ftf_safety_attachment_receipts'
      + `&record_id=eq.${encodeURIComponent(recordId)}&select=tenant_id,payload&limit=1`,
    { publicMessage: 'Attachment receipt could not be loaded.' },
  );
  const row = Array.isArray(rows)
    ? rows.find((candidate) => candidate?.tenant_id === tenantId)
    : null;
  return row?.payload || null;
}

async function putObject(path, body, contentType) {
  await supabaseRawRequest(
    `storage/v1/object/${BUCKET}/${encodeObjectPath(path)}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'x-upsert': 'false',
      },
      body,
      publicMessage: 'Attachment could not be stored.',
    },
  );
}

async function createReceipt(tenantId, plan, attachment, objectPath) {
  const rows = await supabaseRequest('rest/v1/rpc/ftf_create_safety_attachment_receipt', {
    method: 'POST',
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_plan_id: plan.id,
      p_version_id: plan.currentVersionId,
      p_attachment_id: attachment.id,
      p_attachment: attachment,
      p_object_path: objectPath,
    }),
    publicMessage: 'Attachment receipt could not be recorded.',
  });
  const receipt = Array.isArray(rows) ? rows[0] : rows;
  if (!receipt?.attachment || !attachmentIdentityMatches(receipt.attachment, attachment)) {
    throw createHttpError(409, 'Attachment id is already used by different evidence.');
  }
  return receipt.attachment;
}

async function removeAttachment(tenantId, plan, versionId, attachmentId, actor) {
  const occurredAt = new Date().toISOString();
  const auditId = require('node:crypto').randomUUID();
  const rows = await supabaseRequest('rest/v1/rpc/ftf_remove_safety_attachment', {
    method: 'POST',
    body: JSON.stringify({
      p_tenant_id: tenantId,
      p_plan_id: plan.id,
      p_version_id: versionId,
      p_attachment_id: attachmentId,
      p_actor: {
        userId: actor.id,
        name: actor.name,
        role: actor.role,
        operationalAuthority: actor.role === 'admin' || actor.safetyPlanAuthority === true,
      },
      p_audit_id: auditId,
      p_occurred_at: occurredAt,
    }),
    publicMessage: 'Attachment manifest could not be updated.',
  });
  const result = Array.isArray(rows) ? rows[0] : rows;
  if (!result?.attachment || !result?.plan) {
    throw createHttpError(404, 'Safety Plan attachment was not found.');
  }
  return result;
}

async function getObject(path) {
  const response = await supabaseRawRequest(
    `storage/v1/object/authenticated/${BUCKET}/${encodeObjectPath(path)}`,
    { publicMessage: 'Attachment could not be downloaded.' },
  );
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get('content-type') || 'application/octet-stream',
    contentLength: Number(response.headers.get('content-length') || 0),
  };
}

async function deleteObject(path) {
  await supabaseRawRequest(
    `storage/v1/object/${BUCKET}/${encodeObjectPath(path)}`,
    { method: 'DELETE', publicMessage: 'Attachment could not be deleted.' },
  );
}

function createSafetyAttachmentHandler(overrides = {}) {
  const deps = {
    authenticate: authenticateRequest,
    loadPlan,
    loadReceipt,
    putObject,
    getObject,
    deleteObject,
    createReceipt,
    removeAttachment,
    now: () => new Date().toISOString(),
    ...overrides,
  };

  return async function safetyAttachmentHandler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      assertSameOrigin(req);
      const user = await deps.authenticate(req, res);
      if (!['admin', 'contractor'].includes(user.role)) {
        throw createHttpError(403, 'This account cannot access Safety Plan attachments.');
      }

      if (req.method === 'POST') {
        const planId = exactQueryValue(header(req, 'x-safety-plan-id'), 'Safety Plan id');
        const versionId = exactQueryValue(
          header(req, 'x-safety-plan-version-id'),
          'Safety Plan version id',
        );
        const attachmentId = exactQueryValue(header(req, 'x-attachment-id'), 'Attachment id');
        const contentType = header(req, 'content-type').toLowerCase();
        const lengthHeader = header(req, 'content-length');
        if (!/^\d+$/.test(lengthHeader)) {
          throw createHttpError(411, 'A valid Content-Length header is required.');
        }
        const declaredLength = Number(lengthHeader);
        try {
          assertAttachmentSize(declaredLength);
        } catch {
          throw createHttpError(413, 'Attachments must be between 1 byte and 3 MiB.');
        }
        if (!isAllowedAttachmentType(contentType)) {
          throw createHttpError(415, 'Choose a PDF, JPEG or PNG attachment.');
        }
        const plan = await deps.loadPlan(user.tenantId, planId);
        assertPlanAccess(user, plan, versionId, true);
        const fileName = sanitiseAttachmentFileName(header(req, 'x-file-name'));
        const description = header(req, 'x-attachment-description').slice(0, 1000);
        const body = await readRawBody(req, declaredLength);
        if (!hasExpectedMagicBytes(contentType, body)) {
          throw createHttpError(415, 'Attachment content does not match its PDF or image type.');
        }
        const path = buildAttachmentPath(
          user.tenantId,
          planId,
          versionId,
          attachmentId,
          fileName,
        );
        const candidate = {
          id: attachmentId,
          tenantId: user.tenantId,
          versionId,
          fileName,
          contentType,
          sizeBytes: body.length,
          contentDigest: createHash('sha256').update(body).digest('hex'),
          source: 'upload',
          ...(description ? { description } : {}),
          uploadedBy: {
            userId: user.id,
            name: user.name,
            role: user.role,
            operationalAuthority: user.role === 'admin' || user.safetyPlanAuthority === true,
          },
          uploadedAt: deps.now(),
        };
        const existing = (currentVersion(plan)?.attachments || [])
          .find((attachment) => attachment?.id === attachmentId);
        if (existing) {
          if (!attachmentIdentityMatches(existing, candidate)) {
            throw createHttpError(409, 'Attachment id is already used by different evidence.');
          }
          return res.status(200).json({ attachment: existing });
        }
        const existingReceipt = await deps.loadReceipt(
          user.tenantId,
          planId,
          versionId,
          attachmentId,
        );
        if (existingReceipt) {
          if (
            existingReceipt.status !== 'stored'
            || !attachmentIdentityMatches(existingReceipt.attachment, candidate)
          ) {
            throw createHttpError(409, 'Attachment id is already used by different evidence.');
          }
          return res.status(200).json({ attachment: existingReceipt.attachment });
        }
        let requestCreatedObject = false;
        try {
          await deps.putObject(path, body, contentType);
          requestCreatedObject = true;
        } catch (error) {
          if (error?.statusCode !== 409) throw error;
          const storedObject = await deps.getObject(path);
          const existingDigest = createHash('sha256').update(storedObject.body).digest('hex');
          if (
            existingDigest !== candidate.contentDigest
            || storedObject.contentType !== contentType
          ) {
            throw createHttpError(409, 'Attachment id is already used by different evidence.');
          }
        }
        let attachment;
        try {
          attachment = await deps.createReceipt(user.tenantId, plan, candidate, path);
        } catch (error) {
          if (requestCreatedObject) {
            let confirmedReceipt;
            try {
              confirmedReceipt = await deps.loadReceipt(
                user.tenantId,
                planId,
                versionId,
                attachmentId,
              );
            } catch {
              // The receipt transaction outcome is ambiguous. Preserve bytes
              // because deleting them could break a committed canonical receipt.
              throw error;
            }
            if (confirmedReceipt) {
              if (
                confirmedReceipt.status === 'stored'
                && attachmentIdentityMatches(confirmedReceipt.attachment, candidate)
              ) {
                return res.status(200).json({
                  attachment: confirmedReceipt.attachment,
                });
              }
              throw createHttpError(409, 'Attachment id is already used by different evidence.');
            }
            try {
              await deps.deleteObject(path);
            } catch (cleanupError) {
              if (cleanupError?.statusCode === 404) throw error;
              throw createHttpError(
                503,
                'Attachment upload could not be finalised and cleanup must be retried.',
              );
            }
          }
          throw error;
        }
        return res.status(201).json({
          attachment,
        });
      }

      const planId = exactQueryValue(req.query?.planId, 'Safety Plan id');
      const versionId = exactQueryValue(req.query?.versionId, 'Safety Plan version id');
      const plan = await deps.loadPlan(user.tenantId, planId);
      const version = assertPlanAccess(user, plan, versionId, req.method === 'DELETE');

      if (req.method === 'GET' && !req.query?.attachmentId) {
        return res.status(200).json({
          attachments: (version.attachments || []).filter((attachment) =>
            attachment?.tenantId === user.tenantId && attachment?.versionId === versionId
          ),
        });
      }

      const attachmentId = exactQueryValue(req.query?.attachmentId, 'Attachment id');

      if (req.method === 'DELETE') {
        const result = await deps.removeAttachment(
          user.tenantId,
          plan,
          versionId,
          attachmentId,
          user,
        );
        const attachment = result.attachment;
        const deletePath = buildAttachmentPath(
          user.tenantId,
          planId,
          versionId,
          attachmentId,
          attachment.fileName,
        );
        try {
          await deps.deleteObject(deletePath);
        } catch (error) {
          if (error?.statusCode !== 404) throw error;
        }
        return res.status(200).json({
          ok: true,
          changed: result.changed === true,
          plan: result.plan,
        });
      }

      const attachment = (version.attachments || []).find((item) => item?.id === attachmentId);
      if (!attachment || attachment.tenantId !== user.tenantId || attachment.versionId !== versionId) {
        throw createHttpError(404, 'Safety Plan attachment was not found.');
      }
      const path = buildAttachmentPath(
        user.tenantId,
        planId,
        versionId,
        attachmentId,
        attachment.fileName,
      );

      if (req.method === 'GET') {
        const object = await deps.getObject(path);
        res.setHeader('Content-Type', attachment.contentType || object.contentType);
        res.setHeader('Content-Length', String(object.body.length));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${sanitiseAttachmentFileName(attachment.fileName).replace(/"/g, '')}"`,
        );
        return res.status(200).end(object.body);
      }
      res.setHeader('Allow', 'GET,POST,DELETE');
      throw createHttpError(405, 'Method not allowed.');
    } catch (error) {
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      return res.status(status).json({
        error: error?.publicMessage || 'Safety Plan attachment request failed.',
      });
    }
  };
}

const handler = createSafetyAttachmentHandler();
module.exports = handler;
module.exports.createSafetyAttachmentHandler = createSafetyAttachmentHandler;
