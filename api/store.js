const { authenticateRequest } = require('../server/session');
const { createHttpError, supabaseRequest } = require('../server/supabase');

const TABLE_NAME = 'ftf_store';
const SINGLETON_RECORD_ID = '__value__';
const MAX_RECORDS_PER_WRITE = 500;
const ALLOWED_COLLECTIONS = new Set([
  'ftf_aircraft_data',
  'ftf_missions',
  'ftf_mission_templates',
  'ftf_maintenance',
  'ftf_pmav_checks',
  'ftf_work_packs',
]);

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
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&select=record_id,payload,updated_at&order=updated_at.desc`,
    { publicMessage: 'Persistent storage request failed.' }
  );
  return Array.isArray(rows) ? rows.map((row) => row.payload) : [];
}

async function getRecord(tenantId, collection, recordId) {
  const rows = await supabaseRequest(
    `rest/v1/${TABLE_NAME}?${tenantFilter(tenantId, collection)}&record_id=eq.${encodeURIComponent(recordId)}&select=payload&limit=1`,
    { publicMessage: 'Persistent storage request failed.' }
  );
  return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
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
    if (!['admin', 'contractor'].includes(user.role)) {
      throw createHttpError(403, 'This account cannot access mission workflow storage.');
    }
    const tenantId = user.tenantId;

    if (req.method === 'GET') {
      const collection = validateCollection(req.query.collection);
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
      if (Array.isArray(body.records)) {
        let records = body.records;
        if (user.role === 'contractor') {
          const storedRecords = await listCollection(tenantId, collection);
          const storedById = new Map(storedRecords.map((record) => [record?.id, record]));
          records = records.map((record) => contractorWritePayload(collection, record, storedById.get(record?.id)));
        }
        await upsertCollection(tenantId, collection, records);
        return res.status(200).json({ ok: true, count: body.records.length });
      }

      const recordId = validateRecordId(body.recordId || SINGLETON_RECORD_ID);
      const storedPayload = user.role === 'contractor' ? await getRecord(tenantId, collection, recordId) : null;
      const payload = user.role === 'contractor'
        ? contractorWritePayload(collection, body.payload, storedPayload)
        : body.payload;
      await upsertRecords([buildRecord(tenantId, collection, recordId, payload)]);
      return res.status(200).json({ ok: true, count: 1 });
    }

    if (req.method === 'DELETE') {
      const collection = validateCollection(req.query.collection);
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';
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
