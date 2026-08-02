const fs = require('fs');
const path = require('path');

const migration = fs.readFileSync(path.resolve(
  __dirname,
  '../../supabase/migrations/20260802023000_mission_map_import_sources.sql',
), 'utf8').replace(/\s+/g, ' ').toLowerCase();

describe('Mission map import-source retention migration', () => {
  test('stores provider-neutral internal file records with immutable source evidence', () => {
    expect(migration).toContain('create table public.mission_map_source_files');
    expect(migration).toMatch(/original_filename text not null/);
    expect(migration).toMatch(/source_format text not null/);
    expect(migration).toMatch(/sha256_checksum text not null/);
    expect(migration).toMatch(/original_crs text/);
    expect(migration).toMatch(/transformation_metadata jsonb not null/);
    expect(migration).toMatch(/validation_result jsonb not null/);
    expect(migration).toMatch(/imported_by_internal_user_id uuid not null/);
    expect(migration).toMatch(/imported_at timestamptz not null/);
    expect(migration).toContain('storage_object_key text not null');
    expect(migration).not.toMatch(/provider_url|public_url/);
  });

  test('enforces tenant and Mission relationships and makes source IDs first-class geometry references', () => {
    expect(migration).toContain('foreign key(organisation_id,mission_id) references public.missions(organisation_id,id)');
    expect(migration).toContain('foreign key(organisation_id,source_file_id) references public.mission_map_source_files(organisation_id,id)');
    expect(migration).toContain('alter table public.mission_map_source_files enable row level security');
    expect(migration).toContain('alter table public.mission_map_source_files force row level security');
    expect(migration).toContain('public.current_user_has_organisation_access(organisation_id)');
    expect(migration).toMatch(/sourcefileid' is not null.*mission_id=v_mission\.id/);
  });

  test('records import audit/outbox evidence and returns file metadata in revision history', () => {
    expect(migration).toContain("'mission_map.source_file_created'");
    expect(migration).toContain("'operational.mission_map.source_file_created'");
    expect(migration).toContain("'originalfilename',f.original_filename");
    expect(migration).toContain("'checksum',f.sha256_checksum");
    expect(migration).toContain("'transformationmetadata',f.transformation_metadata");
    expect(migration).toContain("'validationresult',f.validation_result");
  });
});
