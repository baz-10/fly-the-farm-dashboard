const deploymentIdentity = require('../../api/v1/deployment');

function response() {
  return {
    statusCode: 200, body: null, headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

afterEach(() => delete process.env.VERCEL_GIT_COMMIT_SHA);

test('returns only the exact deployed commit without caching', () => {
  process.env.VERCEL_GIT_COMMIT_SHA = 'A'.repeat(40);
  const res = response();
  deploymentIdentity({}, res);
  expect(res).toMatchObject({
    statusCode: 200,
    body: { data: { commitSha: 'a'.repeat(40) } },
    headers: { 'Cache-Control': 'no-store' },
  });
});
test.each(['', 'not-a-sha', 'a'.repeat(39)])('fails closed when deployment identity is invalid', (value) => {
  process.env.VERCEL_GIT_COMMIT_SHA = value;
  const res = response();
  deploymentIdentity({}, res);
  expect(res).toMatchObject({ statusCode: 503, body: { error: { code: 'DEPLOYMENT_IDENTITY_UNAVAILABLE' } } });
});
