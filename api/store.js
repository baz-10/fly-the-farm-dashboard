const TABLE_NAME = 'ftf_store';
const SINGLETON_RECORD_ID = '__value__';
const MAX_RECORDS_PER_WRITE = 500;

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('Persistent storage is not configured.');
    error.statusCode = 503;
    error.publicMessage = 'Persistent storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.';
    throw error;
  }

  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    serviceRoleKey,
  };
}

function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function validateCollection(value) {
  const collection = String(value || '').trim();

  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(collection)) {
    const error = new Error('Invalid collection name.');
    error.statusCode = 400;
    error.publicMessage = 'Invalid collection name.';
    throw error;
  }

  return collection;
}

function validateRecordId(value) {
  const recordId = String(value || '').trim();

  if (!recordId || recordId.length > 160) {
    const error = new Error('Invalid record id.');
    error.statusCode = 400;
    error.publicMessage = 'Invalid record id.';
    throw error;
  }

  return recordId;
}

async function supabaseRequest(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getConfig();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Supabase storage request failed: ${response.status} ${body}`);
    error.statusCode = response.status;
    error.publicMessage = response.status === 404
      ? 'Persistent storage table is missing. Run the Supabase schema setup.'
      : 'Persistent storage request failed.';
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function buildRecord(collection, recordId, payload) {
  return {
    collection,
    record_id: recordId,
    payload,
    updated_at: new Date().toISOString(),
  };
}

async function listCollection(collection) {
  const rows = await supabaseRequest(
    `${TABLE_NAME}?collection=eq.${encodeURIComponent(collection)}&select=record_id,payload,updated_at&order=updated_at.desc`
  );

  return Array.isArray(rows) ? rows.map((row) => row.payload) : [];
}

async function getRecord(collection, recordId) {
  const rows = await supabaseRequest(
    `${TABLE_NAME}?collection=eq.${encodeURIComponent(collection)}&record_id=eq.${encodeURIComponent(recordId)}&select=payload&limit=1`
  );

  return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
}

async function deleteCollection(collection) {
  await supabaseRequest(
    `${TABLE_NAME}?collection=eq.${encodeURIComponent(collection)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }
  );
}

async function deleteRecord(collection, recordId) {
  await supabaseRequest(
    `${TABLE_NAME}?collection=eq.${encodeURIComponent(collection)}&record_id=eq.${encodeURIComponent(recordId)}`,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }
  );
}

async function upsertRecords(rows) {
  if (rows.length === 0) return;

  await supabaseRequest(
    `${TABLE_NAME}?on_conflict=collection,record_id`,
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    }
  );
}

async function replaceCollection(collection, records) {
  if (!Array.isArray(records)) {
    const error = new Error('Records must be an array.');
    error.statusCode = 400;
    error.publicMessage = 'Records must be an array.';
    throw error;
  }

  if (records.length > MAX_RECORDS_PER_WRITE) {
    const error = new Error('Too many records in one write.');
    error.statusCode = 413;
    error.publicMessage = `Store at most ${MAX_RECORDS_PER_WRITE} records in one request.`;
    throw error;
  }

  const rows = records.map((record, index) => buildRecord(
    collection,
    validateRecordId(record && typeof record === 'object' && record.id ? record.id : `record_${index}`),
    record
  ));

  await deleteCollection(collection);
  await upsertRecords(rows);
}

async function upsertSingleRecord(collection, recordId, payload) {
  await upsertRecords([buildRecord(collection, recordId, payload)]);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET,PUT,DELETE,OPTIONS');
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const collection = validateCollection(req.query.collection);
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';

      if (recordId) {
        return res.status(200).json({ payload: await getRecord(collection, recordId) });
      }

      return res.status(200).json({ records: await listCollection(collection) });
    }

    if (req.method === 'PUT') {
      const body = getJsonBody(req);
      const collection = validateCollection(body.collection || req.query.collection);

      if (Array.isArray(body.records)) {
        await replaceCollection(collection, body.records);
        return res.status(200).json({ ok: true, count: body.records.length });
      }

      const recordId = validateRecordId(body.recordId || SINGLETON_RECORD_ID);
      await upsertSingleRecord(collection, recordId, body.payload);
      return res.status(200).json({ ok: true, count: 1 });
    }

    if (req.method === 'DELETE') {
      const collection = validateCollection(req.query.collection);
      const recordId = req.query.recordId ? validateRecordId(req.query.recordId) : '';

      if (recordId) {
        await deleteRecord(collection, recordId);
      } else {
        await deleteCollection(collection);
      }

      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET,PUT,DELETE,OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Persistent store error:', error);
    return res.status(status).json({
      error: error.publicMessage || 'Persistent storage request failed.',
    });
  }
};
