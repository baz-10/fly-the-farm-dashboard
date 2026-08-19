const fs = require('fs');
const path = require('path');
const {
  planFleetAssetBackfill,
  normaliseFleetIdentity,
} = require('../../scripts/plan-fleet-asset-backfill');

const migrationPath = path.resolve(
  __dirname,
  '../../supabase/migrations/20260820090000_authoritative_fleet_assets.sql',
);

function migrationSql() {
  return fs.readFileSync(migrationPath, 'utf8');
}

describe('authoritative Fleet asset foundation migration', () => {
  test('creates tenant and Base scoped relational Fleet assets with forced RLS', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.fleet_assets/i);
    expect(sql).toMatch(/foreign key \(organisation_id, operating_location_id\)/i);
    expect(sql).toMatch(/alter table public\.fleet_assets enable row level security/i);
    expect(sql).toMatch(/alter table public\.fleet_assets force row level security/i);
    expect(sql).toMatch(/revoke all on table public\.fleet_assets from public, anon, authenticated/i);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.fleet_assets to service_role/i);
  });

  test('allows governed equipment types without vehicle-only identifiers', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/asset_type in \('truck', 'trailer', 'generator', 'crane', 'pump', 'compressor', 'other'\)/i);
    expect(sql).toMatch(/registration text/i);
    expect(sql).toMatch(/vin text/i);
    expect(sql).toMatch(/serial_number text/i);
    expect(sql).toMatch(/check \(asset_type not in \('truck', 'trailer'\) or registration is not null\)/i);
    expect(sql).not.toMatch(/serial_number text not null/i);
  });

  test('enforces active tenant-scoped identity uniqueness and optimistic concurrency', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/fleet_assets_active_registration_unique[\s\S]*organisation_id, normalised_registration/i);
    expect(sql).toMatch(/fleet_assets_active_vin_unique[\s\S]*organisation_id, normalised_vin/i);
    expect(sql).toMatch(/fleet_assets_active_serial_unique[\s\S]*organisation_id, normalised_serial_number/i);
    expect(sql).toMatch(/row_version integer not null default 1/i);
    expect(sql).toMatch(/v_record\.row_version <> p_expected_version/i);
    expect(sql).toMatch(/jsonb_build_object\('conflict', true, 'current_version'/i);
  });

  test('composes Aircraft, Equipment Kits and Fleet assets without duplicating identity authority', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create table public\.maintainable_asset_registry/i);
    expect(sql).toMatch(/num_nonnulls\(aircraft_id, equipment_kit_id, fleet_asset_id\) = 1/i);
    expect(sql).toMatch(/foreign key \(organisation_id, aircraft_id\)/i);
    expect(sql).toMatch(/foreign key \(organisation_id, equipment_kit_id\)/i);
    expect(sql).toMatch(/foreign key \(organisation_id, fleet_asset_id\)/i);
    expect(sql).not.toMatch(/alter table public\.aircraft (?:drop|rename)/i);
  });

  test('adds only minimum Fleet permissions and emits audit/outbox evidence in the command transaction', () => {
    const sql = migrationSql();
    expect(sql).toContain("'fleet_assets.read'");
    expect(sql).toContain("'fleet_assets.create'");
    expect(sql).toContain("'fleet_assets.update'");
    expect(sql).toContain("'fleet_assets.archive'");
    expect(sql).not.toMatch(/maintenance\.(?:read|create|update|manage)/i);
    expect(sql).toMatch(/insert into public\.audit_events/i);
    expect(sql).toMatch(/insert into public\.transactional_outbox/i);
    expect(sql).toMatch(/operational\.fleet_asset\./i);
  });

  test('provides an explicit controlled backfill RPC without mutating Work Pack snapshots', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/create function public\.ftf_backfill_fleet_assets_from_work_pack/i);
    expect(sql).toMatch(/p_apply boolean default false/i);
    expect(sql).toMatch(/AMBIGUOUS_FLEET_ASSET_SOURCE/i);
    expect(sql).not.toMatch(/delete from public\.ftf_store/i);
    expect(sql).toMatch(/jsonb_set\(payload, '\{templates\}'/i);
    expect(sql).not.toMatch(/jsonb_set\(payload, '\{snapshots\}'/i);
  });

  test('blocks archive for current Work Pack references but ignores immutable historical snapshots', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/ftf_fleet_asset_has_active_work_pack_dependency/i);
    expect(sql).toMatch(/store\.payload->'templates'/i);
    expect(sql).toMatch(/coalesce\(template->>'status', 'active'\) <> 'archived'/i);
    expect(sql).toMatch(/template->'assetIds' \? p_fleet_asset_id::text/i);
    expect(sql).not.toMatch(/store\.payload->'snapshots'[\s\S]*ftf_fleet_asset_has_active_work_pack_dependency/i);
    expect(sql).toMatch(/return jsonb_build_object\('archive_conflict', true\)/i);
  });

  test('serialises Work Pack mutation and Fleet archive on one tenant coordination lock', () => {
    const sql = migrationSql();
    const locks = sql.match(/pg_advisory_xact_lock\(hashtextextended\('fleet-work-pack:' \|\| [^)]+/gi) || [];
    expect(locks).toHaveLength(3);
    expect(locks[0]).toContain('new.tenant_id');
    expect(locks[1]).toContain('p_organisation_id');
    expect(locks[2]).toContain('p_organisation_id');
    expect(sql).toMatch(/before insert or update of payload on public\.ftf_store/i);
    expect(sql).toMatch(/WORK_PACK_FLEET_ASSET_UNAVAILABLE/i);
    expect(sql).toMatch(/asset\.archived_at is null/i);
    expect(sql).toMatch(/select v_template->>'truckId'/i);
  });
});

describe('controlled Work Pack Fleet asset backfill plan', () => {
  const organisationId = '11111111-1111-4111-8111-111111111111';
  const locationId = '22222222-2222-4222-8222-222222222222';
  const base = {
    id: 'truck-existing-1', assetType: 'truck', name: 'FTF-11', registration: 'ftf-11', vin: ' vin-11 ',
    manufacturer: 'Isuzu', model: 'NPS', year: 2025, status: 'available', operationalNotes: '',
  };

  test('normalises exact identity without manufacturing missing identifiers', () => {
    expect(normaliseFleetIdentity(base)).toEqual(expect.objectContaining({
      assetType: 'truck', assetIdentifier: 'FTF-11', registration: 'FTF-11', vin: 'VIN-11', serialNumber: null,
    }));
    expect(normaliseFleetIdentity({ ...base, assetType: 'generator', registration: '', vin: '', id: 'gen-3', name: 'GEN-003' }))
      .toEqual(expect.objectContaining({ assetType: 'generator', assetIdentifier: 'GEN-003', registration: null, vin: null }));
  });

  test('plans one canonical record and preserves source snapshot evidence', () => {
    const result = planFleetAssetBackfill({
      organisationId, operatingLocationId: locationId,
      workPackStore: { assets: [base], templates: [], snapshots: [{ id: 'snapshot-1', assets: [base] }] },
      existingFleetAssets: [],
    });
    expect(result).toMatchObject({ sourceCount: 1, createCount: 1, matchedCount: 0, ambiguityCount: 0, ready: true });
    expect(result.creates[0]).toMatchObject({
      organisationId, operatingLocationId: locationId, sourceSystem: 'ftf_work_packs', sourceRecordId: base.id,
    });
    expect(result.localSourceDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  test('uses the database-authored snapshot digest as the apply precondition', () => {
    const sql = migrationSql();
    expect(sql).toMatch(/v_current_snapshot_digest := encode\(digest\(convert_to\(v_payload::text/i);
    expect(sql).toMatch(/if p_apply and \(p_expected_snapshot_digest is null or v_current_snapshot_digest <> p_expected_snapshot_digest\)/i);
    expect(sql).toMatch(/'snapshotDigest', v_current_snapshot_digest/i);
  });

  test('locks the Work Pack singleton before backfill source digest and rewrite', () => {
    const sql = migrationSql();
    const backfill = sql.slice(sql.indexOf('create function public.ftf_backfill_fleet_assets_from_work_pack'));
    expect(backfill.indexOf("pg_advisory_xact_lock(hashtextextended('fleet-work-pack:'")).toBeLessThan(backfill.indexOf('select payload into v_payload'));
    expect(backfill).toMatch(/select payload into v_payload[\s\S]*for update;/i);
  });

  test('matches an existing canonical source record idempotently', () => {
    const result = planFleetAssetBackfill({
      organisationId, operatingLocationId: locationId, workPackStore: { assets: [base] },
      existingFleetAssets: [{ id: 'canonical-1', sourceSystem: 'ftf_work_packs', sourceRecordId: base.id, registration: 'FTF-11', vin: 'VIN-11' }],
    });
    expect(result).toMatchObject({ createCount: 0, matchedCount: 1, ambiguityCount: 0, ready: true });
  });

  test.each([
    ['duplicate source identity', [base, { ...base, id: 'truck-existing-2' }]],
    ['conflicting registration', [base, { ...base, id: 'truck-existing-2', vin: 'VIN-22' }]],
  ])('fails closed for %s', (_label, assets) => {
    const result = planFleetAssetBackfill({ organisationId, operatingLocationId: locationId, workPackStore: { assets }, existingFleetAssets: [] });
    expect(result.ready).toBe(false);
    expect(result.ambiguityCount).toBeGreaterThan(0);
    expect(result.creates).toEqual([]);
  });

  test('does not mix organisations when matching existing identities', () => {
    const result = planFleetAssetBackfill({
      organisationId, operatingLocationId: locationId, workPackStore: { assets: [base] },
      existingFleetAssets: [{ id: 'foreign', organisationId: '99999999-9999-4999-8999-999999999999', registration: 'FTF-11', vin: 'VIN-11' }],
    });
    expect(result).toMatchObject({ ready: true, createCount: 1, matchedCount: 0 });
  });
});
