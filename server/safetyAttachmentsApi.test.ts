import { describe, expect, it, vi } from 'vitest';

const { createSafetyAttachmentHandler } = require('../api/safety-attachments');

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, unknown>,
    body: undefined as unknown,
    setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    end(body?: unknown) { this.body = body; return this; },
  };
}

function plan(tenantId = 'tenant-a', status = 'draft') {
  return {
    id: 'plan-a',
    tenantId,
    currentVersionId: 'v1',
    status,
    versions: [{
      id: 'v1',
      status,
      createdBy: { userId: 'pilot-a', name: 'Pilot A' },
      sourceSnapshot: { crew: [{ id: 'pilot-a', name: 'Pilot A' }] },
      attachments: [],
    }],
  };
}

function request(method: string, headers: Record<string, string> = {}, query = {}) {
  return {
    method,
    headers: {
      origin: 'https://app.example',
      host: 'app.example',
      'x-forwarded-proto': 'https',
      ...headers,
    },
    query,
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('pdf');
    },
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authenticate: vi.fn().mockResolvedValue({
      id: 'pilot-a',
      name: 'Pilot A',
      tenantId: 'tenant-a',
      role: 'contractor',
    }),
    loadPlan: vi.fn().mockResolvedValue(plan()),
    putObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn().mockResolvedValue({
      body: Buffer.from('pdf'),
      contentType: 'application/pdf',
      contentLength: 3,
    }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
    now: () => '2026-07-24T00:00:00.000Z',
    ...overrides,
  };
}

describe('/api/safety-attachments security boundary', () => {
  it('uses the authenticated tenant path and ignores spoofed tenant headers', async () => {
    const deps = dependencies();
    const handler = createSafetyAttachmentHandler(deps);
    const req = request('POST', {
      'content-type': 'application/pdf',
      'content-length': '3',
      'x-safety-plan-id': 'plan-a',
      'x-safety-plan-version-id': 'v1',
      'x-attachment-id': 'a1',
      'x-file-name': 'proof.pdf',
      'x-tenant-id': 'tenant-b',
    });
    const res = response();
    await handler(req, res);
    expect(res.statusCode).toBe(201);
    expect(deps.putObject).toHaveBeenCalledWith(
      'tenant-a/plan-a/v1/a1/proof.pdf',
      expect.any(Buffer),
      'application/pdf',
    );
    expect(JSON.stringify(res.body)).not.toContain('SUPABASE');
  });

  it('fails closed when storage returns a plan from another tenant', async () => {
    const deps = dependencies({ loadPlan: vi.fn().mockResolvedValue(plan('tenant-b')) });
    const res = response();
    await createSafetyAttachmentHandler(deps)(
      request('GET', {}, { planId: 'plan-a', versionId: 'v1' }),
      res,
    );
    expect(res.statusCode).toBe(404);
    expect(deps.getObject).not.toHaveBeenCalled();
  });

  it('allows assigned contractors only on the exact editable current version', async () => {
    const deps = dependencies();
    const res = response();
    await createSafetyAttachmentHandler(deps)(
      request('POST', {
        'content-type': 'application/pdf',
        'content-length': '3',
        'x-safety-plan-id': 'plan-a',
        'x-safety-plan-version-id': 'old-v',
        'x-attachment-id': 'a1',
        'x-file-name': 'proof.pdf',
      }),
      res,
    );
    expect(res.statusCode).toBe(409);
    expect(deps.putObject).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: 'client-a', role: 'client', tenantId: 'tenant-a' }, 403],
    [{ id: 'support-a', role: 'platform_support', tenantId: 'tenant-a' }, 403],
  ])('denies client and platform support identities', async (user, expected) => {
    const deps = dependencies({ authenticate: vi.fn().mockResolvedValue(user) });
    const res = response();
    await createSafetyAttachmentHandler(deps)(
      request('GET', {}, { planId: 'plan-a', versionId: 'v1' }),
      res,
    );
    expect(res.statusCode).toBe(expected);
  });

  it('never deletes approved-version attachments', async () => {
    const deps = dependencies({ loadPlan: vi.fn().mockResolvedValue(plan('tenant-a', 'approved')) });
    const res = response();
    await createSafetyAttachmentHandler(deps)(
      request('DELETE', {}, {
        planId: 'plan-a',
        versionId: 'v1',
        attachmentId: 'a1',
        fileName: 'proof.pdf',
      }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(deps.deleteObject).not.toHaveBeenCalled();
  });

  it('filters malformed cross-tenant manifest entries when listing', async () => {
    const stored = plan();
    stored.versions[0].attachments = [
      { id: 'safe', tenantId: 'tenant-a', versionId: 'v1', fileName: 'safe.pdf' },
      { id: 'leak', tenantId: 'tenant-b', versionId: 'v1', fileName: 'secret.pdf' },
      { id: 'old', tenantId: 'tenant-a', versionId: 'old-v', fileName: 'old.pdf' },
    ];
    const deps = dependencies({ loadPlan: vi.fn().mockResolvedValue(stored) });
    const res = response();
    await createSafetyAttachmentHandler(deps)(
      request('GET', {}, { planId: 'plan-a', versionId: 'v1' }),
      res,
    );
    expect(res.body).toEqual({ attachments: [expect.objectContaining({ id: 'safe' })] });
    expect(JSON.stringify(res.body)).not.toContain('secret.pdf');
  });

  it('rejects missing lengths, oversized bodies, unsupported types and cross-origin writes', async () => {
    const cases = [
      request('POST', {
        'content-type': 'application/pdf',
        'x-safety-plan-id': 'plan-a',
        'x-safety-plan-version-id': 'v1',
        'x-attachment-id': 'a1',
        'x-file-name': 'proof.pdf',
      }),
      request('POST', {
        'content-type': 'application/pdf',
        'content-length': String(3 * 1024 * 1024 + 1),
        'x-safety-plan-id': 'plan-a',
        'x-safety-plan-version-id': 'v1',
        'x-attachment-id': 'a1',
        'x-file-name': 'proof.pdf',
      }),
      request('POST', {
        'content-type': 'text/html',
        'content-length': '3',
        'x-safety-plan-id': 'plan-a',
        'x-safety-plan-version-id': 'v1',
        'x-attachment-id': 'a1',
        'x-file-name': 'proof.html',
      }),
      {
        ...request('POST', {
          'content-type': 'application/pdf',
          'content-length': '3',
          'x-safety-plan-id': 'plan-a',
          'x-safety-plan-version-id': 'v1',
          'x-attachment-id': 'a1',
          'x-file-name': 'proof.pdf',
        }),
        headers: {
          ...request('POST').headers,
          origin: 'https://evil.example',
        },
      },
    ];
    for (const req of cases) {
      const deps = dependencies();
      const res = response();
      await createSafetyAttachmentHandler(deps)(req, res);
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(deps.putObject).not.toHaveBeenCalled();
    }
  });

  it('accepts Vercel-provided binary bodies without reparsing them as JSON', async () => {
    const deps = dependencies();
    const req = {
      ...request('POST', {
        'content-type': 'application/pdf',
        'content-length': '3',
        'x-safety-plan-id': 'plan-a',
        'x-safety-plan-version-id': 'v1',
        'x-attachment-id': 'a1',
        'x-file-name': 'proof.pdf',
      }),
      body: Buffer.from('pdf'),
      [Symbol.asyncIterator]: async function* () {
        throw new Error('the consumed request stream must not be read');
      },
    };
    const res = response();
    await createSafetyAttachmentHandler(deps)(req, res);
    expect(res.statusCode).toBe(201);
    expect(deps.putObject).toHaveBeenCalled();
  });

  it('requires an origin on browser write operations', async () => {
    const deps = dependencies();
    const req = request('POST', {
      'content-type': 'application/pdf',
      'content-length': '3',
      'x-safety-plan-id': 'plan-a',
      'x-safety-plan-version-id': 'v1',
      'x-attachment-id': 'a1',
      'x-file-name': 'proof.pdf',
    });
    delete req.headers.origin;
    const res = response();
    await createSafetyAttachmentHandler(deps)(req, res);
    expect(res.statusCode).toBe(403);
    expect(deps.putObject).not.toHaveBeenCalled();
  });
});
