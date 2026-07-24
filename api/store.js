const { authenticateRequest } = require('../server/session');
const { createHttpError, supabaseRequest } = require('../server/supabase');

const TABLE_NAME = 'ftf_store';
const SINGLETON_RECORD_ID = '__value__';
const MAX_RECORDS_PER_WRITE = 500;
const COLLECTION_POLICIES = {
  ftf_aircraft_data: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_missions: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_mission_templates: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_maintenance: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_pmav_checks: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_work_packs: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_safety_plan_templates: { read: ['admin', 'contractor'], write: ['admin'] },
  ftf_safety_plans: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
  ftf_safety_plan_audit: { read: ['admin', 'contractor'], write: ['admin', 'contractor'] },
};
const ALLOWED_COLLECTIONS = new Set(Object.keys(COLLECTION_POLICIES));
const SAFETY_PLAN_COLLECTION = 'ftf_safety_plans';
const SAFETY_PLAN_AUDIT_COLLECTION = 'ftf_safety_plan_audit';

function redactAssetCosts(asset) {
  if (!asset || typeof asset !== 'object') return asset;
  const { costs: _costs, ...safeAsset } = asset;
  return safeAsset;
}

function redactDeploymentWorkPack(workPack) {
  if (!workPack || typeof workPack !== 'object') return workPack;
  const { estimatedDeploymentCost: _estimatedDeploymentCost, ...safeWorkPack } = workPack;
  return {
    ...safeWorkPack,
    assets: Array.isArray(workPack.assets) ? workPack.assets.map(redactAssetCosts) : workPack.assets,
  };
}

function redactMaintenanceCosts(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    records: Array.isArray(payload.records)
      ? payload.records.map((record) => {
        const { cost: _cost, ...safeRecord } = record || {};
        return safeRecord;
      })
      : payload.records,
  };
}

function contractorSafePayload(collection, payload) {
  if (!payload || typeof payload !== 'object') return payload;
  if (collection === 'ftf_missions') {
    const {
      financialEstimate: _financialEstimate,
      financialActual: _financialActual,
      ...safePayload
    } = payload;
    return { ...safePayload, deploymentWorkPack: redactDeploymentWorkPack(payload.deploymentWorkPack) };
  }
  if (collection === 'ftf_work_packs') {
    return {
      ...payload,
      assets: Array.isArray(payload.assets) ? payload.assets.map(redactAssetCosts) : payload.assets,
      trucks: Array.isArray(payload.trucks) ? payload.trucks.map(redactAssetCosts) : payload.trucks,
    };
  }
  if (collection === 'ftf_maintenance') return redactMaintenanceCosts(payload);
  return payload;
}

function preserveAssetCosts(incomingAssets, storedAssets) {
  if (!Array.isArray(incomingAssets)) return incomingAssets;
  const storedById = new Map((Array.isArray(storedAssets) ? storedAssets : []).map((asset) => [asset?.id, asset]));
  return incomingAssets.map((asset) => {
    const safeAsset = redactAssetCosts(asset);
    const storedCosts = storedById.get(asset?.id)?.costs;
    return storedCosts === undefined ? safeAsset : { ...safeAsset, costs: storedCosts };
  });
}

function preserveMaintenanceCosts(incomingRecords, storedRecords) {
  if (!Array.isArray(incomingRecords)) return incomingRecords;
  const storedById = new Map((Array.isArray(storedRecords) ? storedRecords : []).map((record) => [record?.id, record]));
  return incomingRecords.map((record) => {
    const { cost: _cost, ...safeRecord } = record || {};
    const storedCost = storedById.get(record?.id)?.cost;
    return storedCost === undefined ? safeRecord : { ...safeRecord, cost: storedCost };
  });
}

function contractorWritePayload(collection, incoming, stored) {
  const safe = contractorSafePayload(collection, incoming);
  if (collection === 'ftf_missions') {
    const restoredFinancials = {
      ...(stored?.financialEstimate === undefined
        ? {}
        : { financialEstimate: stored.financialEstimate }),
      ...(stored?.financialActual === undefined
        ? {}
        : { financialActual: stored.financialActual }),
    };
    if (!safe?.deploymentWorkPack) {
      return { ...safe, ...restoredFinancials };
    }
    const storedWorkPack = stored?.deploymentWorkPack;
    return {
      ...safe,
      ...restoredFinancials,
      deploymentWorkPack: {
        ...safe.deploymentWorkPack,
        assets: preserveAssetCosts(safe.deploymentWorkPack.assets, storedWorkPack?.assets),
        ...(storedWorkPack?.estimatedDeploymentCost === undefined
          ? {}
          : { estimatedDeploymentCost: storedWorkPack.estimatedDeploymentCost }),
      },
    };
  }
  if (collection === 'ftf_work_packs') {
    return {
      ...safe,
      assets: preserveAssetCosts(safe.assets, stored?.assets),
      trucks: preserveAssetCosts(safe.trucks, stored?.trucks),
    };
  }
  if (collection === 'ftf_maintenance') {
    return {
      ...safe,
      records: preserveMaintenanceCosts(safe.records, stored?.records),
    };
  }
  return safe;
}

function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function validateCollection(value) {
  const collection = String(value || '').trim();
  if (!ALLOWED_COLLECTIONS.has(collection)) {
    throw createHttpError(400, 'Invalid collection name.');
  }
  return collection;
}

function assertCollectionPermission(user, collection, action) {
  const roles = COLLECTION_POLICIES[collection]?.[action] || [];
  if (!roles.includes(user.role)) {
    const message = collection.startsWith('ftf_safety_plan_')
      ? 'This account cannot access the requested storage collection.'
      : 'This account cannot access mission workflow storage.';
    throw createHttpError(403, message);
  }
}

function isSafetyPlanAuthority(user) {
  return user.role === 'admin'
    || (user.role === 'contractor' && user.safetyPlanAuthority === true);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalise(value) {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalise(value[key])])
  );
}

function valuesEqual(left, right) {
  return JSON.stringify(canonicalise(left)) === JSON.stringify(canonicalise(right));
}

function assertUniqueIds(records, label) {
  const ids = records.map((record) => record?.id);
  if (new Set(ids).size !== ids.length) {
    throw createHttpError(400, `${label} ids must be unique.`);
  }
}

function immutableVersionContent(version) {
  if (!isObject(version)) return version;
  const {
    status: _status,
    revision: _revision,
    updatedAt: _updatedAt,
    ...content
  } = version;
  return content;
}

function assertIncomingPlanShape(actor, incoming, recordId) {
  if (!isObject(incoming) || incoming.id !== recordId) {
    throw createHttpError(400, 'Safety Plan id must match its record id.');
  }
  if (incoming.tenantId !== actor.tenantId) {
    throw createHttpError(403, 'Safety Plan tenant ownership cannot be changed.');
  }
  if (!Array.isArray(incoming.versions)) {
    throw createHttpError(400, 'Safety Plan versions must be an array.');
  }
  assertUniqueIds(incoming.versions, 'Safety Plan version');
  if (incoming.status === 'not_required') {
    if (incoming.currentVersionId) {
      throw createHttpError(400, 'A not-required Safety Plan cannot have a current version.');
    }
    return;
  }
  const current = incoming.versions.find((version) => version?.id === incoming.currentVersionId);
  if (!current || current.status !== incoming.status) {
    throw createHttpError(400, 'Safety Plan status must match its current version.');
  }
  for (const version of incoming.versions) {
    if (!isObject(version) || !version.id || version.planId !== incoming.id) {
      throw createHttpError(400, 'Safety Plan version identity is invalid.');
    }
    if (!Number.isSafeInteger(version.revision) || version.revision < 1) {
      throw createHttpError(400, 'Safety Plan revision is invalid.');
    }
  }
}

function assertVersionTransition(actor, storedVersion, incomingVersion) {
  if (!incomingVersion) {
    if (['approved', 'superseded'].includes(storedVersion.status)) {
      throw createHttpError(403, 'Approved and superseded Safety Plan versions cannot be deleted.');
    }
    if (actor.role !== 'admin') {
      throw createHttpError(403, 'Only administrators may delete draft Safety Plan versions.');
    }
    return;
  }
  if (incomingVersion.planId !== storedVersion.planId) {
    throw createHttpError(403, 'Safety Plan version ownership cannot be changed.');
  }
  if (valuesEqual(storedVersion, incomingVersion)) return;

  if (storedVersion.status === 'superseded') {
    throw createHttpError(403, 'Superseded Safety Plan versions are immutable.');
  }
  if (storedVersion.status === 'approved') {
    const isSuperseding = incomingVersion.status === 'superseded'
      && isSafetyPlanAuthority(actor)
      && valuesEqual(
        immutableVersionContent(storedVersion),
        immutableVersionContent(incomingVersion)
      );
    if (!isSuperseding) {
      throw createHttpError(403, 'Approved Safety Plan snapshots are immutable.');
    }
  } else {
    const allowedStatuses = storedVersion.status === 'draft'
      ? ['draft', 'submitted']
      : ['draft', 'submitted', 'approved'];
    if (!allowedStatuses.includes(incomingVersion.status)) {
      throw createHttpError(403, 'Safety Plan workflow transition is not permitted.');
    }
    if (incomingVersion.status === 'approved' && !isSafetyPlanAuthority(actor)) {
      throw createHttpError(403, 'Only a Safety Plan authority may approve a plan.');
    }
  }

  if (incomingVersion.revision !== storedVersion.revision + 1) {
    throw createHttpError(409, 'Safety Plan revision is stale.');
  }
}

function assertSafetyPlanTransition({ actor, stored, incoming, recordId }) {
  assertIncomingPlanShape(actor, incoming, recordId);

  if (!stored) {
    if (!['draft', 'not_required'].includes(incoming.status)) {
      throw createHttpError(403, 'A new Safety Plan must start as a draft.');
    }
    if (incoming.versions.some((version) => version.status !== 'draft' || version.revision !== 1)) {
      throw createHttpError(403, 'A new Safety Plan may contain only initial draft versions.');
    }
    return;
  }
  if (stored.tenantId !== actor.tenantId || incoming.tenantId !== stored.tenantId) {
    throw createHttpError(403, 'Safety Plan tenant ownership cannot be changed.');
  }
  if (incoming.id !== stored.id || incoming.jobId !== stored.jobId) {
    throw createHttpError(403, 'Safety Plan identity cannot be changed.');
  }

  const incomingById = new Map(incoming.versions.map((version) => [version?.id, version]));
  for (const storedVersion of stored.versions || []) {
    assertVersionTransition(actor, storedVersion, incomingById.get(storedVersion?.id));
  }

  const storedIds = new Set((stored.versions || []).map((version) => version?.id));
  for (const incomingVersion of incoming.versions) {
    if (storedIds.has(incomingVersion.id)) continue;
    if (incomingVersion.status !== 'draft' || incomingVersion.revision !== 1) {
      throw createHttpError(403, 'New Safety Plan versions must start as drafts.');
    }
  }
}

function assertAuditEvent(actor, event, recordId) {
  if (!isObject(event) || event.id !== recordId) {
    throw createHttpError(400, 'Safety audit event id must match its record id.');
  }
  if (event.tenantId !== actor.tenantId) {
    throw createHttpError(403, 'Safety audit event tenant ownership cannot be changed.');
  }
}

function validateRecordId(value) {
  const recordId = String(value || '').trim();
  if (!recordId || recordId.length > 160) {
    throw createHttpError(400, 'Invalid record id.');
  }
  return recordId;
}

function assertSameOrigin(req) {
  if (!['PUT', 'DELETE'].includes(req.method)) return;
  const origin = String(req.headers?.origin || '');
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '');
  if (!origin || !host) return;

  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw createHttpError(403, 'Cross-origin storage changes are not allowed.');
  }

  if (originHost !== host) {
    throw createHttpError(403, 'Cross-origin storage changes are not allowed.');
  }
}

function tenantFilter(tenantId, collection) {
  return `tenant_id=eq.${encodeURIComponent(tenantId)}&collection=eq.${encodeURIComponent(collection)}`;
}

function buildRecord(tenantId, collection, recordId, payload) {
  return {
    tenant_id: tenantId,
    collection,
    record_id: recordId,
    payload,
    updated_at: new Date().toISOString(),
  };
}

async function listCollection(tenantId, collection) {
  const rows = await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&select=tenant_id,record_id,payload,updated_at&order=updated_at.desc`,
    { publicMessage: 'Persistent storage request failed.' }
  );
  return Array.isArray(rows)
    ? rows
      .filter((row) => row.tenant_id === undefined || row.tenant_id === tenantId)
      .map((row) => row.payload)
    : [];
}

async function getRecord(tenantId, collection, recordId) {
  const rows = await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&record_id=eq.${encodeURIComponent(recordId)}&select=tenant_id,payload&limit=1`,
    { publicMessage: 'Persistent storage request failed.' }
  );
  const row = Array.isArray(rows)
    ? rows.find((candidate) => candidate.tenant_id === undefined || candidate.tenant_id === tenantId)
    : null;
  return row ? row.payload : null;
}

async function deleteCollection(tenantId, collection) {
  await supabaseRequest(`rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
    publicMessage: 'Persistent storage delete failed.',
  });
}

async function deleteRecord(tenantId, collection, recordId) {
  await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&record_id=eq.${encodeURIComponent(recordId)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
      publicMessage: 'Persistent storage delete failed.',
    }
  );
}

async function upsertRecords(rows) {
  if (rows.length === 0) return;
  await supabaseRequest(`rest/v1/${TABLE_NAME}?on_conflict=tenant_id,collection,record_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
    publicMessage: 'Persistent storage save failed.',
  });
}

async function upsertCollection(tenantId, collection, records) {
  if (!Array.isArray(records)) throw createHttpError(400, 'Records must be an array.');
  if (records.length > MAX_RECORDS_PER_WRITE) {
    throw createHttpError(413, `Store at most ${MAX_RECORDS_PER_WRITE} records in one request.`);
  }

  const rows = records.map((record, index) => buildRecord(
    tenantId,
    collection,
    validateRecordId(record && typeof record === 'object' && record.id ? record.id : `record_${index}`),
    record
  ));
  await upsertRecords(rows);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,PUT,DELETE,OPTIONS');
    return res.status(204).end();
  }

  try {
    assertSameOrigin(req);
    const user = await authenticateRequest(req, res);
    const tenantId = user.tenantId;

    if (req.method === 'GET') {
      const collection = validateCollection(req.query.collection);
      assertCollectionPermission(user, collection, 'read');
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';
      if (req.localE2eFixture) {
        const fixtureRecords = req.localE2eFixture.collections?.[collection];
        const records = Array.isArray(fixtureRecords) ? fixtureRecords : [];
        if (recordId) {
          const payload = records.find((record) => record?.id === recordId) || null;
          return res.status(200).json({
            payload: user.role === 'contractor'
              ? contractorSafePayload(collection, payload)
              : payload,
          });
        }
        return res.status(200).json({
          records: user.role === 'contractor'
            ? records.map((payload) => contractorSafePayload(collection, payload))
            : records,
        });
      }
      if (recordId) {
        const payload = await getRecord(tenantId, collection, recordId);
        return res.status(200).json({ payload: user.role === 'contractor' ? contractorSafePayload(collection, payload) : payload });
      }
      const records = await listCollection(tenantId, collection);
      return res.status(200).json({ records: user.role === 'contractor'
        ? records.map((payload) => contractorSafePayload(collection, payload))
        : records });
    }

    if (req.localE2eFixture) {
      throw createHttpError(405, 'The local browser fixture is read-only.');
    }

    if (req.method === 'PUT') {
      const body = getJsonBody(req);
      const collection = validateCollection(body.collection || req.query.collection);
      assertCollectionPermission(user, collection, 'write');
      if (Array.isArray(body.records)) {
        let records = body.records;
        if (collection === SAFETY_PLAN_COLLECTION) {
          assertUniqueIds(records, 'Safety Plan record');
          await Promise.all(records.map(async (record, index) => {
            const recordId = validateRecordId(record?.id || `record_${index}`);
            const stored = await getRecord(tenantId, collection, recordId);
            assertSafetyPlanTransition({ actor: user, stored, incoming: record, recordId });
          }));
        } else if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
          assertUniqueIds(records, 'Safety audit event');
          await Promise.all(records.map(async (record, index) => {
            const recordId = validateRecordId(record?.id || `record_${index}`);
            assertAuditEvent(user, record, recordId);
            if (await getRecord(tenantId, collection, recordId)) {
              throw createHttpError(409, 'Safety audit events are append-only.');
            }
          }));
        } else if (user.role === 'contractor') {
          const storedRecords = await listCollection(tenantId, collection);
          const storedById = new Map(storedRecords.map((record) => [record?.id, record]));
          records = records.map((record) => contractorWritePayload(collection, record, storedById.get(record?.id)));
        }
        await upsertCollection(tenantId, collection, records);
        return res.status(200).json({ ok: true, count: body.records.length });
      }

      const recordId = validateRecordId(body.recordId || SINGLETON_RECORD_ID);
      const needsStoredPayload = user.role === 'contractor'
        || collection === SAFETY_PLAN_COLLECTION
        || collection === SAFETY_PLAN_AUDIT_COLLECTION;
      const storedPayload = needsStoredPayload ? await getRecord(tenantId, collection, recordId) : null;
      if (collection === SAFETY_PLAN_COLLECTION) {
        assertSafetyPlanTransition({
          actor: user,
          stored: storedPayload,
          incoming: body.payload,
          recordId,
        });
      }
      if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
        assertAuditEvent(user, body.payload, recordId);
        if (storedPayload) throw createHttpError(409, 'Safety audit events are append-only.');
      }
      const payload = user.role === 'contractor' && !collection.startsWith('ftf_safety_plan_')
        ? contractorWritePayload(collection, body.payload, storedPayload)
        : body.payload;
      await upsertRecords([buildRecord(tenantId, collection, recordId, payload)]);
      return res.status(200).json({ ok: true, count: 1 });
    }

    if (req.method === 'DELETE') {
      const collection = validateCollection(req.query.collection);
      assertCollectionPermission(user, collection, 'write');
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';
      if (collection === SAFETY_PLAN_AUDIT_COLLECTION) {
        throw createHttpError(403, 'Safety audit events are append-only and cannot be deleted.');
      }
      if (collection === SAFETY_PLAN_COLLECTION) {
        if (!recordId) {
          throw createHttpError(403, 'Safety Plans cannot be deleted as a collection.');
        }
        if (user.role !== 'admin') {
          throw createHttpError(403, 'Only administrators may delete draft Safety Plans.');
        }
        const stored = await getRecord(tenantId, collection, recordId);
        if (!stored || (stored.versions || []).some((version) =>
          ['approved', 'superseded'].includes(version?.status)
        )) {
          throw createHttpError(403, 'Approved and superseded Safety Plan versions cannot be deleted.');
        }
      }
      if (recordId) {
        await deleteRecord(tenantId, collection, recordId);
      } else {
        await deleteCollection(tenantId, collection);
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET,PUT,DELETE,OPTIONS');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Persistent store error:', error);
    return res.status(status).json({ error: error.publicMessage || 'Persistent storage request failed.' });
  }
};
