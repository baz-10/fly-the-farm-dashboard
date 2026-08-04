const { createSupportHandler } = require('../../server/support-api');

function response() { return { statusCode: 200, body: null, headers: {}, setHeader(k,v){this.headers[k]=v;}, status(code){this.statusCode=code;return this;}, json(value){this.body=value;return this;} }; }

test('records request and approval as separate organisation commands', async () => {
  const repository = {
    createRequest: jest.fn().mockResolvedValue({ request_id: 'request-1', state: 'PENDING', row_version: 1 }),
    decideRequest: jest.fn().mockResolvedValue({ approval_id: 'approval-1', requester_is_approver: true, state: 'APPROVED' }),
  };
  const handler = createSupportHandler({ repository, resolveOrganisationContext: async () => ({ organisation: { id: 'org-1' }, internalUser: { id: 'admin-1' }, roles: ['admin'] }) });
  const requestRes = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'request' }, body: { reason: 'Production support', accessMode: 'READ_ONLY', scopeType: 'ORGANISATION', durationMinutes: 120 } }, requestRes);
  expect(requestRes.statusCode).toBe(201);
  expect(repository.createRequest).toHaveBeenCalledTimes(1);

  const approvalRes = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'approve' }, body: { requestId: 'request-1', expectedVersion: 1, decision: 'APPROVE', notes: 'Approved' } }, approvalRes);
  expect(approvalRes.statusCode).toBe(201);
  expect(approvalRes.body.data).toMatchObject({ approval_id: 'approval-1', requester_is_approver: true });
});

test('platform session start does not resolve an organisation membership', async () => {
  const repository = { startSession: jest.fn().mockResolvedValue({ session_id: 'session-1', state: 'ACTIVE' }) };
  const resolveOrganisationContext = jest.fn();
  const handler = createSupportHandler({ repository, resolveOrganisationContext, resolvePlatformContext: async () => ({ platformUser: { id: 'platform-1' }, permissions: ['platform.support.session'] }) });
  const res = response();
  await handler({ method: 'POST', headers: {}, query: { action: 'start' }, body: { requestId: 'request-1' } }, res);
  expect(res.statusCode).toBe(201);
  expect(resolveOrganisationContext).not.toHaveBeenCalled();
  expect(repository.startSession).toHaveBeenCalledWith('platform-1', 'request-1');
});
