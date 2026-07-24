import {
  authenticateSafetyPlanRole,
  authenticatedTest as test,
  completedSafetyPlan,
  expect,
  installSafetyPlan,
} from './fixtures/auth';

const editorUrl = '/compliance/safety-plans/e2e-safety-plan';
const jobUrl = '/jobs/client/e2e-client/property/e2e-property/field/e2e-field/job/e2e-job';

test.beforeEach(async ({ request }) => {
  const response = await request.delete('/api/store?fixtureReset=1', {
    headers: { 'x-ftf-e2e-auth': 'admin' },
  });
  expect(response.status()).toBe(204);
});

test('completes submit, authority approval, PIC acknowledgement and controlled revision', async ({ page }) => {
  await page.goto('/');
  await installSafetyPlan(page, completedSafetyPlan());
  await page.goto(editorUrl);

  await page.getByRole('button', { name: 'Hazards & controls' }).click();
  await expect(page.getByText('Powerlines', { exact: true })).toBeVisible();
  await expect(page.getByText('Public access', { exact: true })).toBeVisible();
  await expect(page.getByText('Weather may change', { exact: true })).toBeVisible();
  await expect(page.getByText('Saved', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await expect(page.getByText('Ready for submission')).toBeVisible();
  await expect(page.getByText(/attention only and does not block mission authorisation/i)).toBeVisible();
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Safety Plan status: submitted')).toBeVisible();

  await authenticateSafetyPlanRole(page, 'authority');
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Safety Plan status: approved')).toBeVisible();
  await expect(page.getByText('Version 1.0', { exact: true })).toBeVisible();

  await authenticateSafetyPlanRole(page, 'pic');
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('button', { name: 'Read and acknowledge' }).click();
  await expect(page.getByText(/Synthetic PIC · PIC · Version 1.0/)).toBeVisible();
  await expect(page.getByText(/^Acknowledged/)).toBeVisible();

  await authenticateSafetyPlanRole(page, 'authority');
  await page.getByRole('button', { name: 'Review & submit' }).click();
  await page.getByRole('button', { name: 'Revise' }).click();
  await expect(page.getByText('Controlled field plan · Version 1.1')).toBeVisible();
  await expect(page.getByText('Version 1.0', { exact: true })).toBeVisible();
  await expect(page.getByText('approved')).toBeVisible();
});

test('keeps optional plans non-blocking and prevents a contractor from approving', async ({ page }) => {
  await page.goto('/');
  await installSafetyPlan(page, completedSafetyPlan('submitted'));
  await page.goto(editorUrl);
  await page.getByRole('button', { name: 'Review & submit' }).click();

  await expect(page.getByText('Approval requires a nominated operational authority.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByText(/attention only and does not block mission authorisation/i)).toBeVisible();

  await page.goto(jobUrl);
  await expect(page.getByText('Safety Plan optional')).toBeVisible();
  const missions = await page.evaluate(() => JSON.parse(localStorage.getItem('ftf_missions') || '[]'));
  expect(missions[0].status).toBe('Approved');
});

test('records Not required without changing the authorised mission', async ({ page }) => {
  await page.goto(jobUrl);
  await page.getByRole('button', { name: 'Not required' }).click();
  await page.getByLabel('Reason (optional)').fill('Covered by the job JSA');
  await page.getByRole('button', { name: 'Confirm' }).click();

  await expect(page.getByText('Not required: Covered by the job JSA')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create Safety Plan' })).toBeVisible();
  const missions = await page.evaluate(() => JSON.parse(localStorage.getItem('ftf_missions') || '[]'));
  expect(missions[0].status).toBe('Approved');
});

test('enforces tenant and client privacy in the loopback-only write repository', async ({ request }) => {
  const payload = completedSafetyPlan();
  const write = await request.put('/api/store', {
    headers: { 'x-ftf-e2e-auth': 'admin' },
    data: {
      collection: 'ftf_safety_plans',
      recordId: payload.id,
      payload,
    },
  });
  expect(write.status()).toBe(200);

  const unrelated = await request.get(
    `/api/store?collection=ftf_safety_plans&recordId=${payload.id}`,
    { headers: { 'x-ftf-e2e-auth': 'unrelated' } }
  );
  expect(unrelated.status()).toBe(200);
  expect((await unrelated.json()).payload).toBeNull();

  const client = await request.get(
    `/api/store?collection=ftf_safety_plans&recordId=${payload.id}`,
    { headers: { 'x-ftf-e2e-auth': 'client' } }
  );
  expect(client.status()).toBe(403);
});

test('downloads the immutable approved PDF and keeps the 375px editor contained', async ({ page }) => {
  await page.goto('/');
  await installSafetyPlan(page, completedSafetyPlan('approved'), 'admin');
  await page.goto(jobUrl);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PDF' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^Safety_Plan_.*_1\.0\.pdf$/);
  expect((await download.createReadStream())).not.toBeNull();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(editorUrl);
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    shellWidth: document.querySelector('[data-testid="safety-plan-editor-shell"]')?.scrollWidth,
  }));
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth);
  expect(metrics.shellWidth).toBeLessThanOrEqual(metrics.viewportWidth);
});

test('restricts company-master editing and client browser access', async ({ page }) => {
  await page.goto('/');
  await page.goto('/compliance/safety-plans/template');
  await expect(page.getByRole('heading', { name: 'Access restricted' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish company master' })).toHaveCount(0);

  await installSafetyPlan(page, completedSafetyPlan(), 'client');
  await page.goto(editorUrl);
  await expect(page).not.toHaveURL(new RegExp(`${editorUrl}$`));
  await expect(page.getByTestId('safety-plan-editor-shell')).toHaveCount(0);
});

test('retains a failed autosave edit and retries it successfully', async ({ page }) => {
  await page.goto('/');
  await installSafetyPlan(page, completedSafetyPlan());
  await page.goto(editorUrl);
  await page.evaluate(() => {
    const nativeSetItem = Storage.prototype.setItem;
    (window as typeof window & { __restoreSafetySetItem?: () => void }).__restoreSafetySetItem = () => {
      Storage.prototype.setItem = nativeSetItem;
    };
    Storage.prototype.setItem = function failingSafetyPlanWrite(key, value) {
      if (key.startsWith('ftf_safety_plans:')) throw new DOMException('Synthetic quota failure', 'QuotaExceededError');
      return nativeSetItem.call(this, key, value);
    };
  });

  const scope = page.getByRole('textbox', { name: 'Scope (required)' });
  await scope.fill('Retained field edit after failure');
  await expect(page.getByText('Save pending.')).toBeVisible();
  await expect(scope).toHaveValue('Retained field edit after failure');

  await page.evaluate(() => {
    (window as typeof window & { __restoreSafetySetItem?: () => void }).__restoreSafetySetItem?.();
  });
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(page.getByText('Saved', { exact: false })).toBeVisible();
  await expect(scope).toHaveValue('Retained field edit after failure');
});

test('requires an explicit decision when linked mission safety sources change', async ({ page }) => {
  await page.goto('/');
  const plan = completedSafetyPlan();
  const current = plan.versions[0];
  current.sourceSnapshot.hazards = current.sourceSnapshot.hazards?.slice(0, 1);
  await installSafetyPlan(page, plan);
  await page.goto(editorUrl);
  const latestSourceSnapshot = completedSafetyPlan().versions[0].sourceSnapshot;
  await page.evaluate((latest) => {
    history.replaceState({
      ...history.state,
      usr: { latestSourceSnapshot: latest },
    }, '', location.href);
  }, latestSourceSnapshot);
  await page.reload();

  await expect(page.getByRole('button', { name: 'Review source changes' })).toBeVisible();
  await page.getByRole('button', { name: 'Review source changes' }).click();
  await expect(page.getByRole('heading', { name: 'Review source changes' })).toBeVisible();
  await expect(page.getByText(/Choose what this controlled plan should retain/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply refresh' })).toBeDisabled();
});
