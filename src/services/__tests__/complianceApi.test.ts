import { ComplianceApiError, createComplianceApi } from '../complianceApi';

const response = (status: number, body: string, contentType = 'text/plain') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => name.toLowerCase() === 'content-type' ? contentType : null },
  text: jest.fn().mockResolvedValue(body),
}) as unknown as Response;

test('explains an oversized compliance upload rejected before the API handler', async () => {
  const fetcher = jest.fn().mockResolvedValue(response(413, 'FUNCTION_PAYLOAD_TOO_LARGE')) as unknown as typeof fetch;

  await expect(createComplianceApi(fetcher).overview()).rejects.toMatchObject({
    name: 'Error',
    code: 'FUNCTION_PAYLOAD_TOO_LARGE',
    status: 413,
    message: 'The compliance file is too large for the old upload route. Use the secure file upload and try again.',
  });
});

test('preserves safe API error code and correlation reference', async () => {
  const fetcher = jest.fn().mockResolvedValue(response(409, JSON.stringify({
    error: { code: 'VERSION_CONFLICT', message: 'The authority changed before save.', correlationId: 'corr-safe-123' },
  }), 'application/json')) as unknown as typeof fetch;

  let caught: unknown;
  try { await createComplianceApi(fetcher).overview(); } catch (error) { caught = error; }

  expect(caught).toBeInstanceOf(ComplianceApiError);
  expect(caught).toMatchObject({ code: 'VERSION_CONFLICT', status: 409, correlationId: 'corr-safe-123' });
});
