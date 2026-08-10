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

type ProvisioningResponseInput = {
  evidencePath: string;
  applicationId: string;
  applicationReference: string;
  expectedInvitationId: string;
  responseStatus: number;
  responseBody: unknown;
};

type ProvisioningIdentifiers = Pick<ProvisionedOnboardingEvidence,
  'invitationId' | 'organisationId' | 'operatingLocationId'>;

const PROVISIONING_RESPONSE_FIELDS = ['invitationId', 'operatingLocationId', 'organisationId'].sort();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function ownString(record: Record<string, unknown> | null, field: string) {
  if (!record || !Object.prototype.hasOwnProperty.call(record, field)) return '';
  return typeof record[field] === 'string' ? record[field] as string : '';
}

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

export async function persistProvisioningResponseBeforeAssertions({
  evidencePath,
  applicationId,
  applicationReference,
  expectedInvitationId,
  responseStatus,
  responseBody,
}: ProvisioningResponseInput): Promise<ProvisioningIdentifiers> {
  const body = asRecord(responseBody);
  const provisioning = asRecord(body?.provisioning);
  const invitationId = ownString(provisioning, 'invitationId');
  const organisationId = ownString(provisioning, 'organisationId');
  const operatingLocationId = ownString(provisioning, 'operatingLocationId');

  for (const [field, value] of Object.entries({ invitationId, organisationId, operatingLocationId })) {
    if (!UUID.test(value)) throw new Error(`ONBOARDING_PROVISIONING_EVIDENCE_INVALID_${field.toUpperCase()}`);
  }
  if (invitationId !== expectedInvitationId) {
    throw new Error('ONBOARDING_PROVISIONING_EVIDENCE_INVALID_INVITATION_ID_MISMATCH');
  }

  await persistProvisionedOnboardingEvidence(evidencePath, {
    applicationId,
    applicationReference,
    invitationId,
    organisationId,
    operatingLocationId,
  });

  if (responseStatus !== 200) {
    throw new Error(`ONBOARDING_PROVISIONING_RESPONSE_STATUS_${responseStatus}`);
  }
  if (!provisioning
    || Object.keys(provisioning).sort().join(',') !== PROVISIONING_RESPONSE_FIELDS.join(',')) {
    throw new Error('ONBOARDING_PROVISIONING_RESPONSE_SHAPE_INVALID');
  }

  return { invitationId, organisationId, operatingLocationId };
}
