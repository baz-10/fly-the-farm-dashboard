const {
  createOnboardingMailboxHandler,
  createGmailMailboxReader,
} = require('../../server/onboarding-mailbox');

const ENV = {
  E2E_ONBOARDING_MAILBOX_TOKEN: 'test-mailbox-bridge-token-32-characters',
  GOOGLE_MAILBOX_CLIENT_ID: 'google-client-id',
  GOOGLE_MAILBOX_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_MAILBOX_REFRESH_TOKEN: 'google-refresh-token',
};

function request({
  method = 'GET',
  recipient = 'info+sc-onboarding-run-123@flythefarm.com.au',
  after = '2026-08-10T00:00:00.000Z',
  authorization = `Bearer ${ENV.E2E_ONBOARDING_MAILBOX_TOKEN}`,
  protocol = 'https',
} = {}) {
  return {
    method,
    query: { recipient, after },
    headers: {
      authorization,
      'x-forwarded-proto': protocol,
    },
  };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}

function handlerWith(readMailboxMessages = jest.fn().mockResolvedValue([]), env = ENV) {
  return {
    handler: createOnboardingMailboxHandler({ readMailboxMessages, env }),
    readMailboxMessages,
  };
}

test('rejects a request with no bearer token without reading the mailbox', async () => {
  const { handler, readMailboxMessages } = handlerWith();
  const res = response();

  await handler(request({ authorization: null }), res);

  expect(res.statusCode).toBe(401);
  expect(res.body).toEqual({ error: { code: 'MAILBOX_BRIDGE_UNAUTHENTICATED' } });
  expect(readMailboxMessages).not.toHaveBeenCalled();
});

test('rejects a request with the wrong bearer token without reading the mailbox', async () => {
  const { handler, readMailboxMessages } = handlerWith();
  const res = response();

  await handler(request({ authorization: 'Bearer definitely-wrong-token' }), res);

  expect(res.statusCode).toBe(401);
  expect(res.body).toEqual({ error: { code: 'MAILBOX_BRIDGE_UNAUTHENTICATED' } });
  expect(readMailboxMessages).not.toHaveBeenCalled();
});

test('rejects recipients outside the controlled Fly The Farm mailbox', async () => {
  const { handler, readMailboxMessages } = handlerWith();
  const res = response();

  await handler(request({ recipient: 'ben@flythefarm.com.au' }), res);

  expect(res.statusCode).toBe(400);
  expect(res.body).toEqual({ error: { code: 'MAILBOX_RECIPIENT_NOT_ALLOWED' } });
  expect(readMailboxMessages).not.toHaveBeenCalled();
});

test('accepts the base mailbox and controlled onboarding plus aliases', async () => {
  for (const recipient of [
    'info@flythefarm.com.au',
    'info+sc-onboarding-run-123@flythefarm.com.au',
  ]) {
    const { handler, readMailboxMessages } = handlerWith();
    const res = response();

    await handler(request({ recipient }), res);

    expect(res.statusCode).toBe(200);
    expect(readMailboxMessages).toHaveBeenCalledWith({
      recipient,
      after: '2026-08-10T00:00:00.000Z',
    });
  }
});

test('returns only messages received strictly after the requested timestamp', async () => {
  const readMailboxMessages = jest.fn().mockResolvedValue([
    { receivedAt: '2026-08-09T23:59:59.999Z', links: ['https://old.example.test/invite'] },
    { receivedAt: '2026-08-10T00:00:00.000Z', links: ['https://equal.example.test/invite'] },
    { receivedAt: '2026-08-10T00:00:00.001Z', links: ['https://current.example.test/invite'] },
  ]);
  const { handler } = handlerWith(readMailboxMessages);
  const res = response();

  await handler(request(), res);

  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({
    messages: [{
      receivedAt: '2026-08-10T00:00:00.001Z',
      links: ['https://current.example.test/invite'],
    }],
  });
});

test('redacts bodies, credentials, non-HTTPS links, and unapproved fields from the response', async () => {
  const readMailboxMessages = jest.fn().mockResolvedValue([{
    receivedAt: '2026-08-10T00:01:00.000Z',
    links: ['https://safe.example.test/invite', 'http://unsafe.example.test/invite'],
    body: 'private message body',
    bearerToken: ENV.E2E_ONBOARDING_MAILBOX_TOKEN,
    oauthCredential: ENV.GOOGLE_MAILBOX_REFRESH_TOKEN,
    subject: 'Invitation',
  }]);
  const { handler } = handlerWith(readMailboxMessages);
  const res = response();

  await handler(request(), res);

  expect(res.body).toEqual({ messages: [{
    receivedAt: '2026-08-10T00:01:00.000Z',
    links: ['https://safe.example.test/invite'],
  }] });
  const serialised = JSON.stringify(res.body);
  expect(serialised).not.toContain('private message body');
  expect(serialised).not.toContain(ENV.E2E_ONBOARDING_MAILBOX_TOKEN);
  expect(serialised).not.toContain(ENV.GOOGLE_MAILBOX_REFRESH_TOKEN);
  expect(serialised).not.toContain('subject');
});

test.each([
  ['POST', 'https', 405, 'MAILBOX_BRIDGE_METHOD_NOT_ALLOWED'],
  ['GET', 'http', 400, 'MAILBOX_BRIDGE_HTTPS_REQUIRED'],
])('rejects unsupported transport %s over %s', async (method, protocol, status, code) => {
  const { handler, readMailboxMessages } = handlerWith();
  const res = response();

  await handler(request({ method, protocol }), res);

  expect(res.statusCode).toBe(status);
  expect(res.body).toEqual({ error: { code } });
  expect(readMailboxMessages).not.toHaveBeenCalled();
});

test('Gmail reader uses OAuth offline credentials and returns only timestamps and HTTPS links', async () => {
  const fetchImpl = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'short-lived-access-token' }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: [{ id: 'message-1' }] }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        internalDate: String(Date.parse('2026-08-10T00:02:00.000Z')),
        payload: {
          mimeType: 'text/html',
          body: {
            data: Buffer.from('<p>Private body <a href="https://spray-command.test/onboarding/accept?invitation=one&amp;source=email">Activate</a></p>').toString('base64url'),
          },
        },
      }),
    });
  const readMailboxMessages = createGmailMailboxReader({ env: ENV, fetchImpl });

  const result = await readMailboxMessages({
    recipient: 'info+sc-onboarding-run-123@flythefarm.com.au',
    after: '2026-08-10T00:00:00.000Z',
  });

  expect(result).toEqual([{ receivedAt: '2026-08-10T00:02:00.000Z', links: [
    'https://spray-command.test/onboarding/accept?invitation=one&source=email',
  ] }]);
  expect(fetchImpl.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
  expect(String(fetchImpl.mock.calls[1][0])).toContain('gmail.googleapis.com/gmail/v1/users/me/messages');
  expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer short-lived-access-token');
  expect(JSON.stringify(result)).not.toContain('Private body');
  expect(JSON.stringify(result)).not.toContain('short-lived-access-token');
});
