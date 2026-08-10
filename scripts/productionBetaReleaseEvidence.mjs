const migrationIdPattern = /^\d{14}$/;
const migrationLikePattern = /(?:^|\D)\d{14}(?!\d)/;
const ansiPattern = /\u001B\[[0-?]*[ -/]*[@-~]/g;
const migrationPlanWarningPattern = /^\s*(?:WARN(?:ING)?\b|Skipping migration\b)/i;
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

const sameOrderedIds = (left, right) => (
  left.length === right.length && left.every((id, index) => id === right[index])
);

const renderedIds = (ids) => (ids.length > 0 ? ids.join(',') : 'NONE');

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
  if (lines.some((line) => migrationPlanWarningPattern.test(line))) {
    throw new Error('Supabase migration plan contains an unrecognised warning');
  }

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

export function parseMigrationLedgerState(output) {
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

  const repositoryIds = [];
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
    if (localId) repositoryIds.push(localId);
    if (remoteId) remoteIds.push(remoteId);
  }

  lines.forEach((line, index) => {
    if (migrationLikePattern.test(line) && !migrationLineIndexes.has(index)) {
      throw new Error('Migration-like output appeared outside the Supabase migration ledger');
    }
  });
  return {
    repositoryIds: assertMigrationIds('repositoryIds', repositoryIds),
    remoteIds: assertMigrationIds('remoteIds', remoteIds),
  };
}

export function parseMigrationLedger(output) {
  return parseMigrationLedgerState(output).remoteIds;
}

export function verifyMigrationPlan({ repositoryIds, preRemoteIds, plannedIds }) {
  const exactRepositoryIds = assertMigrationIds('repositoryIds', repositoryIds);
  const exactPreRemoteIds = assertMigrationIds('preRemoteIds', preRemoteIds);
  const exactPlannedIds = assertMigrationIds('plannedIds', plannedIds);
  const preRemote = new Set(exactPreRemoteIds);
  const expectedPlannedIds = exactRepositoryIds.filter((id) => !preRemote.has(id));
  if (!sameOrderedIds(exactPlannedIds, expectedPlannedIds)) {
    throw new Error(
      `Planned migrations do not equal repository migrations absent from the pre-apply remote ledger: expected ${renderedIds(expectedPlannedIds)}; received ${renderedIds(exactPlannedIds)}`,
    );
  }
  return {
    repositoryIds: exactRepositoryIds,
    preRemoteIds: exactPreRemoteIds,
    plannedIds: exactPlannedIds,
    verified: true,
  };
}

export function reconcileMigrationLedger({ plannedIds, preRemoteIds, postRemoteIds, pendingAfter }) {
  const exactPlannedIds = assertMigrationIds('plannedIds', plannedIds);
  const exactPreRemoteIds = assertMigrationIds('preRemoteIds', preRemoteIds);
  const exactPostRemoteIds = assertMigrationIds('postRemoteIds', postRemoteIds);
  const exactPendingAfter = assertMigrationIds('pendingAfter', pendingAfter);
  const postRemote = new Set(exactPostRemoteIds);
  const removedPreRemoteIds = exactPreRemoteIds.filter((id) => !postRemote.has(id));
  if (removedPreRemoteIds.length > 0) {
    throw new Error(`Pre-apply remote migrations absent after apply: ${removedPreRemoteIds.join(', ')}`);
  }
  const preRemote = new Set(exactPreRemoteIds);
  const appliedIds = exactPostRemoteIds.filter((id) => !preRemote.has(id));
  if (!sameOrderedIds(exactPlannedIds, appliedIds)) {
    throw new Error(
      `Applied remote migration delta does not exactly equal the plan: expected ${renderedIds(exactPlannedIds)}; received ${renderedIds(appliedIds)}`,
    );
  }
  if (exactPendingAfter.length > 0) {
    throw new Error(`Repository migrations still pending after apply: ${exactPendingAfter.join(', ')}`);
  }
  return {
    plannedIds: exactPlannedIds,
    preRemoteIds: exactPreRemoteIds,
    postRemoteIds: exactPostRemoteIds,
    appliedIds,
    pendingAfter: exactPendingAfter,
    verified: true,
  };
}

export function parseVercelDeploymentIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Vercel deployment evidence must be an object');
  }
  const deploymentId = String(value.id || value.uid || '').trim();
  if (!/^dpl_[A-Za-z0-9_-]+$/.test(deploymentId)) throw new Error('Vercel deployment ID is missing or invalid');
  const rawTimestamp = value.createdAt ?? value.created;
  const timestamp = new Date(typeof rawTimestamp === 'number' ? rawTimestamp : String(rawTimestamp || ''));
  if (Number.isNaN(timestamp.valueOf())) throw new Error('Vercel deployment timestamp is missing or invalid');
  const deploymentState = String(value.readyState || value.state || value.status || '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_-]*$/.test(deploymentState)) throw new Error('Vercel deployment state is missing or invalid');
  return {
    deploymentId,
    deploymentTimestamp: timestamp.toISOString(),
    deploymentState,
  };
}

const arrayEvidence = (value, missing = 'NOT_VERIFIED') => (
  Array.isArray(value) ? JSON.stringify(value) : missing
);

const scalarEvidence = (value, missing = 'NOT_RUN') => (
  value === undefined || value === null || value === '' ? missing : String(value)
);

const tableValue = (value) => `\`${String(value).replace(/[`\r\n|]/g, ' ')}\``;

const releaseFailureStage = (evidence, releaseResult, acceptanceResult) => {
  const stages = [
    ['MIGRATION_APPLY', evidence.migrationApplyOutcome],
    ['MIGRATION_LEDGER_VERIFICATION', evidence.migrationLedgerOutcome],
    ['DEPLOYMENT_CREATION', evidence.deploymentCreationOutcome],
    ['DEPLOYMENT_IDENTITY_CAPTURE', evidence.deploymentIdentityOutcome],
    ['DEPLOYMENT_READY_WAIT', evidence.deploymentReadyOutcome],
    ['DEPLOYMENT_METADATA_VERIFICATION', evidence.deploymentMetadataOutcome],
    ['RUNTIME_RELEASE_SHA_VERIFICATION', evidence.runtimeVerificationOutcome],
  ];
  const failedStage = stages.find(([, outcome]) => (
    ['failure', 'cancelled'].includes(String(outcome || '').toLowerCase())
  ));
  if (failedStage) return failedStage[0];
  if (releaseResult !== 'success') return 'RELEASE_JOB';
  if (acceptanceResult !== 'success') return 'OPERATIONAL_ACCEPTANCE';
  return 'NONE';
};

export function buildReleaseRecord(evidence) {
  if (!evidence || evidence.migrationBoundaryCrossed !== true) {
    throw new Error('Release attempt did not cross the migration boundary');
  }
  if (typeof evidence.releaseSha !== 'string' || !/^[0-9a-fA-F]{40}$/.test(evidence.releaseSha)) {
    throw new Error('Release SHA must be a 40-character hexadecimal commit SHA');
  }
  if (typeof evidence.workflowRunId !== 'string' || !/^\d+$/.test(evidence.workflowRunId)) {
    throw new Error('Workflow run ID is required');
  }
  const releaseAttemptTimestamp = String(evidence.releaseAttemptTimestamp || '');
  const releaseAttemptDate = new Date(releaseAttemptTimestamp);
  if (Number.isNaN(releaseAttemptDate.valueOf()) || releaseAttemptDate.toISOString() !== releaseAttemptTimestamp) {
    throw new Error('Release attempt timestamp must be an ISO timestamp');
  }

  if (Array.isArray(evidence.repositoryIds)) assertMigrationIds('repositoryIds', evidence.repositoryIds);
  if (Array.isArray(evidence.preRemoteIds)) assertMigrationIds('preRemoteIds', evidence.preRemoteIds);
  if (Array.isArray(evidence.plannedIds)) assertMigrationIds('plannedIds', evidence.plannedIds);
  if (Array.isArray(evidence.postRemoteIds)) assertMigrationIds('postRemoteIds', evidence.postRemoteIds);
  if (Array.isArray(evidence.pendingAfter)) assertMigrationIds('pendingAfter', evidence.pendingAfter);

  const releaseResult = scalarEvidence(evidence.releaseResult, 'unknown');
  const acceptanceDidRun = releaseResult === 'success'
    && evidence.deployedShaVerified === true
    && evidence.acceptanceResult !== 'skipped'
    && evidence.acceptanceResult !== ''
    && evidence.acceptanceResult !== undefined;
  const acceptanceResult = acceptanceDidRun ? String(evidence.acceptanceResult) : 'NOT_RUN';
  const classification = releaseResult !== 'success'
    ? 'PARTIAL_RELEASE'
    : (acceptanceResult === 'success' ? 'ACCEPTED' : 'NOT_ACCEPTED');
  const ledgerVerified = evidence.migrationLedgerVerified === true ? 'true' : 'false';
  const deployedShaVerified = evidence.deployedShaVerified === true ? 'true' : 'false';
  const failureStage = releaseFailureStage(evidence, releaseResult, acceptanceResult);
  const deploymentCreated = evidence.deploymentCreationOutcome === 'success';
  const missingDeploymentEvidence = deploymentCreated ? 'NOT_CAPTURED' : 'NOT_CREATED';

  const rows = [
    ['Release classification', classification],
    ['Release SHA', evidence.releaseSha.toLowerCase()],
    ['Workflow run ID', evidence.workflowRunId],
    ['Release attempt timestamp', releaseAttemptTimestamp],
    ['Failure stage', failureStage],
    ['Migration boundary crossed', 'true'],
    ['Repository migration IDs', arrayEvidence(evidence.repositoryIds)],
    ['Planned migration IDs', arrayEvidence(evidence.plannedIds)],
    ['Pre-apply remote migration IDs', arrayEvidence(evidence.preRemoteIds)],
    ['Post-apply remote migration IDs', arrayEvidence(evidence.postRemoteIds)],
    ['Repository migrations pending after apply', arrayEvidence(evidence.pendingAfter)],
    ['Migration ledger verified', ledgerVerified],
    ['Release job result', releaseResult],
    ['Deployment state', scalarEvidence(evidence.deploymentState, missingDeploymentEvidence)],
    ['Deployment ID', scalarEvidence(evidence.deploymentId, missingDeploymentEvidence)],
    ['Deployment timestamp', scalarEvidence(evidence.deploymentTimestamp, missingDeploymentEvidence)],
    ['Deployed SHA verified', deployedShaVerified],
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
  if (command === 'ledger-state') {
    process.stdout.write(JSON.stringify(parseMigrationLedgerState(await readStdin())));
    return;
  }
  if (command === 'verify-plan') {
    process.stdout.write(JSON.stringify(verifyMigrationPlan({
      repositoryIds: parseJsonEnvironment('REPOSITORY_MIGRATION_IDS'),
      preRemoteIds: parseJsonEnvironment('PRE_REMOTE_MIGRATION_IDS'),
      plannedIds: parseJsonEnvironment('PLANNED_MIGRATION_IDS'),
    })));
    return;
  }
  if (command === 'reconcile') {
    process.stdout.write(JSON.stringify(reconcileMigrationLedger({
      plannedIds: parseJsonEnvironment('PLANNED_MIGRATION_IDS'),
      preRemoteIds: parseJsonEnvironment('PRE_REMOTE_MIGRATION_IDS'),
      postRemoteIds: parseJsonEnvironment('POST_REMOTE_MIGRATION_IDS'),
      pendingAfter: parseJsonEnvironment('PENDING_MIGRATION_IDS'),
    })));
    return;
  }
  if (command === 'deployment') {
    process.stdout.write(JSON.stringify(parseVercelDeploymentIdentity(JSON.parse(await readStdin()))));
    return;
  }
  if (command === 'record') {
    process.stdout.write(buildReleaseRecord({
      releaseSha: process.env.RELEASE_SHA,
      migrationBoundaryCrossed: environmentBoolean('MIGRATION_BOUNDARY_CROSSED'),
      workflowRunId: process.env.WORKFLOW_RUN_ID,
      releaseAttemptTimestamp: process.env.RELEASE_ATTEMPT_TIMESTAMP,
      repositoryIds: optionalJsonEnvironment('REPOSITORY_MIGRATION_IDS'),
      preRemoteIds: optionalJsonEnvironment('PRE_REMOTE_MIGRATION_IDS'),
      plannedIds: optionalJsonEnvironment('MIGRATION_IDS'),
      postRemoteIds: optionalJsonEnvironment('POST_REMOTE_MIGRATION_IDS'),
      pendingAfter: optionalJsonEnvironment('PENDING_MIGRATION_IDS'),
      migrationLedgerVerified: environmentBoolean('MIGRATION_LEDGER_VERIFIED'),
      releaseResult: process.env.RELEASE_RESULT,
      migrationApplyOutcome: process.env.MIGRATION_APPLY_OUTCOME,
      migrationLedgerOutcome: process.env.MIGRATION_LEDGER_OUTCOME,
      deploymentCreationOutcome: process.env.DEPLOYMENT_CREATION_OUTCOME,
      deploymentIdentityOutcome: process.env.DEPLOYMENT_IDENTITY_OUTCOME,
      deploymentReadyOutcome: process.env.DEPLOYMENT_READY_OUTCOME,
      deploymentMetadataOutcome: process.env.DEPLOYMENT_METADATA_OUTCOME,
      runtimeVerificationOutcome: process.env.RUNTIME_VERIFICATION_OUTCOME,
      deploymentId: process.env.DEPLOYMENT_ID,
      deploymentTimestamp: process.env.DEPLOYMENT_TIMESTAMP,
      deploymentState: process.env.DEPLOYMENT_STATE,
      deployedShaVerified: environmentBoolean('DEPLOYED_SHA_VERIFIED'),
      acceptanceResult: process.env.ACCEPTANCE_RESULT,
    }));
    return;
  }
  throw new Error('Usage: productionBetaReleaseEvidence.mjs <plan|ledger|ledger-state|verify-plan|reconcile|deployment|record>');
}

if (process.argv[1]?.endsWith('productionBetaReleaseEvidence.mjs')) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
