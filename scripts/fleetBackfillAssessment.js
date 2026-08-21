const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ASSET_TYPES = new Set(['truck', 'trailer', 'generator', 'crane', 'pump', 'compressor', 'other']);
const CANONICAL_QUERY = `select coalesce(jsonb_agg(jsonb_build_object(
  'id', id, 'organisationId', organisation_id, 'sourceRecordId', source_record_id,
  'registration', registration, 'vin', vin, 'serialNumber', serial_number
) order by organisation_id, id), '[]'::jsonb)::text
from public.fleet_assets
where archived_at is null and source_system = 'ftf_work_packs';`;

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normaliseCanonicalIdentity(value) {
  const clean = text(value)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || '';
  return clean || null;
}

function sourceAssets(payload) {
  if (Array.isArray(payload?.assets)) return payload.assets;
  if (Array.isArray(payload?.trucks)) return payload.trucks.map((record) => ({ ...record, assetType: 'truck' }));
  return [];
}

function validateSource(source) {
  const assetType = text(source?.assetType)?.toLowerCase();
  const registration = normaliseCanonicalIdentity(source?.registration);
  const identifier = text(source?.name) || text(source?.registration) || text(source?.id);
  if (!text(source?.id)) return 'FLEET_ASSET_SOURCE_ID_REQUIRED';
  if (!ASSET_TYPES.has(assetType)) return 'FLEET_ASSET_TYPE_INVALID';
  if (!identifier || identifier.length > 120) return 'FLEET_ASSET_IDENTIFIER_INVALID';
  if (['truck', 'trailer'].includes(assetType) && !registration) return 'FLEET_ASSET_REGISTRATION_REQUIRED';
  if (text(source?.registration)?.length > 40) return 'FLEET_ASSET_REGISTRATION_INVALID';
  if (text(source?.vin)?.length > 80) return 'FLEET_ASSET_VIN_INVALID';
  if (text(source?.serialNumber)?.length > 120) return 'FLEET_ASSET_SERIAL_INVALID';
  if (text(source?.manufacturer)?.length > 120 || text(source?.model)?.length > 120) return 'FLEET_ASSET_DESCRIPTION_INVALID';
  const year = text(String(source?.year ?? ''));
  if (year && (!Number.isInteger(Number(year)) || Number(year) < 1900 || Number(year) > 2200)) return 'FLEET_ASSET_YEAR_INVALID';
  return null;
}

function identityFor(source) {
  return {
    registration: normaliseCanonicalIdentity(source.registration),
    vin: normaliseCanonicalIdentity(source.vin),
    serialNumber: normaliseCanonicalIdentity(source.serialNumber),
  };
}

function logicalEquivalent(left, right) {
  const keys = ['registration', 'vin', 'serialNumber'];
  return keys.every((key) => !left[key] || !right[key] || left[key] === right[key]);
}

function assessFleetBackfillInventory(inventory) {
  const classifications = [];
  const currentTemplates = [];
  const proposedAssets = [];
  const manualReconciliation = [];
  let historicalSnapshots = 0;
  let references = 0;
  let trucks = 0;
  let trailers = 0;
  let duplicateGroups = 0;
  let collisionRecords = 0;
  let ambiguityRecords = 0;
  let invalidRecords = 0;
  let alreadyCanonical = 0;
  const logicalKeys = new Set();

  for (const entry of inventory) {
    if (!/^[a-f0-9]{64}$/.test(entry.snapshotDigest || '')) throw new Error('FLEET_BACKFILL_SNAPSHOT_DIGEST_INVALID');
    const assets = sourceAssets(entry.payload);
    const identities = assets.map(identityFor);
    const canonical = Array.isArray(entry.canonicalAssets) ? entry.canonicalAssets : [];
    references += assets.length;
    historicalSnapshots += Array.isArray(entry.payload?.snapshots) ? entry.payload.snapshots.length : 0;
    trucks += assets.filter((item) => text(item.assetType)?.toLowerCase() === 'truck').length;
    trailers += assets.filter((item) => text(item.assetType)?.toLowerCase() === 'trailer').length;

    const collisions = new Set();
    const duplicates = new Set();
    for (let index = 0; index < assets.length; index += 1) {
      for (let other = index + 1; other < assets.length; other += 1) {
        const shared = ['registration', 'vin', 'serialNumber'].some((key) => identities[index][key] && identities[index][key] === identities[other][key]);
        if (!shared) continue;
        if (logicalEquivalent(identities[index], identities[other])) {
          duplicates.add(index); duplicates.add(other);
        } else {
          collisions.add(index); collisions.add(other);
        }
      }
    }
    if (duplicates.size) duplicateGroups += 1;
    collisionRecords += collisions.size;

    assets.forEach((source, index) => {
      const identity = identities[index];
      const safeSourceIdentity = identity.registration || identity.vin || identity.serialNumber || text(source.id) || 'UNIDENTIFIED';
      const invalidReason = validateSource(source);
      const baseAmbiguous = !Array.isArray(entry.locations) || entry.locations.length !== 1;
      const sourceCanonical = canonical.find((record) => record.sourceRecordId === source.id);
      let classification = 'CLEAN';
      let reason = 'Deterministic one-to-one Fleet identity';
      if (invalidReason) { classification = 'INVALID'; reason = invalidReason; invalidRecords += 1; }
      else if (collisions.has(index)) { classification = 'COLLISION'; reason = 'Canonical registration, VIN or serial identity conflicts with a different source record'; }
      else if (duplicates.has(index)) { classification = 'DUPLICATE'; reason = 'Multiple source records resolve to one logical Fleet identity'; }
      else if (baseAmbiguous) { classification = 'AMBIGUOUS'; reason = 'Exactly one authoritative Operating Location is required by the controlled backfill'; ambiguityRecords += 1; }
      else if (sourceCanonical) { classification = 'ALREADY_CANONICAL'; reason = 'Exact Work Pack source record is already canonical'; alreadyCanonical += 1; }

      classifications.push({
        organisationId: entry.organisationId,
        organisationName: entry.organisationName,
        sourceRecordId: text(source.id),
        safeSourceIdentity,
        assetType: text(source.assetType)?.toLowerCase() || null,
        operatingLocation: entry.locations?.length === 1 ? entry.locations[0] : null,
        classification,
        reason,
      });
      logicalKeys.add(`${entry.organisationId}:${safeSourceIdentity}`);
      if (classification === 'CLEAN') {
        proposedAssets.push({
          organisationId: entry.organisationId,
          operatingLocationId: entry.locations[0].id,
          sourceRecordId: source.id,
          assetType: text(source.assetType).toLowerCase(),
          assetIdentifier: text(source.name) || text(source.registration) || text(source.id),
          registration: identity.registration,
          vin: identity.vin,
          serialNumber: identity.serialNumber,
        });
      } else if (!['ALREADY_CANONICAL'].includes(classification)) {
        manualReconciliation.push({
          safeSourceIdentity, assetType: text(source.assetType)?.toLowerCase() || null,
          organisationName: entry.organisationName, classification, reason,
          requiredDecision: classification === 'AMBIGUOUS'
            ? 'Select the authoritative Operating Location for this source asset.'
            : 'Confirm the authoritative source identity and resolve the reported conflict without changing historical snapshots.',
        });
      }
    });

    const sourceIds = new Set(assets.map((item) => text(item.id)).filter(Boolean));
    for (const template of Array.isArray(entry.payload?.templates) ? entry.payload.templates : []) {
      if ((text(template.status) || 'active') === 'archived') continue;
      const referenced = new Set([
        ...(Array.isArray(template.assetIds) ? template.assetIds : []),
        ...(text(template.truckId) ? [template.truckId] : []),
      ].filter((id) => sourceIds.has(id)));
      if (referenced.size) currentTemplates.push({
        organisationId: entry.organisationId,
        organisationName: entry.organisationName,
        templateId: text(template.id),
        templateName: text(template.name),
        sourceAssetIds: [...referenced].sort(),
      });
    }
  }

  const counts = {
    genuineSourceAssetReferences: references,
    uniqueLogicalAssets: logicalKeys.size,
    trucks,
    trailers,
    proposedFleetAssets: proposedAssets.length,
    currentWorkPackTemplatesAffected: currentTemplates.length,
    historicalSnapshotsInspected: historicalSnapshots,
    historicalSnapshotsProposedForMutation: 0,
    duplicates: duplicateGroups,
    collisions: collisionRecords,
    ambiguities: ambiguityRecords,
    invalid: invalidRecords,
    alreadyCanonical,
  };
  const hasManual = manualReconciliation.length > 0;
  return {
    sourceInventory: inventory.map((entry) => ({
      organisationId: entry.organisationId,
      organisationName: entry.organisationName,
      operatingLocations: entry.locations,
      sourceAssetCount: sourceAssets(entry.payload).length,
    })),
    classifications,
    currentTemplates,
    historicalSnapshotProof: { inspected: historicalSnapshots, proposedForMutation: 0 },
    snapshotDigests: inventory.map((entry) => ({ organisationId: entry.organisationId, digest: entry.snapshotDigest })),
    counts,
    dryRunPlan: {
      creates: proposedAssets,
      currentTemplateConversions: currentTemplates,
      skipped: classifications.filter((item) => item.classification === 'ALREADY_CANONICAL'),
      rejected: classifications.filter((item) => ['INVALID', 'COLLISION', 'AMBIGUOUS', 'DUPLICATE'].includes(item.classification)),
      historicalSnapshotMutations: [],
    },
    manualReconciliation,
    recommendation: hasManual ? 'GO — AFTER SPECIFIED MANUAL RECONCILIATION' : 'GO — CLEAN AUTOMATIC BACKFILL',
  };
}

function runSelect(sql) {
  const password = process.env.SUPABASE_DB_PASSWORD || '';
  if (!password) throw new Error('SUPABASE_DB_PASSWORD_REQUIRED');
  const result = spawnSync('psql', [
    '--host', 'aws-0-ap-southeast-2.pooler.supabase.com', '--port', '5432',
    '--username', 'postgres.fzkrvglzompkuiodqllr', '--dbname', 'postgres', '--no-password',
    '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1',
  ], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: password, PGCONNECT_TIMEOUT: '10', PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=30000' },
  });
  if (result.status !== 0) throw new Error(`FLEET_BACKFILL_SELECT_FAILED:${String(result.stderr || '').replace(password, '[REDACTED]').slice(0, 500)}`);
  return JSON.parse(result.stdout.trim() || '[]');
}

function queryProductionInventory() {
  const inventorySql = fs.readFileSync(path.join(__dirname, 'fleetBackfillAssessment.sql'), 'utf8');
  const inventory = runSelect(inventorySql);
  if (inventory.some((entry) => entry.fleetAssetsTableExists)) {
    const canonical = runSelect(CANONICAL_QUERY);
    for (const entry of inventory) {
      entry.canonicalAssets = canonical.filter((record) => record.organisationId === entry.organisationId);
    }
  } else {
    inventory.forEach((entry) => { entry.canonicalAssets = []; });
  }
  return inventory;
}

if (require.main === module) {
  const result = assessFleetBackfillInventory(queryProductionInventory());
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

module.exports = {
  assessFleetBackfillInventory,
  normaliseCanonicalIdentity,
  queryProductionInventory,
  diagnosticSqlStatements: [CANONICAL_QUERY],
};
