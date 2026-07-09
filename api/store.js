const { authenticateRequest } = require('../server/session');
const { createHttpError, supabaseRequest } = require('../server/supabase');

const TABLE_NAME = 'ftf_store';
const SINGLETON_RECORD_ID = '__value__';
const MAX_RECORDS_PER_WRITE = 500;
const ALLOWED_COLLECTIONS = new Set([
  'ftf_aircraft_data',
  'ftf_missions',
  'ftf_mission_templates',
  'ftf_pmav_checks',
]);

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
      if (recordId) {
        return res.status(200).json({ payload: await getRecord(tenantId, collection, recordId) });
      }
      return res.status(200).json({ records: await listCollection(tenantId, collection) });
    }

    if (req.method === 'PUT') {
      const body = getJsonBody(req);
      const collection = validateCollection(body.collection || req.query.collection);
      if (Array.isArray(body.records)) {
        await upsertCollection(tenantId, collection, body.records);
        return res.status(200).json({ ok: true, count: body.records.length });
      }

      const recordId = validateRecordId(body.recordId || SINGLETON_RECORD_ID);
      await upsertRecords([buildRecord(tenantId, collection, recordId, body.payload)]);
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
