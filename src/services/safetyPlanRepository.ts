import type {
  SafetyPlan,
  SafetyPlanActor,
  SafetyPlanAuditEvent,
  SafetyPlanVersion,
} from '../types/safetyPlan';
import {
  deleteSharedRecord,
  PERSISTENCE_KEYS,
  readSharedCollection,
  readSharedRecord,
  restoreSharedRecord,
  writeSharedRecord,
  type SharedRecordMutationOptions,
  type SharedRequestOptions,
  type SharedRecordWriteOptions,
} from './persistence';

export interface SaveSafetyPlanDraftInput {
  plan: SafetyPlan;
  /**
   * Zero creates a new record. Existing records must provide the revision that
   * was loaded into the editor.
   */
  expectedRevision: number;
  actor: SafetyPlanActor;
  /** Used by conflict recovery when a draft is forked from the remote record. */
  isNewVersion?: boolean;
  signal?: AbortSignal;
}

export class SafetyPlanConflictError extends Error {
  readonly status = 409;
  readonly code = 'SAFETY_PLAN_CONFLICT';
  readonly currentRevision?: number;

  constructor(message: string, currentRevision?: number) {
    super(message);
    this.name = 'SafetyPlanConflictError';
    this.currentRevision = currentRevision;
  }
}

export interface SafetyPlanRepository {
  listPlans(options?: SharedRequestOptions): Promise<SafetyPlan[]>;
  getPlan(planId: string, options?: SharedRequestOptions): Promise<SafetyPlan | null>;
  saveDraft(input: SaveSafetyPlanDraftInput): Promise<SafetyPlan>;
  submitPlan(
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor,
    options?: SharedRequestOptions
  ): Promise<SafetyPlan>;
  markNotRequired(
    jobId: string,
    reason: string,
    actor: SafetyPlanActor,
    options?: SharedRequestOptions
  ): Promise<SafetyPlan>;
  appendAuditEvent(event: SafetyPlanAuditEvent, options?: SharedRequestOptions): Promise<void>;
  deleteDraft(
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor,
    options?: SharedRequestOptions
  ): Promise<SafetyPlan>;
  restoreDraft(
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor,
    options?: SharedRequestOptions
  ): Promise<SafetyPlan>;
}

type AuditRequest = Pick<
  SafetyPlanAuditEvent,
  'id' | 'planId' | 'versionId' | 'action'
>;

export interface SafetyPlanRepositoryDependencies {
  listRecords(options?: SharedRequestOptions): Promise<SafetyPlan[]>;
  readRecord(planId: string, options?: SharedRequestOptions): Promise<SafetyPlan | null>;
  writeRecord(
    key: string,
    recordId: string,
    payload: unknown,
    options?: SharedRecordWriteOptions
  ): Promise<unknown>;
  deleteRecord(
    key: string,
    recordId: string,
    options: SharedRecordMutationOptions
  ): Promise<SafetyPlan | null>;
  restoreRecord(
    key: string,
    recordId: string,
    options: SharedRecordMutationOptions
  ): Promise<SafetyPlan | null>;
  now(): string;
  createId(): string;
  getTenantId(): string;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `safety_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function getSessionTenantId(): string {
  try {
    const session = JSON.parse(localStorage.getItem(PERSISTENCE_KEYS.session) || 'null');
    return session?.tenantId || session?.contractorId || session?.id || '';
  } catch {
    return '';
  }
}

function toAuditRequest(event: SafetyPlanAuditEvent): AuditRequest {
  return {
    id: event.id,
    planId: event.planId,
    ...(event.versionId ? { versionId: event.versionId } : {}),
    action: event.action,
  };
}

function defaultDependencies(): SafetyPlanRepositoryDependencies {
  return {
    listRecords: (options) =>
      readSharedCollection<SafetyPlan>(PERSISTENCE_KEYS.safetyPlans, [], options),
    readRecord: (planId, options) =>
      readSharedRecord<SafetyPlan>(PERSISTENCE_KEYS.safetyPlans, planId, options),
    writeRecord: (key, recordId, payload, options) =>
      writeSharedRecord(key, recordId, payload, options),
    deleteRecord: (key, recordId, options) =>
      deleteSharedRecord<SafetyPlan>(key, recordId, options),
    restoreRecord: (key, recordId, options) =>
      restoreSharedRecord<SafetyPlan>(key, recordId, options),
    now: () => new Date().toISOString(),
    createId,
    getTenantId: getSessionTenantId,
  };
}

function currentVersion(plan: SafetyPlan): SafetyPlanVersion {
  const version = plan.versions.find((candidate) => candidate.id === plan.currentVersionId);
  if (!version) throw new Error('Safety Plan current version was not found.');
  return version;
}

function conflictFrom(error: unknown, expectedRevision: number): never {
  const typed = error as {
    message?: string;
    status?: number;
    code?: string;
    currentRevision?: number;
  };
  if (typed?.status === 409 || typed?.code === 'SAFETY_PLAN_CONFLICT') {
    throw new SafetyPlanConflictError(
      typed.message || 'Safety Plan changed in another session.',
      typed.currentRevision
    );
  }
  if (error instanceof Error) throw error;
  throw new Error(`Safety Plan revision ${expectedRevision} could not be saved.`);
}

function prepareDraft(input: SaveSafetyPlanDraftInput, now: string): SafetyPlan {
  const { plan, expectedRevision } = input;
  if (plan.status !== 'draft') throw new Error('Only draft Safety Plans can be autosaved.');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error('Expected Safety Plan revision is invalid.');
  }

  const isNew = expectedRevision === 0;
  if (!isNew && plan.revision !== expectedRevision) {
    throw new SafetyPlanConflictError(
      'The draft no longer matches its expected revision.',
      plan.revision
    );
  }

  const activeVersion = currentVersion(plan);
  const versions = plan.versions.map((version) =>
    version.id === activeVersion.id
      ? {
        ...version,
        revision: isNew || input.isNewVersion ? 1 : version.revision + 1,
        updatedAt: now,
      }
      : version
  );

  return {
    ...plan,
    revision: isNew ? 1 : expectedRevision + 1,
    versions,
    updatedAt: now,
  };
}

function makeAuditEvent(
  plan: SafetyPlan,
  actor: SafetyPlanActor,
  action: SafetyPlanAuditEvent['action'],
  now: string,
  id: string
): SafetyPlanAuditEvent {
  return {
    id,
    tenantId: plan.tenantId,
    planId: plan.id,
    ...(plan.currentVersionId ? { versionId: plan.currentVersionId } : {}),
    actor,
    action,
    occurredAt: now,
  };
}

export function createSafetyPlanRepository(
  dependencies: Partial<SafetyPlanRepositoryDependencies> = {}
): SafetyPlanRepository {
  const deps = { ...defaultDependencies(), ...dependencies };

  async function writePlan(
    plan: SafetyPlan,
    expectedRevision: number,
    actor: SafetyPlanActor,
    action: SafetyPlanAuditEvent['action'],
    signal?: AbortSignal
  ): Promise<SafetyPlan> {
    const tenantId = deps.getTenantId();
    if (!tenantId || plan.tenantId !== tenantId) {
      throw new Error('Safety Plan tenant must match the authenticated tenant.');
    }
    const auditEvent = makeAuditEvent(plan, actor, action, deps.now(), deps.createId());
    let canonical: unknown;
    try {
      canonical = await deps.writeRecord(
        PERSISTENCE_KEYS.safetyPlans,
        plan.id,
        plan,
        { audit: toAuditRequest(auditEvent), signal }
      );
    } catch (error) {
      conflictFrom(error, expectedRevision);
    }
    const returnedPlan = canonical as SafetyPlan | undefined;
    // A post-insert read remains a compatibility fallback for servers that do
    // not yet return canonical provenance. It runs only after the write.
    const persistedPlan = returnedPlan?.id === plan.id
      ? returnedPlan
      : expectedRevision === 0
        ? await (signal
          ? deps.readRecord(plan.id, { signal })
          : deps.readRecord(plan.id)) ?? plan
        : plan;
    return persistedPlan;
  }

  const repository: SafetyPlanRepository = {
    async listPlans(options) {
      const plans = await (options ? deps.listRecords(options) : deps.listRecords());
      const tenantId = deps.getTenantId();
      return plans.filter((plan) => !plan.deletedAt && plan.tenantId === tenantId);
    },

    async getPlan(planId, options) {
      const plan = await (options
        ? deps.readRecord(planId, options)
        : deps.readRecord(planId));
      return plan?.deletedAt || plan?.tenantId !== deps.getTenantId() ? null : plan;
    },

    async saveDraft(input) {
      const saved = prepareDraft(input, deps.now());
      return writePlan(
        saved,
        input.expectedRevision,
        input.actor,
        input.expectedRevision === 0
          ? 'created'
          : input.isNewVersion
            ? 'revised'
            : 'field_changed',
        input.signal
      );
    },

    async submitPlan(planId, expectedRevision, actor, options) {
      const stored = await deps.readRecord(planId, options);
      if (!stored) throw new Error('Safety Plan was not found.');
      if (stored.revision !== expectedRevision) {
        throw new SafetyPlanConflictError(
          'Safety Plan changed in another session.',
          stored.revision
        );
      }
      if (stored.status !== 'draft') throw new Error('Only a draft Safety Plan can be submitted.');
      const activeVersion = currentVersion(stored);
      const now = deps.now();
      const submitted: SafetyPlan = {
        ...stored,
        revision: expectedRevision + 1,
        status: 'submitted',
        updatedAt: now,
        versions: stored.versions.map((version) =>
          version.id === activeVersion.id
            ? {
              ...version,
              status: 'submitted',
              revision: version.revision + 1,
              updatedAt: now,
            }
            : version
        ),
      };
      return writePlan(submitted, expectedRevision, actor, 'submitted', options?.signal);
    },

    async markNotRequired(jobId, reason, actor, options) {
      const trimmedReason = reason.trim();
      if (!trimmedReason) throw new Error('A reason is required.');
      const tenantId = deps.getTenantId();
      if (!tenantId) throw new Error('An authenticated tenant is required.');
      const now = deps.now();
      const plan: SafetyPlan = {
        id: deps.createId(),
        jobId,
        tenantId,
        revision: 1,
        status: 'not_required',
        versions: [],
        notRequiredReason: trimmedReason,
        createdAt: now,
        updatedAt: now,
      };
      return writePlan(plan, 0, actor, 'not_required_selected', options?.signal);
    },

    async appendAuditEvent(event, options) {
      const args = [
        PERSISTENCE_KEYS.safetyPlanAudit,
        event.id,
        toAuditRequest(event),
      ] as const;
      if (options) await deps.writeRecord(...args, options);
      else await deps.writeRecord(...args);
    },

    async deleteDraft(planId, expectedRevision, actor, options) {
      try {
        const deleted = await deps.deleteRecord(
          PERSISTENCE_KEYS.safetyPlans,
          planId,
          { expectedRevision, actor, signal: options?.signal }
        );
        if (!deleted) throw new Error('Safety Plan was not found.');
        return deleted;
      } catch (error) {
        conflictFrom(error, expectedRevision);
      }
    },

    async restoreDraft(planId, expectedRevision, actor, options) {
      try {
        const restored = await deps.restoreRecord(
          PERSISTENCE_KEYS.safetyPlans,
          planId,
          { expectedRevision, actor, signal: options?.signal }
        );
        if (!restored) throw new Error('Safety Plan was not found.');
        return restored;
      } catch (error) {
        conflictFrom(error, expectedRevision);
      }
    },
  };

  return repository;
}

export const safetyPlanRepository = createSafetyPlanRepository();
