import { expect, Page, Response } from '@playwright/test';

const AUTHORITATIVE_READ_PATHS = new Set([
  '/api/v1/session',
  '/api/v1/clients',
  '/api/v1/properties',
  '/api/v1/fields',
  '/api/v1/operating-locations',
  '/api/v1/jobs',
  '/api/v1/missions',
]);

export async function openMissionCreationWorkspace(page: Page): Promise<void> {
  const responses = new Map<string, number>();
  const requestFailures = new Map<string, string>();
  const consoleErrors: string[] = [];

  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (AUTHORITATIVE_READ_PATHS.has(path)) responses.set(path, response.status());
  });
  page.on('requestfailed', (request) => {
    const path = new URL(request.url()).pathname;
    if (AUTHORITATIVE_READ_PATHS.has(path)) {
      requestFailures.set(path, request.failure()?.errorText || 'REQUEST_FAILED');
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 240));
  });

  await page.goto('/missions/new');
  const workspace = page.getByRole('region', { name: 'Mission creation workspace' });
  try {
    // Production Beta may cold-start the trusted session and operational API
    // functions. Wait for authoritative readiness, not transient display copy.
    await expect(workspace).toBeVisible({ timeout: 45_000 });
  } catch (error) {
    const loading = await page.getByRole('alert').allTextContents().catch(() => []);
    const safeResponses = [...responses.entries()].map(([path, status]) => `${path}:${status}`).join(',') || 'none';
    const safeFailures = [...requestFailures.entries()].map(([path, reason]) => `${path}:${reason}`).join(',') || 'none';
    const safeConsole = consoleErrors.join(' | ') || 'none';
    throw new Error(
      `Mission creation workspace did not become authoritative. url=${page.url()} alerts=${loading.join(' | ') || 'none'} responses=${safeResponses} requestFailures=${safeFailures} consoleErrors=${safeConsole}`,
      { cause: error },
    );
  }

  await expect(page.getByRole('heading', { name: 'Create a Mission' })).toBeVisible();
}

export async function runSingleAuthoritativeCommand(
  page: Page,
  input: { pathname: string; method: string; expectedStatus: number },
  action: () => Promise<void>,
): Promise<Response> {
  let matchingRequests = 0;
  const count = (request: { url(): string; method(): string }) => {
    const url = new URL(request.url());
    if (url.pathname === input.pathname && request.method() === input.method) matchingRequests += 1;
  };
  page.on('request', count);
  try {
    // Register the response observer before invoking the browser action. A click,
    // route transition or DOM update is not command-completion authority.
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === input.pathname && response.request().method() === input.method;
    });
    await action();
    const response = await responsePromise;
    expect(response.status()).toBe(input.expectedStatus);
    expect(matchingRequests, `${input.method} ${input.pathname} should be sent once`).toBe(1);
    return response;
  } finally {
    page.off('request', count);
  }
}
