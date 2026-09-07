const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sql = () => fs.readFileSync(path.join(__dirname, '../../supabase/migrations/20260905160000_mission_frozen_report_document.sql'), 'utf8').toLowerCase();

test('stores one exact bounded UTF-8 JSON representation on canonical completion', () => {
  const migration = sql();
  for (const token of ['report_document_text text', 'report_document_digest text', "convert_to(v_report_document_text,'utf8')", "octet_length(convert_to(v_report_document_text,'utf8'))", '1048576']) expect(migration).toContain(token);
  expect(migration).toContain("jsonb_typeof(v_manifest->'reportevidence')<>'object'");
  expect(migration).toContain("v_report_document_text := (v_manifest->'reportevidence')::text");
  expect(migration).toContain("encode(sha256(convert_to(v_report_document_text,'utf8')),'hex')");
});

test('preserves old manifest authority and makes retry representation-idempotent', () => {
  const migration = sql();
  expect(migration).toContain('daily_evidence_manifest,daily_evidence_digest,report_document_text,report_document_digest');
  expect(migration).toMatch(/if v_completion\.daily_evidence_digest is not null[\s\S]+return jsonb_build_object\('record',to_jsonb\(v_completion\),'idempotent',true\)/);
  expect(migration).not.toMatch(/update\s+public\.mission_completion_revisions/);
});

test('provides only a checked scoped read and labels historical absence', () => {
  const migration = sql();
  expect(migration).toContain('ftf_read_mission_frozen_report_document');
  expect(migration).toContain("'historical_report_document_unavailable'");
  expect(migration).toContain('ftf_actor_has_active_beta_seat');
  expect(migration).toContain('ftf_operational_location_allowed');
  expect(migration).toContain('mission_report_document_integrity_failed');
  expect(migration).toMatch(/revoke all on function public\.ftf_read_mission_frozen_report_document[\s\S]+from public,anon,authenticated/);
  expect(migration).not.toMatch(/grant\s+(select|insert|update|delete).*mission_completion_revisions/);
});

test('does not backfill or fabricate historical completion documents', () => {
  const migration = sql();
  expect(migration).not.toMatch(/update\s+public\.mission_completion_revisions/);
  expect(migration).not.toMatch(/report_document_text\s*=\s*daily_evidence_manifest/);
});

test('binds the representation to original manifest authority and a durable document era', () => {
  const migration = sql();
  expect(migration).toContain('report_document_schema_version smallint');
  expect(migration).toContain('report_document_era smallint not null default 0');
  expect(migration).toContain('alter column report_document_era set default 1');
  expect(migration).toContain('report_document_schema_version=1');
  expect(migration).toContain("sha256(convert_to(v_completion.daily_evidence_manifest::text,'utf8'))");
  expect(migration).toContain("v_manifest_digest<>v_completion.daily_evidence_digest");
  expect(migration).toContain("jsonb_typeof(v_completion.daily_evidence_manifest->'reportevidence')<>'object'");
  expect(migration).toContain("v_completion.report_document_text is distinct from (v_completion.daily_evidence_manifest->'reportevidence')::text");
});

test('verification hashes transported exact text rather than reserialized JSON', () => {
  const exact = '{"value":1.0}';
  const reserialized = JSON.stringify(JSON.parse(exact));
  expect(reserialized).toBe('{"value":1}');
  expect(crypto.createHash('sha256').update(exact, 'utf8').digest('hex'))
    .not.toBe(crypto.createHash('sha256').update(reserialized, 'utf8').digest('hex'));
  expect(sql()).toContain("sha256(convert_to(v_completion.report_document_text,'utf8'))");
});
