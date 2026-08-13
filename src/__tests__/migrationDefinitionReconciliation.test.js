const {
  canonicaliseEvidence,
  compareEvidence,
} = require('../../scripts/migrationDefinitionReconciliation.cjs');

const evidence = (overrides = {}) => ({
  functions: [{
    identity: 'public.example(jsonb)',
    returnType: 'jsonb',
    definition: 'CREATE FUNCTION public.example(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path TO public, pg_temp AS $function$ BEGIN RETURN p; END; $function$',
    securityDefiner: true,
    volatility: 'stable',
    parallelSafety: 'unsafe',
    leakproof: false,
    configuration: ['search_path=public, pg_temp'],
    owner: 'postgres',
    acl: ['service_role=X/postgres'],
    publicExecute: false,
    serviceRoleExecute: true,
  }],
  tablePrivileges: [{
    identity: 'public.ftf_store',
    acl: [],
    publicPrivileges: [],
    serviceRolePrivileges: [],
  }],
  ...overrides,
});
const clone = (value) => JSON.parse(JSON.stringify(value));

describe('migration definition reconciliation', () => {
  test('normalises line endings only', () => {
    const first = evidence({ functions: [{
      ...evidence().functions[0],
      definition: 'BEGIN\nRETURN p;\nEND;',
    }] });
    const second = evidence({ functions: [{
      ...first.functions[0],
      definition: first.functions[0].definition.replaceAll('\n', '\r\n'),
    }] });
    expect(canonicaliseEvidence(first)).toEqual(canonicaliseEvidence(second));
  });

  test('preserves a lone carriage return as exact source content', () => {
    const expected = evidence({ functions: [{
      ...evidence().functions[0],
      definition: "RETURN E'A\rB';",
    }] });
    const observed = evidence({ functions: [{
      ...evidence().functions[0],
      definition: "RETURN E'A\nB';",
    }] });
    expect(compareEvidence(expected, observed).result).toBe('C');
  });

  test.each([
    ['literal whitespace', "RETURN 'A  B'", "RETURN 'A B'"],
    ['literal content', "RETURN 'A'", "RETURN 'B'"],
    ['newline inside literal', "RETURN E'A\\nB'", "RETURN E'A B'"],
    ['comment content', 'RETURN p; -- first', 'RETURN p; -- second'],
    ['dollar-quoted content', "RETURN $value$A  B$value$", "RETURN $value$A B$value$"],
    ['added statement', 'RETURN p;', 'PERFORM 1; RETURN p;'],
    ['function call', 'RETURN lower(p::text);', 'RETURN upper(p::text);'],
    ['schema qualification', 'RETURN public.example(p);', 'RETURN private.example(p);'],
    ['predicate', 'IF p IS NULL THEN', 'IF p IS NOT NULL THEN'],
    ['digest expression', "sha256(convert_to(p::text,'UTF8'))", "md5(p::text)"],
  ])('detects exact source difference: %s', (_label, reviewed, live) => {
    const expected = evidence({ functions: [{ ...evidence().functions[0], definition: reviewed }] });
    const observed = evidence({ functions: [{ ...evidence().functions[0], definition: live }] });
    const result = compareEvidence(expected, observed);
    expect(result.result).toBe('C');
    expect(result.discrepancies).toContain('functions[public.example(jsonb)].definitionSha256');
  });

  test('matches byte-identical function source', () => {
    expect(compareEvidence(evidence(), clone(evidence())).result).toBe('B');
  });

  test.each([
    ['function body', (value) => { value.functions[0].definition = value.functions[0].definition.replace('RETURN p', 'RETURN null'); }],
    ['security definer', (value) => { value.functions[0].securityDefiner = false; }],
    ['search path', (value) => { value.functions[0].configuration = ['search_path=pg_catalog']; }],
    ['execute ACL', (value) => { value.functions[0].publicExecute = true; value.functions[0].acl.push('PUBLIC=X/postgres'); }],
    ['table privilege', (value) => { value.tablePrivileges[0].serviceRolePrivileges = ['SELECT']; }],
  ])('detects a %s difference', (_label, mutate) => {
    const live = clone(evidence());
    mutate(live);
    expect(compareEvidence(evidence(), live).result).toBe('C');
  });

  test('reports exact safe discrepancy paths without emitting function bodies', () => {
    const live = clone(evidence());
    live.functions[0].securityDefiner = false;
    live.functions[0].definition = 'SECRET BODY';
    const result = compareEvidence(evidence(), live);
    expect(result.discrepancies).toEqual(expect.arrayContaining([
      'functions[public.example(jsonb)].definitionSha256',
      'functions[public.example(jsonb)].securityDefiner',
    ]));
    expect(JSON.stringify(result)).not.toContain('SECRET BODY');
  });

  test('reports safe expected and live values for each discrepancy', () => {
    const live = evidence();
    live.functions[0].securityDefiner = false;
    live.tablePrivileges[0].serviceRolePrivileges = ['SELECT'];
    const result = compareEvidence(evidence(), live);
    expect(result.comparison).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'functions[public.example(jsonb)].securityDefiner', expected: true, live: false }),
      expect.objectContaining({ path: 'tablePrivileges[public.ftf_store].serviceRolePrivileges', expected: [], live: ['SELECT'] }),
    ]));
  });

  test('classifies identical evidence as independently proven exact', () => {
    const result = compareEvidence(evidence(), clone(evidence()));
    expect(result.result).toBe('B');
    expect(result.expectedSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.liveSha256).toBe(result.expectedSha256);
  });

  test('fails indeterminate when a required live property is absent', () => {
    const live = clone(evidence());
    delete live.functions[0].owner;
    expect(compareEvidence(evidence(), live).result).toBe('D');
  });
});
