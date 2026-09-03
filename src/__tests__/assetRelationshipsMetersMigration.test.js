const fs = require('fs');
const path = require('path');

const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260820100000_asset_relationships_meters_and_systems.sql');
const sql = () => fs.readFileSync(migrationPath, 'utf8');

describe('asset relationships, meters, systems and positions migration', () => {
  test('creates forced-RLS, tenant-scoped maintenance facts', () => {
    const source = sql();
    for (const table of ['asset_attachment_periods', 'asset_meter_definitions', 'asset_meter_readings', 'asset_systems', 'component_positions']) {
      expect(source).toMatch(new RegExp(`create table public\\.${table}`, 'i'));
      expect(source).toMatch(new RegExp(`alter table public\\.${table} force row level security`, 'i'));
      expect(source).toMatch(new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
    }
  });

  test('enforces one active parent, same organisation, no self attachment or active cycles', () => {
    const source = sql();
    expect(source).toMatch(/asset_attachment_periods_one_active_parent[\s\S]*child_asset_id[\s\S]*detached_at is null/i);
    expect(source).toMatch(/check \(parent_asset_id <> child_asset_id\)/i);
    expect(source).toMatch(/ATTACHMENT_ORGANISATION_MISMATCH/i);
    expect(source).toMatch(/ATTACHMENT_CYCLE/i);
    expect(source).toMatch(/with recursive ancestors/i);
    expect(source).toMatch(/for update/i);
  });

  test('makes meter readings append-only, idempotent and correction-by-supersession only', () => {
    const source = sql();
    expect(source).toMatch(/meter_type in \('odometer', 'engine_hours', 'flight_hours', 'cycles', 'missions', 'area', 'custom'\)/i);
    expect(source).toMatch(/source_policy in \('MANUAL', 'MISSION_DERIVED', 'MIXED'\)/i);
    expect(source).toMatch(/unique \(organisation_id, meter_definition_id, source_system, source_record_id\)/i);
    expect(source).toMatch(/supersedes_reading_id uuid/i);
    expect(source).toMatch(/METER_READING_IMMUTABLE/i);
    expect(source).toMatch(/METER_VALUE_REQUIRES_CORRECTION/i);
    expect(source).toMatch(/target\.meter_definition_id=v_meter\.id/i);
    expect(source).toMatch(/METER_CORRECTION_TARGET_INVALID/i);
    expect(source).toMatch(/METER_SOURCE_NOT_ALLOWED/i);
    expect(source).toMatch(/if p_command='record_reading' and \(\(v_meter\.source_policy='MANUAL'/i);
  });

  test('supports optional hierarchical systems and unconstrained component positions', () => {
    const source = sql();
    expect(source).toMatch(/parent_system_id uuid/i);
    expect(source).toMatch(/model_scope text/i);
    expect(source).toMatch(/position_code text not null/i);
    expect(source).toMatch(/SYSTEM_HIERARCHY_CYCLE/i);
    expect(source).toMatch(/SYSTEM_HIERARCHY_SCOPE_MISMATCH/i);
    expect(source).toMatch(/v_parent\.maintainable_asset_id is distinct from new\.maintainable_asset_id/i);
    expect(source).toMatch(/v_parent\.model_scope is distinct from new\.model_scope/i);
    expect(source).not.toMatch(/motor_[1-4]|DJI/i);
  });

  test('adds minimum permissions plus governed audit/outbox commands', () => {
    const source = sql();
    for (const permission of ['asset_attachments.manage', 'asset_meters.read', 'asset_meters.manage', 'asset_systems.manage']) {
      expect(source).toContain(`'${permission}'`);
    }
    expect(source).toMatch(/create function public\.ftf_write_asset_maintenance_command/i);
    expect(source).toMatch(/insert into public\.audit_events/i);
    expect(source).toMatch(/insert into public\.transactional_outbox/i);
    expect(source).toMatch(/grant execute on function public\.ftf_write_asset_maintenance_command[\s\S]*to service_role/i);
    expect(source).not.toMatch(/grant select, insert|grant select, update|grant .*delete on table public\.(asset_attachment_periods|asset_meter_definitions|asset_meter_readings|asset_systems|component_positions) to service_role/i);
  });

  test('enforces Base scope and reads only the selected asset workspace', () => {
    const source=sql();
    expect(source).toMatch(/ftf_maintenance_asset_location_allowed/i);
    expect(source).toMatch(/ftf_operational_location_allowed/i);
    expect(source).toMatch(/create function public\.ftf_read_asset_maintenance_workspace/i);
    expect(source).toMatch(/reading\.meter_definition_id=any\(v_meter_ids\)/i);
    expect(source).toMatch(/position\.system_id=any\(v_system_ids\)/i);
  });

  test('provides one Aircraft flight-hours compatibility projection',()=>{
    const source=sql();
    expect(source).toMatch(/create view public\.aircraft_maintenance_meter_compatibility/i);
    expect(source).toMatch(/coalesce\([\s\S]*aircraft\.total_flight_hours\) total_flight_hours/i);
    expect(source).toContain("'AUTHORITATIVE_METER'");
    expect(source).toContain("'AIRCRAFT_COMPATIBILITY'");
  });
});
