import type {
  SafetyPlan,
  SafetyPlanAcknowledgement,
  SafetyPlanActor,
  SafetyPlanVersion,
} from '../types/safetyPlan';
import { canSubmitPlan, getRetentionUntil, nextPlanVersion } from '../utils/safetyPlanRules';

const ACKNOWLEDGEMENT_STATEMENT =
  'I have read and understood this Safety Plan and my assigned responsibilities.';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function id(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function activeVersion(plan: SafetyPlan): SafetyPlanVersion {
  const version = plan.versions.find((candidate) => candidate.id === plan.currentVersionId);
  if (!version) throw new Error('Safety Plan current version was not found.');
  return version;
}

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalise(item)])
  );
}

/**
 * Canonical approved content shared with the server verifier. Workflow state,
 * audit timestamps and later crew acknowledgements are deliberately excluded.
 */
export function canonicalSafetyPlanVersion(version: SafetyPlanVersion): string {
  return JSON.stringify(canonicalise({
    id: version.id,
    planId: version.planId,
    version: version.version,
    templateSnapshot: version.templateSnapshot,
    sections: version.sections,
    sourceSnapshot: version.sourceSnapshot,
    attachments: version.attachments,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
  }));
}

async function sha256(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot create a secure Safety Plan digest.');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
  }
  return value;
}

export function submitSafetyPlan(
  plan: SafetyPlan,
  _actor: SafetyPlanActor,
  now: string
): SafetyPlan {
  if (plan.status !== 'draft') throw new Error('Only a draft Safety Plan can be submitted.');
  const readiness = canSubmitPlan(plan);
  if (!readiness.ok) {
    throw new Error(`Complete all required Safety Plan sections before submission: ${readiness.missing.join(', ')}.`);
  }
  const current = activeVersion(plan);
  return {
    ...clone(plan),
    status: 'submitted',
    revision: plan.revision + 1,
    updatedAt: now,
    versions: plan.versions.map((version) => version.id === current.id
      ? {
        ...clone(version),
        status: 'submitted',
        revision: version.revision + 1,
        updatedAt: now,
      }
      : clone(version)),
  };
}

export async function approveSafetyPlan(
  plan: SafetyPlan,
  actor: SafetyPlanActor,
  now: string
): Promise<SafetyPlan> {
  if (actor.role !== 'admin' && !actor.operationalAuthority) {
    throw new Error('Only a nominated Safety Plan authority can approve this plan.');
  }
  if (plan.status !== 'submitted') {
    throw new Error('Only a submitted Safety Plan can be approved.');
  }
  const current = activeVersion(plan);
  const approvedVersion: SafetyPlanVersion = {
    ...clone(current),
    status: 'approved',
    revision: current.revision + 1,
    approvedBy: clone(actor),
    approvedAt: now,
    retentionUntil: getRetentionUntil(now),
    contentDigest: await sha256(canonicalSafetyPlanVersion(current)),
    updatedAt: now,
  };
  deepFreeze(approvedVersion);
  const approved: SafetyPlan = {
    ...clone(plan),
    status: 'approved',
    revision: plan.revision + 1,
    updatedAt: now,
    versions: plan.versions.map((version) => version.id === current.id
      ? approvedVersion
      : version.status === 'approved'
        ? deepFreeze({
          ...clone(version),
          status: 'superseded' as const,
          revision: version.revision + 1,
          updatedAt: now,
        })
        : clone(version)),
  };
  return deepFreeze(approved);
}

export function acknowledgeSafetyPlan(
  plan: SafetyPlan,
  actor: SafetyPlanActor,
  now: string
): SafetyPlan {
  if (!['submitted', 'approved'].includes(plan.status)) {
    throw new Error('Only a submitted or approved Safety Plan can be acknowledged.');
  }
  const current = activeVersion(plan);
  const assigned = current.sourceSnapshot.crew?.find((person) => person.id === actor.userId);
  if (!assigned) throw new Error('Only assigned PICs and crew can acknowledge this Safety Plan.');
  const duplicate = current.acknowledgements.some(
    (item) => item.actor.userId === actor.userId
      && !item.withdrawnAt
      && !item.replacementAcknowledgementId
  );
  if (duplicate) throw new Error('This crew member has already acknowledged this version.');
  const acknowledgement: SafetyPlanAcknowledgement = {
    id: id('ack'),
    versionId: current.id,
    actor: clone(actor),
    assignedRole: assigned.role,
    statement: ACKNOWLEDGEMENT_STATEMENT,
    acknowledgedAt: now,
  };
  return {
    ...clone(plan),
    revision: plan.revision + 1,
    updatedAt: now,
    versions: plan.versions.map((version) => version.id === current.id
      ? {
        ...clone(version),
        acknowledgements: [...version.acknowledgements.map(clone), acknowledgement],
        revision: version.revision + 1,
        updatedAt: now,
      }
      : clone(version)),
  };
}

export function reviseSafetyPlan(
  plan: SafetyPlan,
  actor: SafetyPlanActor,
  now: string
): SafetyPlan {
  if (actor.role !== 'admin' && !actor.operationalAuthority) {
    throw new Error('Only a Safety Plan authority can create a controlled revision.');
  }
  if (plan.status !== 'approved') {
    throw new Error('Only an approved Safety Plan can be revised.');
  }
  const current = activeVersion(plan);
  const draft: SafetyPlanVersion = {
    ...clone(current),
    id: id('safety_plan_version'),
    version: nextPlanVersion(current.version),
    status: 'draft',
    revision: 1,
    attachments: current.attachments.map(clone),
    acknowledgements: [],
    createdAt: now,
    createdBy: clone(actor),
    updatedAt: now,
  };
  delete draft.approvedBy;
  delete draft.approvedAt;
  delete draft.contentDigest;
  delete draft.retentionUntil;
  return {
    ...clone(plan),
    status: 'draft',
    currentVersionId: draft.id,
    revision: plan.revision + 1,
    updatedAt: now,
    versions: [...plan.versions.map(clone), draft],
  };
}
