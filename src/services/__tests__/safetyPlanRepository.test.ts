import { describe, expect, it, vi } from 'vitest';

import { makeSafetyPlan, makeSafetyPlanVersion } from '../../test/safetyPlanFixtures';
import type { SafetyPlan, SafetyPlanActor, SafetyPlanAuditEvent } from '../../types/safetyPlan';
import { PERSISTENCE_KEYS } from '../persistence';
import {
  createSafetyPlanRepository,
  type SafetyPlanRepositoryDependencies,
} from '../safetyPlanRepository';

const actor: SafetyPlanActor = {
  userId: 'user-1',
  name: 'Operator One',
  role: 'contractor',
  operationalAuthority: false,
};

function makeDependencies(
  overrides: Partial<SafetyPlanRepositoryDependencies> = {}
): SafetyPlanRepositoryDependencies {
  return {
    listRecords: vi.fn(async () => []),
    readRecord: vi.fn(async () => null),
    writeRecord: vi.fn(async () => undefined),
    deleteRecord: vi.fn(async () => null),
    restoreRecord: vi.fn(async () => null),
    now: () => '2026-07-24T03:00:00.000Z',
    createId: () => 'generated-id',
    getTenantId: () => 'tenant-1',
    ...overrides,
  };
}

describe('SafetyPlanRepository', () => {
  it('lists and reads active plans without exposing soft-deleted drafts', async () => {
    const active = makeSafetyPlan({ id: 'active-plan' });
    const deleted = makeSafetyPlan({ id: 'deleted-plan', deletedAt: '2026-07-24T03:00:00.000Z' });
    const dependencies = makeDependencies({
      listRecords: vi.fn(async () => [active, deleted]),
      readRecord: vi.fn(async () => deleted),
    });
    const repository = createSafetyPlanRepository(dependencies);

    await expect(repository.listPlans()).resolves.toEqual([active]);
    await expect(repository.getPlan(deleted.id)).resolves.toBeNull();
  });

  it('exact-filters list and singleton reads to the authenticated tenant', async () => {
    const own = makeSafetyPlan({ id: 'own-plan', tenantId: 'tenant-1' });
    const other = makeSafetyPlan({ id: 'other-plan', tenantId: 'tenant-10' });
    const dependencies = makeDependencies({
      listRecords: vi.fn(async () => [own, other]),
      readRecord: vi.fn(async () => other),
      getTenantId: () => 'tenant-1',
    });
    const repository = createSafetyPlanRepository(dependencies);

    await expect(repository.listPlans()).resolves.toEqual([own]);
    await expect(repository.getPlan(other.id)).resolves.toBeNull();
    await expect(repository.saveDraft({
      plan: other,
      expectedRevision: 1,
      actor,
    })).rejects.toThrow('authenticated tenant');
    expect(dependencies.writeRecord).not.toHaveBeenCalled();
  });

  it('creates a new draft at revision one and requests a created audit', async () => {
    const canonical = makeSafetyPlan({
      revision: 1,
      createdAt: '2026-07-24T03:00:00.000Z',
      updatedAt: '2026-07-24T03:00:00.000Z',
    });
    const dependencies = makeDependencies({
      readRecord: vi.fn(async () => canonical),
    });
    const repository = createSafetyPlanRepository(dependencies);

    const saved = await repository.saveDraft({
      plan: makeSafetyPlan({ revision: 1 }),
      expectedRevision: 0,
      actor,
    });

    expect(saved).toEqual(canonical);
    expect(saved.versions[0].revision).toBe(1);
    expect(dependencies.readRecord).toHaveBeenCalledWith(saved.id);
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      saved.id,
      expect.any(Object),
      {
        audit: expect.objectContaining({
          action: 'created',
          planId: saved.id,
        }),
      }
    );
  });

  it('saves an existing draft as one record with incremented plan and version revisions', async () => {
    const draft = makeSafetyPlan({
      revision: 3,
      versions: [makeSafetyPlanVersion({ revision: 2 })],
    });
    const dependencies = makeDependencies();
    const repository = createSafetyPlanRepository(dependencies);

    const saved = await repository.saveDraft({ plan: draft, expectedRevision: 3, actor });

    expect(saved).toMatchObject({
      revision: 4,
      versions: [expect.objectContaining({ revision: 3 })],
    });
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      draft.id,
      expect.objectContaining({ id: draft.id, revision: 4 }),
      { audit: expect.objectContaining({ action: 'field_changed' }) }
    );
    expect(dependencies.listRecords).not.toHaveBeenCalled();
  });

  it('rejects a stale autosave instead of overwriting a newer draft', async () => {
    const conflict = Object.assign(new Error('Changed elsewhere'), {
      status: 409,
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    const dependencies = makeDependencies({
      writeRecord: vi.fn(async () => { throw conflict; }),
    });
    const repository = createSafetyPlanRepository(dependencies);

    await expect(repository.saveDraft({
      plan: makeSafetyPlan({ revision: 3 }),
      expectedRevision: 3,
      actor,
    })).rejects.toMatchObject({
      status: 409,
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    expect(dependencies.readRecord).not.toHaveBeenCalled();
  });

  it('sends audit linkage in the same record mutation', async () => {
    const dependencies = makeDependencies();
    const repository = createSafetyPlanRepository(dependencies);
    const draft = makeSafetyPlan();

    await repository.saveDraft({ plan: draft, expectedRevision: 1, actor });

    expect(dependencies.writeRecord).toHaveBeenCalledTimes(1);
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      draft.id,
      expect.any(Object),
      {
        audit: {
          id: 'generated-id',
          action: 'field_changed',
          planId: draft.id,
          versionId: draft.currentVersionId,
        },
      }
    );
  });

  it('atomically records a source refresh and consumes its one-shot intent', async () => {
    const draft = makeSafetyPlan({
      versions: [makeSafetyPlanVersion({
        sourceRefreshIntent: {
          kind: 'source_refresh',
          before: { capturedAt: '2026-07-23T00:00:00.000Z' },
          after: { capturedAt: '2026-07-24T00:00:00.000Z' },
        },
      })],
    });
    const dependencies = makeDependencies();
    const repository = createSafetyPlanRepository(dependencies);

    const saved = await repository.saveDraft({ plan: draft, expectedRevision: 1, actor });

    expect(saved.versions[0].sourceRefreshIntent).toBeUndefined();
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.safetyPlans,
      draft.id,
      expect.objectContaining({
        versions: [expect.not.objectContaining({ sourceRefreshIntent: expect.anything() })],
      }),
      {
        audit: expect.objectContaining({
          action: 'source_refreshed',
          planId: draft.id,
        }),
      }
    );
  });

  it('does not append an audit event when the plan write fails', async () => {
    const dependencies = makeDependencies({
      writeRecord: vi.fn(async () => { throw new Error('offline'); }),
    });
    const repository = createSafetyPlanRepository(dependencies);

    await expect(repository.saveDraft({
      plan: makeSafetyPlan(),
      expectedRevision: 1,
      actor,
    })).rejects.toThrow('offline');

    expect(dependencies.writeRecord).toHaveBeenCalledTimes(1);
  });

  it('submits the current draft and requests submitted audit linkage', async () => {
    const draft = makeSafetyPlan({
      revision: 2,
      versions: [makeSafetyPlanVersion({ revision: 3 })],
    });
    const dependencies = makeDependencies({
      readRecord: vi.fn(async () => draft),
    });
    const repository = createSafetyPlanRepository(dependencies);

    const submitted = await repository.submitPlan(draft.id, 2, actor);

    expect(submitted).toMatchObject({
      revision: 3,
      status: 'submitted',
      versions: [expect.objectContaining({ status: 'submitted', revision: 4 })],
    });
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      draft.id,
      expect.any(Object),
      {
        audit: expect.objectContaining({
          action: 'submitted',
          planId: draft.id,
          versionId: draft.currentVersionId,
        }),
      }
    );
  });

  it('creates a not-required record without caller-controlled audit provenance', async () => {
    const dependencies = makeDependencies();
    const repository = createSafetyPlanRepository(dependencies);

    const plan = await repository.markNotRequired('job-9', 'Desktop-only work', actor);

    expect(plan).toMatchObject({
      id: 'generated-id',
      jobId: 'job-9',
      tenantId: 'tenant-1',
      revision: 1,
      status: 'not_required',
      versions: [],
      notRequiredReason: 'Desktop-only work',
    });
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      plan.id,
      expect.any(Object),
      {
        audit: expect.objectContaining({
          action: 'not_required_selected',
          planId: plan.id,
        }),
      }
    );
  });

  it('forwards expected revisions to audited draft delete and restore operations', async () => {
    const deleted = makeSafetyPlan({ revision: 4, deletedAt: '2026-07-24T03:00:00.000Z' });
    const restored = makeSafetyPlan({ revision: 5 });
    const dependencies = makeDependencies({
      deleteRecord: vi.fn(async () => deleted),
      restoreRecord: vi.fn(async () => restored),
    });
    const repository = createSafetyPlanRepository(dependencies);
    const admin = { ...actor, role: 'admin' as const };

    await expect(repository.deleteDraft('safety-plan-1', 3, admin)).resolves.toEqual(deleted);
    await expect(repository.restoreDraft('safety-plan-1', 4, admin)).resolves.toEqual(restored);
    expect(dependencies.deleteRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      'safety-plan-1',
      { expectedRevision: 3, actor: admin }
    );
    expect(dependencies.restoreRecord).toHaveBeenCalledWith(
      'ftf_safety_plans',
      'safety-plan-1',
      { expectedRevision: 4, actor: admin }
    );
  });

  it('sends only audit action and linkage metadata to persistence', async () => {
    const writeRecord = vi.fn(async () => undefined);
    const repository = createSafetyPlanRepository(makeDependencies({ writeRecord }));
    const event: SafetyPlanAuditEvent = {
      id: 'audit-1',
      tenantId: 'untrusted-tenant',
      planId: 'safety-plan-1',
      versionId: 'version-1',
      actor,
      action: 'submitted',
      occurredAt: '1900-01-01T00:00:00.000Z',
      before: { status: 'draft' },
      after: { status: 'submitted' },
    };

    await repository.appendAuditEvent(event);

    expect(writeRecord).toHaveBeenCalledWith(
      'ftf_safety_plan_audit',
      'audit-1',
      {
        id: 'audit-1',
        planId: 'safety-plan-1',
        versionId: 'version-1',
        action: 'submitted',
      }
    );
  });

  it('forwards caller AbortSignals through reads, writes, delete and restore', async () => {
    const plan = makeSafetyPlan({ tenantId: 'tenant-1' });
    const dependencies = makeDependencies({
      listRecords: vi.fn(async () => [plan]),
      readRecord: vi.fn(async () => plan),
      writeRecord: vi.fn(async () => plan),
      deleteRecord: vi.fn(async () => ({ ...plan, deletedAt: 'now' })),
      restoreRecord: vi.fn(async () => plan),
    });
    const repository = createSafetyPlanRepository(dependencies);
    const controller = new AbortController();
    const options = { signal: controller.signal };
    const admin = { ...actor, role: 'admin' as const };

    await repository.listPlans(options);
    await repository.getPlan(plan.id, options);
    await repository.saveDraft({
      plan,
      expectedRevision: 1,
      actor,
      signal: controller.signal,
    });
    await repository.deleteDraft(plan.id, 1, admin, options);
    await repository.restoreDraft(plan.id, 2, admin, options);

    expect(dependencies.listRecords).toHaveBeenCalledWith(options);
    expect(dependencies.readRecord).toHaveBeenCalledWith(plan.id, options);
    expect(dependencies.writeRecord).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.safetyPlans,
      plan.id,
      expect.any(Object),
      expect.objectContaining({ signal: controller.signal })
    );
    expect(dependencies.deleteRecord).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.safetyPlans,
      plan.id,
      expect.objectContaining({ signal: controller.signal })
    );
    expect(dependencies.restoreRecord).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.safetyPlans,
      plan.id,
      expect.objectContaining({ signal: controller.signal })
    );
  });
});
