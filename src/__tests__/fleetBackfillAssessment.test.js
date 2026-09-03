const {
  assessFleetBackfillInventory,
  diagnosticSqlStatements,
  normaliseCanonicalIdentity,
} = require('../../scripts/fleetBackfillAssessment');
const fs = require('fs');
const path = require('path');

const organisationId = '11111111-1111-4111-8111-111111111111';
const locationId = '22222222-2222-4222-8222-222222222222';

const asset = (overrides = {}) => ({
  id: 'truck-1', assetType: 'truck', name: 'FTF-11', registration: 'FTF 11', vin: 'VIN-11',
  serialNumber: '', manufacturer: 'Isuzu', model: 'NPS', year: 2025, status: 'available',
  ...overrides,
});

const inventory = (payload, overrides = {}) => [{
  organisationId,
  organisationName: 'Fly The Farm',
  locations: [{ id: locationId, name: 'Fly The Farm Base' }],
  payload,
  snapshotDigest: 'a'.repeat(64),
  fleetAssetsTableExists: false,
  canonicalAssets: [],
  ...overrides,
}];

describe('Production-shaped Fleet backfill assessment', () => {
  test('keeps every executable diagnostic statement SELECT-only', () => {
    const inventorySql = fs.readFileSync(path.resolve(__dirname, '../../scripts/fleetBackfillAssessment.sql'), 'utf8')
      .replace(/^\s*--.*$/gm, ' ');
    for (const sql of [inventorySql, ...diagnosticSqlStatements]) {
      expect(sql).toMatch(/^\s*(with|select)\b/i);
      expect(sql).not.toMatch(/\b(insert|update|delete|merge|truncate|alter|create|drop|grant|revoke|comment|copy|call|do)\b/i);
    }
  });

  test('mirrors the migration source precedence, canonical key and ambiguity rules', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260820090000_authoritative_fleet_assets.sql'), 'utf8');
    expect(sql).toMatch(/jsonb_typeof\(v_payload->'assets'\) = 'array'[\s\S]*jsonb_typeof\(v_payload->'trucks'\) = 'array'/i);
    expect(sql).toMatch(/upper\(regexp_replace\(btrim\(item->>'registration'\), '\[\^A-Z0-9\]', '', 'g'\)\)/i);
    expect(sql).toMatch(/upper\(regexp_replace\(btrim\(item->>'vin'\), '\[\^A-Z0-9\]', '', 'g'\)\)/i);
    expect(sql).toMatch(/having count\(\*\) > 1/i);
    expect(normaliseCanonicalIdentity(' FTF-11 ')).toBe('FTF11');
    expect(normaliseCanonicalIdentity(' vin/11 ')).toBe('VIN11');
  });

  test('uses the migration canonical identity contract', () => {
    expect(normaliseCanonicalIdentity(' ftf-11 ')).toBe('FTF11');
    expect(normaliseCanonicalIdentity('VIN 11/ABC')).toBe('VIN11ABC');
    expect(normaliseCanonicalIdentity('')).toBeNull();
  });

  test('reports a clean deterministic asset and only current template impact', () => {
    const source = asset();
    const result = assessFleetBackfillInventory(inventory({
      assets: [source],
      templates: [
        { id: 'template-current', name: 'Current', status: 'active', assetIds: [source.id], truckId: source.id },
        { id: 'template-archived', name: 'Archived', status: 'archived', assetIds: [source.id], truckId: source.id },
      ],
      snapshots: [{ id: 'snapshot-1', assetIds: [source.id], truckId: source.id }],
    }));

    expect(result.counts).toEqual(expect.objectContaining({
      genuineSourceAssetReferences: 1,
      uniqueLogicalAssets: 1,
      trucks: 1,
      trailers: 0,
      proposedFleetAssets: 1,
      currentWorkPackTemplatesAffected: 1,
      currentTemplatesAssessed: 1,
      archivedTemplatesObserved: 1,
      archivedTemplatesProposedForMutation: 0,
      historicalSnapshotsInspected: 1,
      historicalSnapshotsProposedForMutation: 0,
      duplicates: 0,
      collisions: 0,
      ambiguities: 0,
      invalid: 0,
      alreadyCanonical: 0,
    }));
    expect(result.classifications).toEqual([expect.objectContaining({ classification: 'CLEAN', safeSourceIdentity: 'FTF11' })]);
    expect(result.currentTemplates).toEqual([expect.objectContaining({ templateId: 'template-current' })]);
    expect(result.dryRunPlan.archivedTemplateMutations).toEqual([]);
    expect(result.recommendation).toBe('GO — CLEAN AUTOMATIC BACKFILL');
  });

  test('distinguishes duplicate logical records from conflicting collisions', () => {
    const duplicate = assessFleetBackfillInventory(inventory({ assets: [asset(), asset({ id: 'truck-2' })], templates: [], snapshots: [] }));
    expect(duplicate.counts.duplicates).toBe(1);
    expect(duplicate.counts.uniqueLogicalAssets).toBe(1);
    expect(duplicate.recommendation).toBe('GO — AFTER SPECIFIED MANUAL RECONCILIATION');

    const collision = assessFleetBackfillInventory(inventory({
      assets: [asset(), asset({ id: 'truck-2', vin: 'VIN-22', model: 'FSS550' })], templates: [], snapshots: [],
    }));
    expect(collision.counts.collisions).toBe(2);
    expect(collision.classifications.every((item) => item.classification === 'COLLISION')).toBe(true);
  });

  test('fails closed for invalid source and ambiguous Base assignment', () => {
    const invalid = assessFleetBackfillInventory(inventory({ assets: [asset({ registration: '' })], templates: [], snapshots: [] }));
    expect(invalid.counts.invalid).toBe(1);

    const ambiguous = assessFleetBackfillInventory(inventory(
      { assets: [asset()], templates: [], snapshots: [] },
      { locations: [{ id: locationId, name: 'Base A' }, { id: '33333333-3333-4333-8333-333333333333', name: 'Base B' }] },
    ));
    expect(ambiguous.counts.ambiguities).toBe(1);
    expect(ambiguous.recommendation).toBe('GO — AFTER SPECIFIED MANUAL RECONCILIATION');
  });

  test('recognises exact already-canonical source identity without creating another asset', () => {
    const result = assessFleetBackfillInventory(inventory(
      { assets: [asset()], templates: [], snapshots: [] },
      { fleetAssetsTableExists: true, canonicalAssets: [{ id: 'fleet-1', sourceRecordId: 'truck-1', registration: 'FTF-11', vin: 'VIN-11' }] },
    ));
    expect(result.counts).toEqual(expect.objectContaining({ proposedFleetAssets: 0, alreadyCanonical: 1 }));
    expect(result.classifications[0].classification).toBe('ALREADY_CANONICAL');
  });

  test('fails closed if historical mutation is ever predicted', () => {
    const result = assessFleetBackfillInventory(inventory({ assets: [asset()], templates: [], snapshots: [] }));
    expect(result.counts.historicalSnapshotsProposedForMutation).toBe(0);
    expect(result.dryRunPlan.historicalSnapshotMutations).toEqual([]);
  });
});
