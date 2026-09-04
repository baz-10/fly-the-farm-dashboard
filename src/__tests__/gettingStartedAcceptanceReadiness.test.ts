import {
  gettingStartedReadinessDiagnostic,
  validateGettingStartedReadiness,
} from '../../e2e/acceptance/fixtures/gettingStartedReadiness';

const projection = {
  data: {
    organisation: { id: '2fbb7c64-68d2-4aa7-a265-510e13653631' },
    steps: [],
  },
};

test('accepts only a successful authoritative Getting Started projection', () => {
  expect(validateGettingStartedReadiness({
    status: 200,
    body: projection,
    requestId: 'request-123',
    durationMs: 12_345,
  })).toEqual(projection.data);
});

test('reports only bounded safe API diagnostics for a failed readiness response', () => {
  expect(() => validateGettingStartedReadiness({
    status: 403,
    body: {
      error: { code: 'FORBIDDEN', message: 'Getting Started is unavailable.' },
      correlationId: 'correlation-123',
      password: 'must-not-appear',
      payload: { bearerToken: 'must-not-appear' },
    },
    requestId: 'request-123',
    durationMs: 1_234,
  })).toThrow(
    'ONBOARDING_GETTING_STARTED_FAILED status=403 code=FORBIDDEN message=Getting Started is unavailable. correlation=correlation-123 request=request-123 durationMs=1234',
  );
});

test('fails closed when a successful response does not contain a projection', () => {
  expect(() => validateGettingStartedReadiness({
    status: 200,
    body: { data: { organisation: {} }, secret: 'must-not-appear' },
    requestId: '',
    durationMs: 50,
  })).toThrow('ONBOARDING_GETTING_STARTED_RESPONSE_INVALID status=200 request=unavailable durationMs=50');
});

test('normalises untrusted diagnostic fields without emitting nested content', () => {
  expect(gettingStartedReadinessDiagnostic({
    status: 500,
    body: {
      error: { code: 'INTERNAL\nERROR', message: 'Failed\r\nrequest' },
      correlationId: { secret: 'must-not-appear' },
    },
    requestId: 'request\n123',
    durationMs: Number.NaN,
  })).toEqual({
    status: 500,
    code: 'INTERNAL ERROR',
    message: 'Failed request',
    correlationId: 'unavailable',
    requestId: 'request 123',
    durationMs: 0,
  });
});
