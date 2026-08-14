const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const EXPECTED = [
  ['19f7a127-8ab2-4d43-bf14-d23548f58bce', 'SC-APP-380F8A196D76', '19e16095-016b-4bcf-8ed7-82b0fbddb5f6', '0218251e-be2d-4e5c-96ca-29eff71b3a4a', '31569691340'],
  ['4eb1579f-f7af-42c1-8ddb-6985b01df273', 'SC-APP-200F75D7FA19', '804587be-c32d-45d4-834c-cba4a1c31500', '25a9353b-ed90-468b-9ae5-31a55d8f88dc', '31587990071'],
  ['f3f1df3d-0879-43a4-93e9-3a9357c5065f', 'SC-APP-0C9ECBA21270', '374fe1f5-5812-45b2-9bfa-2d1b3c732cac', 'e0f8ba14-ec34-45db-87b4-8429c2ea6288', '31591434536'],
  ['3d645b15-7a9a-400b-8198-a92a9cb965d3', 'SC-APP-904F369C8C4A', 'ea870bc0-517b-4937-8fb4-b72492a3b0bc', 'acfa5923-0edd-46ee-b81b-49d9deedc123', '31637533240'],
  ['88579100-5424-4069-ae12-1919c99c209c', 'SC-APP-11FCEA64E035', '285e6444-2e59-402f-bbb1-8c57d96075eb', '4096dbd0-b538-4e8a-aaaa-76338125908a', '31641994313'],
];

const loadModule = async () => require('../../scripts/controlledResidualArchiveCore.cjs');

describe('protected five-target residual acceptance archive', () => {
  test('hard-binds exactly the five Founder-authorised provenance tuples in reviewed order', () => {
    const manifest = JSON.parse(read('scripts/controlledResidualArchiveManifest.json'));

    expect(manifest.targets.map((entry) => [
      entry.applicationId,
      entry.applicationReference,
      entry.invitationId,
      entry.organisationId,
      entry.evidenceSourceWorkflowRunId,
    ])).toEqual(EXPECTED);
    expect(manifest.targets).toHaveLength(5);
    expect(manifest.targets[0].expectedPersonnel).toEqual({
      personnelId: 'e6205daf-019b-4287-b0f0-d9dbc3e8af00', baseLinkCount: 1, roleLinkCount: 7,
    });
    expect(manifest.targets.slice(1).every(({ expectedPersonnel }) => expectedPersonnel === null)).toBe(true);
    expect(new Set(manifest.targets.map(({ organisationId }) => organisationId)).size).toBe(5);
    for (const entry of manifest.targets) {
      expect(entry.operatingLocationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(Object.keys(entry.expectedActiveRecords).sort()).toEqual([
        'aircraft', 'clients', 'equipment_kits', 'fields', 'jobs', 'missions', 'properties',
      ]);
    }
  });

  test('rejects every missing, changed, reordered, duplicated, or added target', async () => {
    const { validateManifest } = await loadModule();
    const manifest = JSON.parse(read('scripts/controlledResidualArchiveManifest.json'));
    const variants = [
      { ...manifest, targets: manifest.targets.slice(0, 4) },
      { ...manifest, targets: [...manifest.targets, manifest.targets[0]] },
      { ...manifest, targets: [manifest.targets[1], manifest.targets[0], ...manifest.targets.slice(2)] },
      { ...manifest, targets: manifest.targets.map((entry, index) => index ? entry : { ...entry, organisationId: '11111111-1111-4111-8111-111111111111' }) },
      { ...manifest, targets: manifest.targets.map((entry, index) => index ? entry : { ...entry, evidenceSourceWorkflowRunId: '1' }) },
      { ...manifest, targets: manifest.targets.map((entry, index) => index ? entry : { ...entry, expectedPersonnel: { ...entry.expectedPersonnel, personnelId: '11111111-1111-4111-8111-111111111111' } }) },
    ];
    for (const variant of variants) expect(() => validateManifest(variant)).toThrow('exact Founder-authorised manifest');
  });

  test('preflights all five before any archive and produces no mutation after any refusal', async () => {
    const { runControlledResidualArchive } = await loadModule();
    const manifest = JSON.parse(read('scripts/controlledResidualArchiveManifest.json'));
    const preflighted = [];
    const archived = [];

    await expect(runControlledResidualArchive({
      manifest,
      client: {},
      buildSnapshot: async (entry) => {
        preflighted.push(entry.organisationId);
        if (preflighted.length === 4) throw new Error('REFUSED');
        return {
          organisationId: entry.organisationId,
          ...(entry.expectedPersonnel ? { personnel: { personnelId: entry.expectedPersonnel.personnelId,
            baseLinks: Array(entry.expectedPersonnel.baseLinkCount).fill({ id: 'base' }),
            roleLinks: Array(entry.expectedPersonnel.roleLinkCount).fill({ id: 'role' }) } } : {}),
          records: Object.fromEntries(Object.entries(entry.expectedActiveRecords)
            .map(([table, count]) => [table, Array(count).fill({ id: 'x' })])),
        };
      },
      archiveSnapshot: async (entry) => archived.push(entry.organisationId),
    })).rejects.toThrow('REFUSED');

    expect(preflighted).toEqual(EXPECTED.slice(0, 4).map((entry) => entry[3]));
    expect(archived).toEqual([]);
  });

  test('archives sequentially once each and stops immediately without retry on first failure', async () => {
    const { runControlledResidualArchive } = await loadModule();
    const manifest = JSON.parse(read('scripts/controlledResidualArchiveManifest.json'));
    const archived = [];
    const result = runControlledResidualArchive({
      manifest,
      client: {},
      buildSnapshot: async (entry) => ({
        organisationId: entry.organisationId,
        ...(entry.expectedPersonnel ? { personnel: { personnelId: entry.expectedPersonnel.personnelId,
          baseLinks: Array(entry.expectedPersonnel.baseLinkCount).fill({ id: 'base' }),
          roleLinks: Array(entry.expectedPersonnel.roleLinkCount).fill({ id: 'role' }) } } : {}),
        records: Object.fromEntries(Object.entries(entry.expectedActiveRecords).map(([table, count]) => [table, Array(count).fill({ id: 'x' })])),
      }),
      archiveSnapshot: async (entry) => {
        archived.push(entry.organisationId);
        if (archived.length === 3) throw new Error('ARCHIVE_REFUSED');
        return { archived: true };
      },
    });

    await expect(result).rejects.toThrow('ARCHIVE_REFUSED');
    expect(archived).toEqual(EXPECTED.slice(0, 3).map((entry) => entry[3]));
    expect(new Set(archived).size).toBe(3);
  });

  test('uses the existing governed RPC helper and emits only bounded identifiers and states', () => {
    const orchestrator = read('scripts/controlledResidualArchive.mjs');
    const verifier = read('scripts/verifyCommercialOnboardingPostgres.mjs');

    expect(orchestrator).toContain("from './verifyCommercialOnboardingPostgres.mjs'");
    expect(orchestrator).toContain('archiveControlledSnapshot');
    expect(verifier).toContain("client.rest('rpc/ftf_archive_controlled_commercial_onboarding'");
    expect(orchestrator).not.toMatch(/console\.(?:log|error)\([^\n]*(?:snapshot|response|body|payload)/i);
    expect(() => execFileSync(process.execPath, ['-e', "import('./scripts/verifyCommercialOnboardingPostgres.mjs')"], {
      cwd: root, stdio: 'pipe',
    })).not.toThrow();
  });

  test('defines one workflow-dispatch-only protected job with no target input or alternate execution path', () => {
    const source = read('.github/workflows/production-controlled-residual-archive.yml');
    const definition = yaml.load(source);
    const dispatch = definition.on.workflow_dispatch;
    const jobs = Object.values(definition.jobs);
    const job = jobs[0];

    expect(Object.keys(definition.on)).toEqual(['workflow_dispatch']);
    expect(Object.keys(dispatch.inputs)).toEqual(['confirmation']);
    expect(jobs).toHaveLength(1);
    expect(job.environment).toBe('production-beta-acceptance');
    expect(job.permissions).toEqual({ contents: 'read' });
    expect(JSON.stringify(definition)).not.toMatch(/organisation[_-]?id.*inputs|target[_-]?(?:id|list|organisation)/i);
    expect(source).not.toMatch(/inputs\.(?:expected_source_sha|ref|sha)|\bref:\s*\$\{\{/i);
    expect(source).toContain('[[ "$GITHUB_REF" == "refs/heads/main" ]]');
  });

  test('orders backup, all-target preflight, baseline freeze, sequential archive, and final verification', () => {
    const definition = yaml.load(read('.github/workflows/production-controlled-residual-archive.yml'));
    const steps = Object.values(definition.jobs)[0].steps;
    const names = steps.map(({ name }) => name);
    const expected = [
      'Verify completed Production backup',
      'Preflight all five exact controlled organisations',
      'Freeze genuine-data and privilege evidence',
      'Archive five exact controlled organisations sequentially',
      'Verify controlled history and genuine-data integrity',
      'Verify privilege state remains PRE_CORRECTION',
    ];
    for (const name of expected) expect(names).toContain(name);
    expected.slice(1).forEach((name, index) => expect(names.indexOf(expected[index])).toBeLessThan(names.indexOf(name)));
  });

  test('contains no retry, onboarding, client-to-mission, migration, deployment, alias, or fixture path', () => {
    const source = read('.github/workflows/production-controlled-residual-archive.yml');
    const normalised = source.replace(/controlledResidualArchiveManifest|controlledResidualArchive/g, 'bounded-archive');

    expect(normalised).not.toMatch(/\bretry\b|commercial-onboarding\.spec|client-to-mission|migration\s+(?:up|repair|list)|db\s+push|vercel|alias\s+set|playwright|create\s+(?:fixture|organisation)|rerun/i);
    expect(source).toContain('ftf_archive_controlled_commercial_onboarding');
    expect(source).not.toContain('continue-on-error');
    expect(source).toMatch(/age>36\*60\*60\*1000/);
  });

  test('keeps genuine-data and privilege verification read-only and exact-scope bounded', () => {
    const frozen = read('scripts/productionPreArchiveFrozenBaseline.sql');
    const genuine = read('scripts/productionGenuineDataArchiveBaseline.sql');
    const privilege = read('scripts/productionResidualArchivePrivilegeVerification.sql');
    const combined = `${frozen}\n${genuine}\n${privilege}`;

    for (const id of EXPECTED.map((entry) => entry[3])) expect(genuine).toContain(id);
    expect(genuine).toMatch(/clients[\s\S]*properties[\s\S]*fields[\s\S]*jobs[\s\S]*missions[\s\S]*organisations[\s\S]*personnel[\s\S]*ftf_store/i);
    expect(privilege).toContain("version='20260813140000'");
    expect(privilege).toContain('PRE_CORRECTION');
    expect(privilege).toMatch(/MAINTAIN/i);
    expect(frozen).toContain('361ec0ed3203caf8f71f5a0e580fb98f');
    expect(frozen).toContain('f29ee3e6379136074b2f69dc715e2d46');
    expect(combined).not.toMatch(/^\s*(?:insert|update|delete|truncate|alter|grant|revoke|create|drop)\b/im);
  });
});
