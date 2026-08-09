import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { persistProvisionedOnboardingEvidence } from '../../e2e/acceptance/fixtures/commercialOnboardingEvidence';

test('retains exact cleanup evidence when a later onboarding assertion fails', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sc-onboarding-evidence-'));
  const evidencePath = path.join(directory, 'evidence.json');
  const evidence = {
    applicationId: '11111111-1111-4111-8111-111111111111',
    applicationReference: 'SC-APP-ABC123',
    invitationId: '22222222-2222-4222-8222-222222222222',
    organisationId: '33333333-3333-4333-8333-333333333333',
    operatingLocationId: '44444444-4444-4444-8444-444444444444',
  };

  await expect((async () => {
    await persistProvisionedOnboardingEvidence(evidencePath, evidence);
    throw new Error('simulated redirect assertion failure');
  })()).rejects.toThrow('simulated redirect assertion failure');

  expect(JSON.parse(await readFile(evidencePath, 'utf8'))).toEqual(evidence);
});
