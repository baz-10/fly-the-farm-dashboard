import { readFile, writeFile } from 'node:fs/promises';
import { chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  archiveControlledSnapshot,
  buildControlledSnapshot,
  createTrustedClient,
} from './verifyCommercialOnboardingPostgres.mjs';
import core from './controlledResidualArchiveCore.cjs';

const { validateManifest, verifyPrimaryCounts } = core;
export const runControlledResidualArchive = (options) => core.runControlledResidualArchive({
  client: options.client || createTrustedClient(),
  buildSnapshot: options.buildSnapshot || ((target, client) => buildControlledSnapshot(target, client)),
  archiveSnapshot: options.archiveSnapshot || ((target, snapshot, client) => archiveControlledSnapshot(target, snapshot, client)),
  manifest: options.manifest,
});
export { validateManifest };

async function main() {
  const [mode, manifestPath, snapshotsPath] = process.argv.slice(2);
  if (!['--preflight', '--archive'].includes(mode) || !manifestPath || !snapshotsPath) {
    throw new Error('Expected --preflight or --archive with manifest and protected snapshot path.');
  }
  const manifest = validateManifest(JSON.parse(await readFile(resolve(manifestPath), 'utf8')));
  const client = createTrustedClient();
  if (mode === '--preflight') {
    const snapshots = [];
    for (const target of manifest.targets) {
      const snapshot = await buildControlledSnapshot(target, client);
      verifyPrimaryCounts(target, snapshot);
      snapshots.push(snapshot);
    }
    await writeFile(resolve(snapshotsPath), JSON.stringify({ schemaVersion: 1, snapshots }), { mode: 0o600 });
    chmodSync(resolve(snapshotsPath), 0o600);
    process.stdout.write(`Preflight passed for ${snapshots.length} exact controlled organisations.\n`);
    return;
  }
  const retained = JSON.parse(await readFile(resolve(snapshotsPath), 'utf8'));
  if (retained?.schemaVersion !== 1 || !Array.isArray(retained.snapshots) || retained.snapshots.length !== 5) {
    throw new Error('Archive refused: protected preflight snapshots are incomplete.');
  }
  for (let index = 0; index < manifest.targets.length; index += 1) {
    const target = manifest.targets[index];
    const snapshot = retained.snapshots[index];
    if (snapshot?.organisationId !== target.organisationId) throw new Error('Archive refused: snapshot order or identity differs.');
    verifyPrimaryCounts(target, snapshot);
    const result = await archiveControlledSnapshot(target, snapshot, client);
    if (result?.archived !== true) throw new Error(`Archive refused for controlled organisation ${target.organisationId}.`);
    process.stdout.write(`Archived controlled organisation ${target.organisationId}.\n`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
