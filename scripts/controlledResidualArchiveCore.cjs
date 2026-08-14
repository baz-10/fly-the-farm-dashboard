const EXACT_TARGETS = [
  ['19f7a127-8ab2-4d43-bf14-d23548f58bce', 'SC-APP-380F8A196D76', '19e16095-016b-4bcf-8ed7-82b0fbddb5f6', '0218251e-be2d-4e5c-96ca-29eff71b3a4a', '33da5953-4704-4ded-a602-e5e74d358cac', '31569691340', [0, 0, 1, 1, 1, 0, 0]],
  ['4eb1579f-f7af-42c1-8ddb-6985b01df273', 'SC-APP-200F75D7FA19', '804587be-c32d-45d4-834c-cba4a1c31500', '25a9353b-ed90-468b-9ae5-31a55d8f88dc', '1ed90464-3093-427c-9f22-0232fbc74c8a', '31587990071', [0, 0, 0, 0, 0, 0, 0]],
  ['f3f1df3d-0879-43a4-93e9-3a9357c5065f', 'SC-APP-0C9ECBA21270', '374fe1f5-5812-45b2-9bfa-2d1b3c732cac', 'e0f8ba14-ec34-45db-87b4-8429c2ea6288', 'b949b349-2d62-4de7-ad5e-b3a3187b0e6c', '31591434536', [0, 0, 0, 0, 1, 0, 0]],
  ['3d645b15-7a9a-400b-8198-a92a9cb965d3', 'SC-APP-904F369C8C4A', 'ea870bc0-517b-4937-8fb4-b72492a3b0bc', 'acfa5923-0edd-46ee-b81b-49d9deedc123', 'ca6d8ff7-eda3-4ab7-b1af-d693f0643838', '31637533240', [0, 0, 0, 1, 1, 0, 0]],
  ['88579100-5424-4069-ae12-1919c99c209c', 'SC-APP-11FCEA64E035', '285e6444-2e59-402f-bbb1-8c57d96075eb', '4096dbd0-b538-4e8a-aaaa-76338125908a', 'cfec031b-3e6a-4552-8705-9e00d9fbfffb', '31641994313', [1, 1, 1, 1, 1, 1, 1]],
];
const RECORD_KEYS = ['missions', 'jobs', 'fields', 'properties', 'clients', 'equipment_kits', 'aircraft'];

function canonicalTargets(targets) {
  return targets.map((target) => [target.applicationId, target.applicationReference, target.invitationId,
    target.organisationId, target.operatingLocationId, target.evidenceSourceWorkflowRunId,
    RECORD_KEYS.map((key) => target.expectedActiveRecords?.[key])]);
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1
    || JSON.stringify(canonicalTargets(manifest?.targets || [])) !== JSON.stringify(EXACT_TARGETS)
    || manifest.targets.some((target) => Object.keys(target.expectedActiveRecords).sort().join(',') !== [...RECORD_KEYS].sort().join(','))) {
    throw new Error('Archive refused: manifest does not match the exact Founder-authorised manifest.');
  }
  return manifest;
}

function verifyPrimaryCounts(target, snapshot) {
  for (const key of RECORD_KEYS) {
    if (!Array.isArray(snapshot?.records?.[key]) || snapshot.records[key].length !== target.expectedActiveRecords[key]) {
      throw new Error(`Archive refused: ${key} count differs for controlled organisation ${target.organisationId}.`);
    }
  }
}

async function runControlledResidualArchive({ manifest, client, buildSnapshot, archiveSnapshot }) {
  validateManifest(manifest);
  const snapshots = [];
  for (const target of manifest.targets) {
    const snapshot = await buildSnapshot(target, client);
    verifyPrimaryCounts(target, snapshot);
    snapshots.push(snapshot);
  }
  const results = [];
  for (let index = 0; index < manifest.targets.length; index += 1) {
    const target = manifest.targets[index];
    const result = await archiveSnapshot(target, snapshots[index], client);
    results.push({ organisationId: target.organisationId, archived: result?.archived === true });
  }
  return { preflighted: snapshots.length, results };
}

module.exports = { RECORD_KEYS, runControlledResidualArchive, validateManifest, verifyPrimaryCounts };
