import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProvisionedOnboardingEvidence = {
  applicationId: string;
  applicationReference: string;
  invitationId: string;
  organisationId: string;
  operatingLocationId: string;
  [key: string]: string;
};

export async function persistProvisionedOnboardingEvidence(
  evidencePath: string,
  evidence: ProvisionedOnboardingEvidence,
) {
  for (const field of ['applicationId', 'invitationId', 'organisationId', 'operatingLocationId']) {
    if (!UUID.test(String(evidence[field] || ''))) throw new Error(`ONBOARDING_PROVISIONING_EVIDENCE_INVALID_${field.toUpperCase()}`);
  }
  if (!/^SC-APP-[A-Z0-9]+$/.test(evidence.applicationReference)) {
    throw new Error('ONBOARDING_PROVISIONING_EVIDENCE_INVALID_APPLICATION_REFERENCE');
  }
  const directory = path.dirname(evidencePath);
  const temporaryPath = `${evidencePath}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(evidence), { mode: 0o600 });
  await rename(temporaryPath, evidencePath);
}
