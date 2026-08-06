import { test } from '@playwright/test';
import { acceptanceEnvironment } from './environment';
import { cleanupAcceptanceRecordsByPrefix } from './fixtures/acceptanceRecords';

test('archives stale controlled Production Beta acceptance records', async ({ request }, testInfo) => {
  testInfo.setTimeout(180_000);
  await cleanupAcceptanceRecordsByPrefix(request, { origin: new URL(acceptanceEnvironment().baseUrl).origin });
});
