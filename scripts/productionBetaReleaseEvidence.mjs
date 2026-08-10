const migrationIdPattern = /^\d{14}$/;
const migrationLikePattern = /(?:^|\D)\d{14}(?!\d)/;
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const ledgerConnectionPattern = /^\s*Connecting to remote database\.\.\.\s*$/;
const ledgerHeaderPattern = /^\s*Local\s*│\s*Remote\s*│\s*Time \(UTC\)\s*$/i;
const ledgerSeparatorPattern = /^\s*[-─]+\s*┼\s*[-─]+\s*┼\s*[-─]+\s*$/;
const ledgerRowPattern = /^\s*(\d{14})?\s*│\s*(\d{14})?\s*│\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}|\d{14})\s*$/;

const cleanOutput = (output) => {
  if (typeof output !== 'string') throw new TypeError('Supabase output must be a string');
  return output.replace(ansiPattern, '').replace(/\r/g, '');
};

const assertMigrationIds = (name, value) => {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const duplicateIds = value.filter((id, index) => value.indexOf(id) !== index);
  const invalidIds = value.filter((id) => typeof id !== 'string' || !migrationIdPattern.test(id));
  if (invalidIds.length > 0) throw new Error(`${name} contains invalid migration IDs: ${invalidIds.join(', ')}`);
  if (duplicateIds.length > 0) throw new Error(`${name} contains duplicate migration IDs: ${[...new Set(duplicateIds)].join(', ')}`);
  return [...value];
};

const renderedMigrationTime = (id) => {
  const isoTime = `${id.slice(0, 4)}-${id.slice(4, 6)}-${id.slice(6, 8)}T${id.slice(8, 10)}:${id.slice(10, 12)}:${id.slice(12, 14)}`;
  const date = new Date(`${isoTime}Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 19) === isoTime
    ? isoTime.replace('T', ' ')
    : id;
};

export function parseMigrationPlan(output) {
  const lines = cleanOutput(output).split('\n');
  const nonEmptyLines = lines.filter((line) => line.trim() !== '');
  if (nonEmptyLines.length === 0) throw new Error('Supabase migration plan output is empty');

  const planHeaders = lines
    .map((line, index) => (line.trim() === 'Would push these migrations:' ? index : -1))
    .filter((index) => index >= 0);
  const upToDateLines = lines.filter((line) => line.trim() === 'Remote database is up to date.');
  if (planHeaders.length > 1 || upToDateLines.length > 1 || (planHeaders.length > 0 && upToDateLines.length > 0)) {
    throw new Error('Supabase migration plan contains ambiguous terminal states');
  }

  if (upToDateLines.length === 1) {
    if (lines.some((line) => migrationLikePattern.test(line))) {
      throw new Error('Migration-like output appeared outside an explicit migration plan');
    }
    return [];
  }

  if (planHeaders.length !== 1) throw new Error('Supabase migration plan has no recognised terminal state');

  const ids = [];
  const migrationLineIndexes = new Set();
  const headerIndex = planHeaders[0];
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*•\s+(\d{14})_[A-Za-z0-9_-]+\.sql\s*$/);
    if (!match) {
      if (line.trim() === '' && ids.length === 0) continue;
      break;
    }
    ids.push(match[1]);
    migrationLineIndexes.add(index);
  }

  if (ids.length === 0) throw new Error('Supabase migration plan did not contain repository migration bullets');
  lines.forEach((line, index) => {
    if (migrationLikePattern.test(line) && !migrationLineIndexes.has(index)) {
      throw new Error('Migration-like output appeared outside an explicit migration plan');
    }
  });
  return assertMigrationIds('plannedIds', ids);
}

export function parseMigrationLedger(output) {
  const lines = cleanOutput(output).split('\n').map((line) => line.replace(/`/g, ''));
  const headerMatches = lines
    .map((line, index) => ({ index, match: line.match(ledgerHeaderPattern) }))
    .filter(({ match }) => match);
  if (headerMatches.length !== 1) {
    throw new Error('Supabase migration ledger header is missing');
  }

  const [{ index: headerIndex }] = headerMatches;
  const connectionIndexes = lines
    .map((line, index) => (ledgerConnectionPattern.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (connectionIndexes.length !== 1 || connectionIndexes[0] > headerIndex) {
    throw new Error('Supabase migration ledger connection marker is missing');
  }
  const separatorIndex = lines.findIndex((line, index) => index > headerIndex && line.trim() !== '');
  if (separatorIndex < 0 || !ledgerSeparatorPattern.test(lines[separatorIndex])) {
    throw new Error('Supabase migration ledger separator is malformed');
  }

  const remoteIds = [];
  const migrationLineIndexes = new Set();
  for (let index = separatorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    const match = line.match(ledgerRowPattern);
    if (!match) throw new Error('Supabase migration ledger row is malformed');
    const [, localId, remoteId, renderedTime] = match;
    if ((!localId && !remoteId) || (localId && remoteId && localId !== remoteId)) {
      throw new Error('Supabase migration ledger row is malformed');
    }
    const timeId = remoteId || localId;
    if (renderedTime !== renderedMigrationTime(timeId)) {
      throw new Error('Supabase migration ledger row is malformed');
    }
    migrationLineIndexes.add(index);
    if (remoteId) remoteIds.push(remoteId);
  }

  lines.forEach((line, index) => {
    if (migrationLikePattern.test(line) && !migrationLineIndexes.has(index)) {
      throw new Error('Migration-like output appeared outside the Supabase migration ledger');
    }
  });
  return assertMigrationIds('remoteIds', remoteIds);
}

export function reconcileMigrationLedger({ plannedIds, remoteIds, pendingAfter }) {
  const exactPlannedIds = assertMigrationIds('plannedIds', plannedIds);
  const exactRemoteIds = assertMigrationIds('remoteIds', remoteIds);
  const exactPendingAfter = assertMigrationIds('pendingAfter', pendingAfter);
  const remote = new Set(exactRemoteIds);
  const absent = exactPlannedIds.filter((id) => !remote.has(id));
  if (absent.length > 0) throw new Error(`Planned migrations absent from remote ledger: ${absent.join(', ')}`);
  if (exactPendingAfter.length > 0) {
    throw new Error(`Repository migrations still pending after apply: ${exactPendingAfter.join(', ')}`);
  }
  return {
    plannedIds: exactPlannedIds,
    remoteIds: exactRemoteIds,
    pendingAfter: exactPendingAfter,
    verified: true,
  };
}

const arrayEvidence = (value, missing = 'NOT_VERIFIED') => (
  Array.isArray(value) ? JSON.stringify(value) : missing
);

const scalarEvidence = (value, missing = 'NOT_RUN') => (
  value === undefined || value === null || value === '' ? missing : String(value)
);

const tableValue = (value) => `\`${String(value).replace(/[`\r\n|]/g, ' ')}\``;

export function buildReleaseRecord(evidence) {
  if (!evidence || evidence.migrationBoundaryCrossed !== true) {
    throw new Error('Release attempt did not cross the migration boundary');
  }
  if (typeof evidence.releaseSha !== 'string' || !/^[0-9a-fA-F]{40}$/.test(evidence.releaseSha)) {
    throw new Error('Release SHA must be a 40-character hexadecimal commit SHA');
  }

  if (Array.isArray(evidence.plannedIds)) assertMigrationIds('plannedIds', evidence.plannedIds);
  if (Array.isArray(evidence.remoteIds)) assertMigrationIds('remoteIds', evidence.remoteIds);
  if (Array.isArray(evidence.pendingAfter)) assertMigrationIds('pendingAfter', evidence.pendingAfter);

  const releaseResult = scalarEvidence(evidence.releaseResult, 'unknown');
  const acceptanceDidRun = releaseResult === 'success'
    && evidence.deployedShaVerified === true
    && evidence.acceptanceResult !== 'skipped'
    && evidence.acceptanceResult !== ''
    && evidence.acceptanceResult !== undefined;
  const acceptanceResult = acceptanceDidRun ? String(evidence.acceptanceResult) : 'NOT_RUN';
  const acceptanceRunId = acceptanceDidRun ? scalarEvidence(evidence.acceptanceRunId) : 'NOT_RUN';
  const classification = releaseResult !== 'success'
    ? 'PARTIAL_RELEASE'
    : (acceptanceResult === 'success' ? 'ACCEPTED' : 'NOT_ACCEPTED');
  const ledgerVerified = evidence.migrationLedgerVerified === true ? 'true' : 'false';
  const deployedShaVerified = evidence.deployedShaVerified === true ? 'true' : 'false';

  const rows = [
    ['Release classification', classification],
    ['Release SHA', evidence.releaseSha.toLowerCase()],
    ['Migration boundary crossed', 'true'],
    ['Planned migration IDs', arrayEvidence(evidence.plannedIds)],
    ['Remote migration IDs', arrayEvidence(evidence.remoteIds)],
    ['Repository migrations pending after apply', arrayEvidence(evidence.pendingAfter)],
    ['Migration ledger verified', ledgerVerified],
    ['Release job result', releaseResult],
    ['Deployment ID', scalarEvidence(evidence.deploymentId)],
    ['Deployment timestamp', scalarEvidence(evidence.deploymentTimestamp)],
    ['Deployed SHA verified', deployedShaVerified],
    ['Acceptance workflow run ID', acceptanceRunId],
    ['Acceptance result', acceptanceResult],
  ];

  return [
    '## Production Beta Release Record',
    '',
    '| Evidence | Value |',
    '|---|---|',
    ...rows.map(([name, value]) => `| ${name} | ${tableValue(value)} |`),
    '',
  ].join('\n');
}

const readStdin = async () => {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input;
};

const parseJsonEnvironment = (name) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') throw new Error(`${name} is required`);
  return JSON.parse(raw);
};

const optionalJsonEnvironment = (name) => {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? undefined : JSON.parse(raw);
};

const environmentBoolean = (name) => process.env[name] === 'true';

async function main() {
  const [command] = process.argv.slice(2);
  if (command === 'plan') {
    process.stdout.write(JSON.stringify(parseMigrationPlan(await readStdin())));
    return;
  }
  if (command === 'ledger') {
    process.stdout.write(JSON.stringify(parseMigrationLedger(await readStdin())));
    return;
  }
  if (command === 'reconcile') {
    process.stdout.write(JSON.stringify(reconcileMigrationLedger({
      plannedIds: parseJsonEnvironment('PLANNED_MIGRATION_IDS'),
      remoteIds: parseJsonEnvironment('REMOTE_MIGRATION_IDS'),
      pendingAfter: parseJsonEnvironment('PENDING_MIGRATION_IDS'),
    })));
    return;
  }
  if (command === 'record') {
    process.stdout.write(buildReleaseRecord({
      releaseSha: process.env.RELEASE_SHA,
      migrationBoundaryCrossed: environmentBoolean('MIGRATION_BOUNDARY_CROSSED'),
      plannedIds: optionalJsonEnvironment('MIGRATION_IDS'),
      remoteIds: optionalJsonEnvironment('REMOTE_MIGRATION_IDS'),
      pendingAfter: optionalJsonEnvironment('PENDING_MIGRATION_IDS'),
      migrationLedgerVerified: environmentBoolean('MIGRATION_LEDGER_VERIFIED'),
      releaseResult: process.env.RELEASE_RESULT,
      deploymentId: process.env.DEPLOYMENT_ID,
      deploymentTimestamp: process.env.DEPLOYMENT_TIMESTAMP,
      deployedShaVerified: environmentBoolean('DEPLOYED_SHA_VERIFIED'),
      acceptanceRunId: process.env.ACCEPTANCE_RUN_ID,
      acceptanceResult: process.env.ACCEPTANCE_RESULT,
    }));
    return;
  }
  throw new Error('Usage: productionBetaReleaseEvidence.mjs <plan|ledger|reconcile|record>');
}

if (process.argv[1]?.endsWith('productionBetaReleaseEvidence.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
