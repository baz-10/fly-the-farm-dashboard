const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const requiredFunctionKeys = ['identity', 'returnType', 'definition', 'securityDefiner', 'volatility', 'parallelSafety', 'leakproof', 'configuration', 'owner', 'acl', 'publicExecute', 'serviceRoleExecute'];
const requiredTableKeys = ['identity', 'acl', 'publicPrivileges', 'serviceRolePrivileges'];

const normaliseSql = (value) => String(value)
  .replace(/\r\n?/g, '\n')
  .replace(/\s+/g, ' ')
  .replace(/\s*([(),;=])\s*/g, '$1')
  .trim();

const canonicaliseEvidence = (input) => {
  const canonical = {
    functions: [...(input.functions || [])].map((entry) => ({
      identity: entry.identity,
      returnType: entry.returnType,
      definition: normaliseSql(entry.definition),
      securityDefiner: entry.securityDefiner,
      volatility: entry.volatility,
      parallelSafety: entry.parallelSafety,
      leakproof: entry.leakproof,
      configuration: [...(entry.configuration || [])].sort(),
      owner: entry.owner,
      acl: [...(entry.acl || [])].sort(),
      publicExecute: entry.publicExecute,
      serviceRoleExecute: entry.serviceRoleExecute,
    })).sort((a, b) => a.identity.localeCompare(b.identity)),
    tablePrivileges: [...(input.tablePrivileges || [])].map((entry) => ({
      ...entry,
      acl: [...(entry.acl || [])].sort(),
      publicPrivileges: [...(entry.publicPrivileges || [])].sort(),
      serviceRolePrivileges: [...(entry.serviceRolePrivileges || [])].sort(),
    })).sort((a, b) => a.identity.localeCompare(b.identity)),
  };
  return JSON.stringify(canonical);
};

const complete = (input) => Array.isArray(input?.functions)
  && input.functions.length > 0
  && input.functions.every((entry) => requiredFunctionKeys.every((key) => Object.hasOwn(entry, key)))
  && Array.isArray(input?.tablePrivileges)
  && input.tablePrivileges.length === 1
  && input.tablePrivileges.every((entry) => requiredTableKeys.every((key) => Object.hasOwn(entry, key)));

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

const safeView = (input) => ({
  functions: (input.functions || []).map((entry) => ({
    identity: entry.identity,
    returnType: entry.returnType,
    definitionSha256: digest(normaliseSql(entry.definition)),
    securityDefiner: entry.securityDefiner,
    volatility: entry.volatility,
    parallelSafety: entry.parallelSafety,
    leakproof: entry.leakproof,
    configuration: [...(entry.configuration || [])].sort(),
    owner: entry.owner,
    acl: [...(entry.acl || [])].sort(),
    publicExecute: entry.publicExecute,
    serviceRoleExecute: entry.serviceRoleExecute,
  })),
  tablePrivileges: (input.tablePrivileges || []).map((entry) => ({
    identity: entry.identity,
    acl: [...(entry.acl || [])].sort(),
    publicPrivileges: [...(entry.publicPrivileges || [])].sort(),
    serviceRolePrivileges: [...(entry.serviceRolePrivileges || [])].sort(),
  })),
});

const discrepancyComparison = (expected, live) => {
  const differences = [];
  const walk = (left, right, prefix) => {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) || Array.isArray(right)) {
      differences.push({ path: prefix, expected: left ?? null, live: right ?? null });
      return;
    }
    [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()
      .forEach((key) => walk(left[key], right[key], prefix ? `${prefix}.${key}` : key));
  };
  const expectedSafe = safeView(expected);
  const liveSafe = safeView(live);
  const byIdentity = (entries) => Object.fromEntries(entries.map((entry) => [entry.identity, entry]));
  walk(byIdentity(expectedSafe.functions), byIdentity(liveSafe.functions), 'functions');
  walk(byIdentity(expectedSafe.tablePrivileges), byIdentity(liveSafe.tablePrivileges), 'tablePrivileges');
  return differences.map((difference) => ({
    ...difference,
    path: difference.path
      .replace(/^functions\.(.+\))\.(.+)$/, 'functions[$1].$2')
      .replace(/^tablePrivileges\.(.+)\.(acl|publicPrivileges|serviceRolePrivileges)$/, 'tablePrivileges[$1].$2'),
  }));
};

const compareEvidence = (expected, live) => {
  if (!complete(expected) || !complete(live)) return { result: 'D', discrepancies: ['required evidence missing'] };
  const expectedCanonical = canonicaliseEvidence(expected);
  const liveCanonical = canonicaliseEvidence(live);
  const expectedSha256 = digest(expectedCanonical);
  const liveSha256 = digest(liveCanonical);
  const comparison = expectedCanonical === liveCanonical ? [] : discrepancyComparison(expected, live);
  return {
    result: expectedCanonical === liveCanonical ? 'B' : 'C',
    expectedSha256,
    liveSha256,
    discrepancies: comparison.map(({ path }) => path),
    comparison,
  };
};

const extractFunction = (sql, name) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${escaped}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`, 'i');
  const match = sql.match(pattern);
  if (!match) throw new Error(`EXPECTED_FUNCTION_SOURCE_MISSING:${name}`);
  return { full: match[0], body: match[1] };
};

const buildExpectedEvidence = (root) => {
  const current = fs.readFileSync(path.join(root, 'supabase/migrations/20260813130000_controlled_onboarding_archive_legacy_store_scope.sql'), 'utf8');
  const previous = fs.readFileSync(path.join(root, 'supabase/migrations/20260809140000_commercial_onboarding_acceptance_cleanup.sql'), 'utf8');
  const functionEvidence = (identity, source, volatility, serviceRoleExecute) => ({
    identity,
    returnType: 'jsonb',
    definition: source.body,
    securityDefiner: true,
    volatility,
    parallelSafety: 'unsafe',
    leakproof: false,
    configuration: ['search_path=public, pg_temp'],
    owner: 'postgres',
    acl: serviceRoleExecute ? ['postgres=X/postgres', 'service_role=X/postgres'] : ['postgres=X/postgres'],
    publicExecute: false,
    serviceRoleExecute,
  });
  return {
    functions: [
      functionEvidence('public.ftf_archive_controlled_commercial_onboarding(jsonb)', extractFunction(current, 'ftf_archive_controlled_commercial_onboarding'), 'volatile', true),
      functionEvidence('public.ftf_archive_controlled_commercial_onboarding_without_legacy_store(jsonb)', extractFunction(previous, 'ftf_archive_controlled_commercial_onboarding'), 'volatile', false),
      functionEvidence('public.ftf_project_controlled_onboarding_legacy_store(jsonb)', extractFunction(current, 'ftf_project_controlled_onboarding_legacy_store'), 'stable', true),
    ],
    tablePrivileges: [{
      identity: 'public.ftf_store',
      acl: ['postgres=arwdDxt/postgres', 'service_role=arwd/postgres'],
      publicPrivileges: [],
      serviceRolePrivileges: ['DELETE', 'INSERT', 'SELECT', 'UPDATE'],
    }],
  };
};

if (require.main === module) {
  const [command, root = process.cwd(), livePath] = process.argv.slice(2);
  if (command !== 'compare' || !livePath) throw new Error('USAGE: compare <root> <live-json>');
  const expected = buildExpectedEvidence(root);
  const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));
  const result = compareEvidence(expected, live);
  console.log(`EXPECTED_CANONICAL_SHA256=${result.expectedSha256 || 'UNAVAILABLE'}`);
  console.log(`LIVE_CANONICAL_SHA256=${result.liveSha256 || 'UNAVAILABLE'}`);
  console.log(`RECONCILIATION_RESULT=${result.result}`);
  if (result.discrepancies.length) console.log(`DISCREPANCY=${result.discrepancies.join(';')}`);
  if (result.comparison?.length) console.log(`COMPARISON=${JSON.stringify(result.comparison)}`);
  process.exit(result.result === 'B' ? 0 : 1);
}

module.exports = { canonicaliseEvidence, compareEvidence, buildExpectedEvidence };
