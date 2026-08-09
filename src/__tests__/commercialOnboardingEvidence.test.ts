import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  persistProvisioningResponseBeforeAssertions,
} from '../../e2e/acceptance/fixtures/commercialOnboardingEvidence';

const trustedEvidence = {
  applicationId: '11111111-1111-4111-8111-111111111111',
  applicationReference: 'SC-APP-ABC123',
  expectedInvitationId: '22222222-2222-4222-8222-222222222222',
};

test('retains sanitised cleanup evidence when the real provisioning-shape assertion fails', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sc-onboarding-evidence-'));
  const evidencePath = path.join(directory, 'evidence.json');

  await expect(persistProvisioningResponseBeforeAssertions({
    evidencePath,
    ...trustedEvidence,
    responseStatus: 200,
    responseBody: {
      provisioning: {
        invitationId: trustedEvidence.expectedInvitationId,
        organisationId: '33333333-3333-4333-8333-333333333333',
        operatingLocationId: '44444444-4444-4444-8444-444444444444',
        unexpected: 'must-not-persist',
      },
    },
  })).rejects.toThrow('ONBOARDING_PROVISIONING_RESPONSE_SHAPE_INVALID');

  const persisted = await readFile(evidencePath, 'utf8');
  expect(JSON.parse(persisted)).toEqual({
    applicationId: trustedEvidence.applicationId,
    applicationReference: trustedEvidence.applicationReference,
    invitationId: trustedEvidence.expectedInvitationId,
    organisationId: '33333333-3333-4333-8333-333333333333',
    operatingLocationId: '44444444-4444-4444-8444-444444444444',
  });
  expect(persisted).not.toContain('must-not-persist');
});

test.each([
  ['missing organisation ID', {
    invitationId: trustedEvidence.expectedInvitationId,
    operatingLocationId: '44444444-4444-4444-8444-444444444444',
  }],
  ['mismatched invitation ID', {
    invitationId: '55555555-5555-4555-8555-555555555555',
    organisationId: '33333333-3333-4333-8333-333333333333',
    operatingLocationId: '44444444-4444-4444-8444-444444444444',
  }],
])('rejects %s without creating unsafe cleanup evidence', async (_label, provisioning) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sc-onboarding-evidence-'));
  const evidencePath = path.join(directory, 'evidence.json');

  await expect(persistProvisioningResponseBeforeAssertions({
    evidencePath,
    ...trustedEvidence,
    responseStatus: 200,
    responseBody: { provisioning },
  })).rejects.toThrow(/ONBOARDING_PROVISIONING_EVIDENCE_INVALID_/);

  await expect(access(evidencePath)).rejects.toMatchObject({ code: 'ENOENT' });
});
