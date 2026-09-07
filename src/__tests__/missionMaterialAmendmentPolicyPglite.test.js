const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { TextDecoder, TextEncoder } = require('util');

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;

const child = process.env.MISSION_AMENDMENT_PGLITE_CHILD === '1';
const migrationPath = path.resolve(__dirname, '../../supabase/migrations/20260905135000_mission_material_amendment_policy.sql');

if (child) {
  const { PGlite } = require('@electric-sql/pglite');
  (async () => {
    const source = fs.readFileSync(migrationPath, 'utf8');
    const start = source.indexOf('create function public.ftf_classify_mission_amendment');
    const end = source.indexOf('revoke all on function public.ftf_classify_mission_amendment');
    const db = new PGlite();
    try {
      await db.exec(source.slice(start, end));
      const deriveStart = source.indexOf('create function public.ftf_derive_mission_material_changed_keys');
      const deriveEnd = source.indexOf('revoke all on function public.ftf_derive_mission_material_changed_keys');
      await db.exec(source.slice(deriveStart, deriveEnd));
      const classify = async (before, after) => (await db.query(
        'select public.ftf_classify_mission_amendment($1::jsonb,$2::jsonb) value',
        [JSON.stringify(before), JSON.stringify(after)],
      )).rows[0].value;
      const results = [
        await classify({ fieldIds: ['a'] }, { fieldIds: ['b'] }),
        await classify({}, { actualFlightHours: '2.5000' }),
        await classify({}, { futureSafetySetting: true }),
      ];
      results.push((await db.query(
        'select public.ftf_derive_mission_material_changed_keys($1::jsonb,$2::jsonb) value',
        [JSON.stringify({ chemicals: { version: 1 } }), JSON.stringify({ chemicals: { version: 2 }, futureAuthority: true })],
      )).rows[0].value);
      try {
        await classify(
          Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`before${index}`, index])),
          Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`after${index}`, index])),
        );
        results.push('UNEXPECTED_SUCCESS');
      } catch (error) {
        results.push(error.message.includes('MISSION_AMENDMENT_INPUT_INVALID') ? 'BOUNDED' : error.message);
      }
      process.stdout.write(JSON.stringify(results));
    } finally {
      await db.close();
    }
  })().catch((error) => { console.error(error); process.exitCode = 1; });
} else {
  test('executes PostgreSQL classification with TypeScript-equivalent outcomes', () => {
    const output = execFileSync(process.execPath, ['--experimental-vm-modules', __filename], {
      encoding: 'utf8', env: { ...process.env, MISSION_AMENDMENT_PGLITE_CHILD: '1' },
    });
    expect(JSON.parse(output)).toEqual([
      { classification: 'MATERIAL', reasons: ['FIELD_SCOPE_CHANGED'], changed_keys: ['fieldIds'] },
      { classification: 'ADMINISTRATIVE', reasons: [], changed_keys: ['actualFlightHours'] },
      { classification: 'MATERIAL', reasons: ['UNRECOGNISED_CHANGE'], changed_keys: ['futureSafetySetting'] },
      ['applicationMethod', 'chemicalProductIds', 'governedRate', 'sourceManifest.futureAuthority'],
      'BOUNDED',
    ]);
  });
}
