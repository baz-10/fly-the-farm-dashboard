const crypto = require('crypto');

const ASSET_TYPES = new Set(['truck', 'trailer', 'generator', 'crane', 'pump', 'compressor', 'other']);

function text(value) {
  const normalised = typeof value === 'string' ? value.trim() : '';
  return normalised || null;
}

function identity(value) {
  return text(value)?.toUpperCase() || null;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => ({ ...result, [key]: stable(value[key]) }), {});
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function normaliseFleetIdentity(source) {
  const assetType = text(source?.assetType)?.toLowerCase();
  if (!ASSET_TYPES.has(assetType)) throw new Error('FLEET_ASSET_TYPE_INVALID');
  const assetIdentifier = text(source?.name) || text(source?.registration) || text(source?.id);
  if (!assetIdentifier) throw new Error('FLEET_ASSET_IDENTIFIER_REQUIRED');
  const registration = identity(source?.registration);
  if (['truck', 'trailer'].includes(assetType) && !registration) throw new Error('FLEET_ASSET_REGISTRATION_REQUIRED');
  return {
    assetType,
    assetIdentifier,
    registration,
    vin: identity(source?.vin),
    serialNumber: identity(source?.serialNumber),
    manufacturer: text(source?.manufacturer),
    model: text(source?.model),
    year: Number.isInteger(Number(source?.year)) ? Number(source.year) : null,
    status: ['available', 'assigned', 'maintenance', 'retired'].includes(source?.status) ? source.status : 'available',
    notes: text(source?.operationalNotes) || '',
  };
}

function planFleetAssetBackfill({ organisationId, operatingLocationId, workPackStore, existingFleetAssets }) {
  const sourceAssets = Array.isArray(workPackStore?.assets)
    ? workPackStore.assets
    : Array.isArray(workPackStore?.trucks)
      ? workPackStore.trucks.map((record) => ({ ...record, assetType: 'truck' }))
      : [];
  const existing = (Array.isArray(existingFleetAssets) ? existingFleetAssets : [])
    .filter((record) => !record.organisationId || record.organisationId === organisationId);
  const ambiguities = [];
  const normalised = [];

  for (const source of sourceAssets) {
    try {
      normalised.push({ source, identity: normaliseFleetIdentity(source) });
    } catch (error) {
      ambiguities.push({ sourceRecordId: text(source?.id), code: error.message });
    }
  }

  const keys = ['registration', 'vin', 'serialNumber'];
  for (const { source, identity: candidate } of normalised) {
    for (const key of keys) {
      if (!candidate[key]) continue;
      const collisions = normalised.filter((item) => item.source.id !== source.id && item.identity[key] === candidate[key]);
      if (collisions.length) ambiguities.push({ sourceRecordId: source.id, code: 'AMBIGUOUS_FLEET_ASSET_SOURCE', field: key });
    }
  }

  if (ambiguities.length) {
    return {
      sourceCount: sourceAssets.length, createCount: 0, matchedCount: 0,
      ambiguityCount: ambiguities.length, ready: false, creates: [], matches: [], ambiguities,
      localSourceDigest: digest(workPackStore || {}),
    };
  }

  const creates = [];
  const matches = [];
  for (const { source, identity: candidate } of normalised) {
    const sourceMatch = existing.filter((record) => record.sourceSystem === 'ftf_work_packs' && record.sourceRecordId === source.id);
    const identityMatches = existing.filter((record) => keys.some((key) => candidate[key] && identity(record[key]) === candidate[key]));
    const all = [...new Map([...sourceMatch, ...identityMatches].map((record) => [record.id, record])).values()];
    if (all.length > 1) {
      ambiguities.push({ sourceRecordId: source.id, code: 'AMBIGUOUS_FLEET_ASSET_MATCH' });
      continue;
    }
    if (all.length === 1) {
      matches.push({ sourceRecordId: source.id, fleetAssetId: all[0].id });
      continue;
    }
    creates.push({
      organisationId,
      operatingLocationId,
      ...candidate,
      sourceSystem: 'ftf_work_packs',
      sourceRecordId: source.id,
      sourceDigest: digest(source),
    });
  }

  if (ambiguities.length) {
    return {
      sourceCount: sourceAssets.length, createCount: 0, matchedCount: 0,
      ambiguityCount: ambiguities.length, ready: false, creates: [], matches: [], ambiguities,
      localSourceDigest: digest(workPackStore || {}),
    };
  }

  return {
    sourceCount: sourceAssets.length,
    createCount: creates.length,
    matchedCount: matches.length,
    ambiguityCount: 0,
    ready: true,
    creates,
    matches,
    ambiguities: [],
    localSourceDigest: digest(workPackStore || {}),
  };
}

module.exports = { normaliseFleetIdentity, planFleetAssetBackfill };
