const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const EXPECTED = [
  ['19f7a127-8ab2-4d43-bf14-d23548f58bce', '19e16095-016b-4bcf-8ed7-82b0fbddb5f6', '0218251e-be2d-4e5c-96ca-29eff71b3a4a'],
  ['4eb1579f-f7af-42c1-8ddb-6985b01df273', '804587be-c32d-45d4-834c-cba4a1c31500', '25a9353b-ed90-468b-9ae5-31a55d8f88dc'],
  ['f3f1df3d-0879-43a4-93e9-3a9357c5065f', '374fe1f5-5812-45b2-9bfa-2d1b3c732cac', 'e0f8ba14-ec34-45db-87b4-8429c2ea6288'],
  ['3d645b15-7a9a-400b-8198-a92a9cb965d3', 'ea870bc0-517b-4937-8fb4-b72492a3b0bc', 'acfa5923-0edd-46ee-b81b-49d9deedc123'],
  ['88579100-5424-4069-ae12-1919c99c209c', '285e6444-2e59-402f-bbb1-8c57d96075eb', '4096dbd0-b538-4e8a-aaaa-76338125908a'],
];

describe('five-target Personnel provenance diagnostic', () => {
  test('hard-binds exactly the five authorised application, invitation and organisation identities', async () => {
    const { EXACT_TARGETS } = require('../../scripts/productionPersonnelProvenanceDiagnosticCore.cjs');
    expect(EXACT_TARGETS.map(({ applicationId, invitationId, organisationId }) => [applicationId, invitationId, organisationId])).toEqual(EXPECTED);
    expect(new Set(EXACT_TARGETS.map(({ organisationId }) => organisationId)).size).toBe(5);
    expect(Object.isFrozen(EXACT_TARGETS)).toBe(true);
  });

  test('emits bounded records without personal contact or free-text fields', async () => {
    const { runDiagnostic } = require('../../scripts/productionPersonnelProvenanceDiagnosticCore.cjs');
    const rows = [];
    const rest = async (path) => {
      if (path.startsWith('personnel?')) return path.includes(EXPECTED[0][2]) ? [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organisation_id: EXPECTED[0][2], internal_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', membership_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', engagement_status: 'employee', is_active: true, archived_at: null, created_at: '2026-08-14T00:00:00Z', updated_at: '2026-08-14T00:00:00Z', created_by_internal_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', updated_by_internal_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      }] : [];
      if (path.startsWith('commercial_onboarding_applications?')) return [{ id: EXPECTED[0][0], created_at: '2026-08-13T00:00:00Z', approved_at: '2026-08-13T01:00:00Z' }];
      if (path.startsWith('commercial_onboarding_invitations?')) return [{ id: EXPECTED[0][1], application_id: EXPECTED[0][0], accepted_at: '2026-08-13T02:00:00Z', resulting_internal_user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', resulting_membership_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }];
      if (path.startsWith('organisations?')) return [{ id: EXPECTED[0][2], created_at: '2026-08-13T02:00:00Z', updated_at: '2026-08-13T02:00:00Z', archived_at: null }];
      return [];
    };
    await runDiagnostic({ rest, emit: (row) => rows.push(row) });
    expect(rows.filter(({ recordType }) => recordType === 'personnel-summary')).toHaveLength(5);
    const personnel = rows.find(({ recordType }) => recordType === 'personnel');
    expect(personnel).toMatchObject({ personnelId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organisationId: EXPECTED[0][2], engagementStatus: 'employee', acceptanceActorMatch: true });
    expect(JSON.stringify(rows)).not.toMatch(/full_name|preferred_name|email|phone|address|notes|payload|emergency/i);
  });

  test('workflow is one protected read-only job with no caller-selected target or mutation path', () => {
    const source = read('.github/workflows/production-personnel-provenance-diagnostic.yml');
    const definition = yaml.load(source);
    const job = Object.values(definition.jobs)[0];
    expect(Object.keys(definition.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(definition.on.workflow_dispatch.inputs)).toEqual(['confirmation']);
    expect(Object.values(definition.jobs)).toHaveLength(1);
    expect(job.environment).toBe('production-beta-acceptance');
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(source).toContain('[[ "$GITHUB_REF" == "refs/heads/main" ]]');
    expect(source).not.toMatch(/archive|migration|deploy|client-to-mission|commercial-onboarding\.spec|continue-on-error|\bretry\b/i);
    expect(source).not.toMatch(/inputs\.(?:organisation|target|ref|sha)|\bref:\s*\$\{\{/i);
  });

  test('diagnostic source contains only bounded SELECT-oriented REST reads and no mutation verbs or archive RPC', () => {
    const source = read('scripts/productionPersonnelProvenanceDiagnostic.mjs');
    expect(source).not.toMatch(/method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]|rpc\//i);
    expect(source).not.toMatch(/full_name|preferred_name|email|phone|address|notes|event_payload|payload/i);
  });
});
