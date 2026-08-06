import { test } from '@playwright/test';
import { cleanupAcceptanceRecordsByPrefix } from './fixtures/acceptanceRecords';

test('archives stale controlled Production Beta acceptance records', async ({ request }, testInfo) => {
  testInfo.setTimeout(180_000);
  await cleanupAcceptanceRecordsByPrefix(request);
});
