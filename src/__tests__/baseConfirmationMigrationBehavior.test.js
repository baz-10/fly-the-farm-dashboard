const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '../..');
const migrationPath = path.join(root, 'supabase/migrations/20260809130000_operating_location_confirmation.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const runPgliteInThisProcess = process.env.BASE_CONFIRMATION_PGLITE_CHILD === '1';
const pureNodeTests = [];

if (runPgliteInThisProcess) {
  global.jest = { setTimeout: () => {} };
  global.expect = require('expect');
  global.test = (name, run) => pureNodeTests.push({ name, run });
}

jest.setTimeout(120000);

if (runPgliteInThisProcess) {
  test('invalidates database confirmation when the Base address changes without replacement location evidence', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;
        create table public.operating_locations(
          id uuid primary key,
          address text,
          name text,
          timezone text
        );
        create function public.ftf_write_operational_resource(
          p_organisation_id uuid,
          p_actor_internal_user_id uuid,
          p_resource text,
          p_operation text,
          p_entity_id uuid default null,
          p_expected_version integer default null,
          p_data jsonb default '{}'::jsonb
        ) returns jsonb language plpgsql as $$
        declare v_result jsonb;
        begin
          update public.operating_locations
             set address=coalesce(p_data->>'address',address),
                 name=coalesce(p_data->>'name',name),
                 timezone=coalesce(p_data->>'timezone',timezone)
           where id=p_entity_id;
          select to_jsonb(record) into v_result from public.operating_locations record where id=p_entity_id;
          return v_result;
        end;
        $$;
      `);
      await db.exec(migration);
      await db.exec(`
        insert into public.operating_locations(id,address,name,timezone,latitude,longitude,address_source,location_confirmed_at)
        values('33333333-3333-4333-8333-333333333333','1 Old Airstrip Road','Base','Australia/Brisbane',-27.1817,151.2621,'ADDRESS_SEARCH','2026-08-09T00:00:00Z');
        select public.ftf_write_operational_resource(
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          'operating_locations','update',
          '33333333-3333-4333-8333-333333333333',1,
          '{"address":"2 New Airstrip Road"}'::jsonb
        );
      `);
      const result = await db.query(`
        select address,latitude,longitude,address_source,location_confirmed_at
          from public.operating_locations
         where id='33333333-3333-4333-8333-333333333333'
      `);
      expect(result.rows[0]).toEqual({
        address: '2 New Airstrip Road', latitude: null, longitude: null,
        address_source: null, location_confirmed_at: null,
      });
    } finally {
      await db.close();
    }
  });
} else {
  test('passes the real Base confirmation migration behavior check', () => {
    try {
      execFileSync(process.execPath, [__filename], {
        cwd: root,
        env: { ...process.env, BASE_CONFIRMATION_PGLITE_CHILD: '1' },
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
    for (const { name, run } of pureNodeTests) {
      await run();
      process.stdout.write(`PASS ${name}\n`);
    }
  })().catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
