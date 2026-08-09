const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
const migrationDirectory = path.join(root, 'supabase/migrations');
const migrationName = '20260809100000_commercial_onboarding_lifecycle.sql';
const sql = fs.readFileSync(path.join(migrationDirectory, migrationName), 'utf8');
const runPgliteInThisProcess = process.env.MIGRATION_LINT_PGLITE_CHILD === '1';
const pureNodeTests = [];
const pureNodeBeforeAll = [];
const pureNodeAfterAll = [];

if (runPgliteInThisProcess) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => pureNodeTests.push({ name, run });
  global.beforeAll = (run) => pureNodeBeforeAll.push(run);
  global.afterAll = (run) => pureNodeAfterAll.push(run);
}

jest.setTimeout(120000);

test('uses only deterministic repository-controlled migration definitions', () => {
  expect(sql).not.toContain('pg_get_functiondef');
  expect(sql).not.toContain('execute replace(v_definition');
});

if (runPgliteInThisProcess) {
  let db;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key,email text unique);
      create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
      create role anon;
      create role authenticated;
      create role service_role;
    `);

    for (const dependency of [
      '20260801000000_production_beta_foundation.sql',
      '20260801006000_live_chain_access_prerequisites.sql',
      '20260801012000_legacy_runtime_dependencies.sql',
      '20260801013000_production_beta_identity_bootstrap.sql',
      '20260802024000_authoritative_personnel.sql',
      '20260802025000_authoritative_mission_weather.sql',
      '20260803010000_authoritative_mission_jsa.sql',
      '20260804060000_organisation_reference_sequences.sql',
      '20260804160000_platform_identity_assisted_support.sql',
      migrationName,
    ]) {
      await db.exec(fs.readFileSync(path.join(migrationDirectory, dependency), 'utf8'));
    }
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  test('applies the migration and exposes every governed interface in PostgreSQL', async () => {
    const result = await db.query(`
      select
        to_regclass('public.commercial_onboarding_applications') is not null as applications,
        to_regclass('public.commercial_onboarding_application_events') is not null as application_events,
        to_regclass('public.commercial_onboarding_invitations') is not null as invitations,
        to_regclass('public.commercial_onboarding_invitation_events') is not null as invitation_events,
        to_regprocedure('public.ftf_submit_commercial_application(jsonb)') is not null as submit_rpc,
        to_regprocedure('public.ftf_review_commercial_application(uuid,uuid,integer,text,text)') is not null as review_rpc,
        to_regprocedure('public.ftf_issue_commercial_invitation(uuid,uuid,integer,text,text,timestamp with time zone)') is not null as issue_rpc,
        to_regprocedure('public.ftf_revoke_commercial_invitation(uuid,uuid,integer,text)') is not null as revoke_rpc,
        to_regprocedure('public.ftf_accept_commercial_invitation(text,uuid)') is not null as accept_rpc
    `);
    expect(result.rows[0]).toEqual({
      applications: true,
      application_events: true,
      invitations: true,
      invitation_events: true,
      submit_rpc: true,
      review_rpc: true,
      issue_rpc: true,
      revoke_rpc: true,
      accept_rpc: true,
    });
  });
} else {
  test('passes the real PGlite migration lint', () => {
    try {
      execFileSync(process.execPath, [__filename], {
        cwd: root,
        env: { ...process.env, MIGRATION_LINT_PGLITE_CHILD: '1' },
        stdio: 'pipe',
      });
    } catch (error) {
      const output = `${error.stdout || ''}${error.stderr || ''}`;
      throw new Error(output || error.message);
    }
  });
}

if (runPgliteInThisProcess) {
  (async () => {
    try {
      for (const setup of pureNodeBeforeAll) await setup();
      for (const { name, run } of pureNodeTests) {
        await run();
        process.stdout.write(`PASS ${name}\n`);
      }
    } finally {
      for (const cleanup of pureNodeAfterAll) await cleanup();
    }
  })().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
