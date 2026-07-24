import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeSafetyPlan } from '../../test/safetyPlanFixtures';
import type { SafetyPlanActor } from '../../types/safetyPlan';
import type { SafetyPlanRepository } from '../../services/safetyPlanRepository';
import {
  SafetyPlanProvider,
  useSafetyPlans,
} from '../SafetyPlanContext';

let currentUser: {
  id: string;
  name: string;
  role: 'admin' | 'contractor';
  tenantId: string;
  safetyPlanAuthority: boolean;
} | null;

vi.mock('../AuthContext', () => ({
  useAuth: () => ({ user: currentUser }),
}));

function makeRepository(overrides: Partial<SafetyPlanRepository> = {}): SafetyPlanRepository {
  return {
    listPlans: vi.fn(async () => []),
    getPlan: vi.fn(async () => null),
    saveDraft: vi.fn(async ({ plan }) => ({ ...plan, revision: plan.revision + 1 })),
    submitPlan: vi.fn(),
    markNotRequired: vi.fn(),
    appendAuditEvent: vi.fn(),
    deleteDraft: vi.fn(),
    restoreDraft: vi.fn(),
    ...overrides,
  } as SafetyPlanRepository;
}

function Probe() {
  const {
    plans,
    saveState,
    error,
    lastSavedAt,
    pendingRetryPlanIds,
    saveDraft,
    retrySave,
    resolveConflict,
    deleteDraft,
    restoreDraft,
  } = useSafetyPlans();
  const actor: SafetyPlanActor = {
    userId: 'user-1',
    name: 'Operator',
    role: 'contractor',
    operationalAuthority: false,
  };

  return (
    <div>
      <span data-testid="children-alive">alive</span>
      <span data-testid="plan-count">{plans.length}</span>
      <span data-testid="plan-job">{plans.find((plan) => plan.id === 'plan-a')?.jobId || ''}</span>
      <span data-testid="save-state">{saveState}</span>
      <span data-testid="error">{error || ''}</span>
      <span data-testid="saved-at">{lastSavedAt || ''}</span>
      <span data-testid="pending-retry-plans">{pendingRetryPlanIds.join(',')}</span>
      <button onClick={() => saveDraft({
        plan: makeSafetyPlan({ id: 'plan-a', revision: 1 }),
        expectedRevision: 1,
        actor,
      })}>edit a</button>
      <button onClick={() => saveDraft({
        plan: makeSafetyPlan({ id: 'plan-a', jobId: 'job-newer', revision: 1 }),
        expectedRevision: 1,
        actor,
      })}>edit a newer</button>
      <button onClick={() => saveDraft({
        plan: makeSafetyPlan({ id: 'plan-b', revision: 1 }),
        expectedRevision: 1,
        actor,
      })}>edit b</button>
      <button onClick={retrySave}>retry</button>
      <button onClick={() => resolveConflict('keep_remote')}>keep remote</button>
      <button onClick={() => resolveConflict('create_revision')}>create revision</button>
      <button onClick={() => deleteDraft('plan-a', 1, actor)}>delete draft</button>
      <button onClick={() => restoreDraft('plan-a', 2, actor)}>restore draft</button>
    </div>
  );
}

function renderProvider(repository: SafetyPlanRepository) {
  return render(
    <SafetyPlanProvider repository={repository}>
      <Probe />
    </SafetyPlanProvider>
  );
}

describe('SafetyPlanContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    currentUser = {
      id: 'user-1',
      name: 'Operator',
      role: 'contractor',
      tenantId: 'tenant-1',
      safetyPlanAuthority: false,
    };
  });

  it('debounces draft saves for 750 ms and exposes a saved timestamp', async () => {
    const repository = makeRepository();
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    expect(screen.getByTestId('save-state')).toHaveTextContent('saving');

    await act(async () => { vi.advanceTimersByTime(749); });
    expect(repository.saveDraft).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(1); });
    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('save-state')).toHaveTextContent('saved');
    expect(screen.getByTestId('saved-at')).not.toHaveTextContent('');
  });

  it('keeps failed input for explicit retry without retrying automatically', async () => {
    const repository = makeRepository({
      saveDraft: vi.fn()
        .mockRejectedValueOnce(new Error('Network unavailable'))
        .mockResolvedValueOnce(makeSafetyPlan({ id: 'plan-a', revision: 2 })),
    });
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    await act(async () => { vi.advanceTimersByTime(750); });

    expect(screen.getByTestId('save-state')).toHaveTextContent('pending_retry');
    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(repository.saveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('retry'));
    await act(async () => {});
    expect(repository.saveDraft).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('save-state')).toHaveTextContent('saved');
  });

  it('exposes conflicts and can keep the authoritative remote record', async () => {
    const remote = makeSafetyPlan({ id: 'plan-a', revision: 4 });
    const conflict = Object.assign(new Error('Changed elsewhere'), {
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    const repository = makeRepository({
      saveDraft: vi.fn(async () => { throw conflict; }),
      getPlan: vi.fn(async () => remote),
    });
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(screen.getByTestId('save-state')).toHaveTextContent('conflict');

    fireEvent.click(screen.getByText('keep remote'));
    await act(async () => {});
    expect(repository.getPlan).toHaveBeenCalledWith('plan-a');
    expect(screen.getByTestId('save-state')).toHaveTextContent('idle');
    expect(screen.getByTestId('plan-count')).toHaveTextContent('1');
  });

  it('rebases conflicting input as a new draft version when requested', async () => {
    const remote = makeSafetyPlan({ id: 'plan-a', revision: 4 });
    const conflict = Object.assign(new Error('Changed elsewhere'), {
      code: 'SAFETY_PLAN_CONFLICT',
      currentRevision: 4,
    });
    const saveDraft = vi.fn()
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async ({ plan }) => ({ ...plan, revision: 5 }));
    const repository = makeRepository({
      saveDraft,
      getPlan: vi.fn(async () => remote),
    });
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    await act(async () => { vi.advanceTimersByTime(750); });
    fireEvent.click(screen.getByText('create revision'));
    await act(async () => {});

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedRevision: 4,
      isNewVersion: true,
      plan: expect.objectContaining({
        currentVersionId: expect.not.stringMatching(/^safety-plan-version-1$/),
        versions: expect.arrayContaining([
          expect.objectContaining({ id: 'safety-plan-version-1' }),
          expect.objectContaining({ revision: 1, status: 'draft' }),
        ]),
      }),
    }));
    expect(screen.getByTestId('save-state')).toHaveTextContent('saved');
  });

  it('removes deleted drafts and re-adds restored drafts', async () => {
    const active = makeSafetyPlan({ id: 'plan-a', revision: 1 });
    const repository = makeRepository({
      listPlans: vi.fn(async () => [active]),
      deleteDraft: vi.fn(async () => ({
        ...active,
        revision: 2,
        deletedAt: '2026-07-24T03:00:00.000Z',
      })),
      restoreDraft: vi.fn(async () => ({ ...active, revision: 3 })),
    });
    renderProvider(repository);
    await act(async () => {});
    expect(screen.getByTestId('plan-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByText('delete draft'));
    await act(async () => {});
    expect(screen.getByTestId('plan-count')).toHaveTextContent('0');

    fireEvent.click(screen.getByText('restore draft'));
    await act(async () => {});
    expect(screen.getByTestId('plan-count')).toHaveTextContent('1');
  });

  it('retains a pending save for explicit retry when switching plans', async () => {
    const repository = makeRepository({
      listPlans: vi.fn(async () => [
        makeSafetyPlan({ id: 'plan-a', jobId: 'job-confirmed', revision: 1 }),
      ]),
    });
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a newer'));
    await act(async () => { vi.advanceTimersByTime(500); });
    fireEvent.click(screen.getByText('edit b'));
    expect(screen.getByTestId('plan-job')).toHaveTextContent('job-confirmed');
    expect(screen.getByTestId('pending-retry-plans')).toHaveTextContent('plan-a');

    await act(async () => { vi.advanceTimersByTime(750); });

    expect(repository.saveDraft).toHaveBeenCalledTimes(1);
    expect(repository.saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ id: 'plan-b' }),
    }));

    fireEvent.click(screen.getByText('retry'));
    await act(async () => {});
    expect(repository.saveDraft).toHaveBeenCalledTimes(2);
    expect(repository.saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ id: 'plan-a', jobId: 'job-newer' }),
    }));
    expect(screen.getByTestId('pending-retry-plans')).toHaveTextContent('');
  });

  it('cancels pending saves on unmount and logout', async () => {
    const repository = makeRepository();
    const view = renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    view.unmount();
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(repository.saveDraft).not.toHaveBeenCalled();

    const second = renderProvider(repository);
    await act(async () => {});
    fireEvent.click(screen.getByText('edit a'));
    currentUser = null;
    second.rerender(
      <SafetyPlanProvider repository={repository}>
        <Probe />
      </SafetyPlanProvider>
    );
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(repository.saveDraft).not.toHaveBeenCalled();
  });

  it('isolates initial load errors and still renders its children', async () => {
    vi.useRealTimers();
    const repository = makeRepository({
      listPlans: vi.fn(async () => { throw new Error('Safety storage unavailable'); }),
    });
    renderProvider(repository);

    expect(await screen.findByTestId('children-alive')).toHaveTextContent('alive');
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Safety storage unavailable');
    });
  });

  it('clears prior tenant plans immediately when authenticated identity changes', async () => {
    const repository = makeRepository({
      listPlans: vi.fn()
        .mockResolvedValueOnce([makeSafetyPlan({ id: 'plan-a' })])
        .mockRejectedValueOnce(new Error('Second tenant unavailable')),
    });
    const view = renderProvider(repository);
    await act(async () => {});
    expect(screen.getByTestId('plan-count')).toHaveTextContent('1');

    currentUser = {
      id: 'user-2',
      name: 'Other Operator',
      role: 'contractor',
      tenantId: 'tenant-2',
      safetyPlanAuthority: false,
    };
    await act(async () => {
      view.rerender(
        <SafetyPlanProvider repository={repository}>
          <Probe />
        </SafetyPlanProvider>
      );
    });

    expect(screen.getByTestId('plan-count')).toHaveTextContent('0');
    await act(async () => {});
    expect(screen.getByTestId('plan-count')).toHaveTextContent('0');
  });

  it('does not let a late initial load overwrite a newer optimistic edit', async () => {
    let resolveLoad!: (plans: ReturnType<typeof makeSafetyPlan>[]) => void;
    const repository = makeRepository({
      listPlans: vi.fn(() => new Promise<ReturnType<typeof makeSafetyPlan>[]>((resolve) => {
        resolveLoad = resolve;
      })),
    });
    renderProvider(repository);

    fireEvent.click(screen.getByText('edit a'));
    expect(screen.getByTestId('plan-count')).toHaveTextContent('1');
    await act(async () => { resolveLoad([]); });

    expect(screen.getByTestId('plan-count')).toHaveTextContent('1');
  });

  it('serializes and rebases a newer same-plan edit behind an in-flight save', async () => {
    let resolveFirst!: (plan: ReturnType<typeof makeSafetyPlan>) => void;
    const saveDraft = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(async ({ plan }) => ({ ...plan, revision: 3 }));
    const repository = makeRepository({ saveDraft });
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    await act(async () => { vi.advanceTimersByTime(750); });
    fireEvent.click(screen.getByText('edit a newer'));
    await act(async () => { vi.advanceTimersByTime(750); });
    expect(saveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst(makeSafetyPlan({
        id: 'plan-a',
        revision: 2,
        versions: [{ ...makeSafetyPlan().versions[0], revision: 2 }],
      }));
    });
    await act(async () => {});

    expect(saveDraft).toHaveBeenCalledTimes(2);
    expect(saveDraft).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedRevision: 2,
      plan: expect.objectContaining({ jobId: 'job-newer', revision: 2 }),
    }));
    expect(screen.getByTestId('plan-job')).toHaveTextContent('job-newer');
  });

  it('cancels a matching pending autosave before deleting the draft', async () => {
    const active = makeSafetyPlan({ id: 'plan-a', revision: 1 });
    const repository = makeRepository({
      listPlans: vi.fn(async () => [active]),
      deleteDraft: vi.fn(async () => ({ ...active, revision: 2, deletedAt: 'now' })),
    });
    renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    fireEvent.click(screen.getByText('delete draft'));
    await act(async () => { vi.advanceTimersByTime(750); });

    expect(repository.saveDraft).not.toHaveBeenCalled();
    expect(repository.deleteDraft).toHaveBeenCalledTimes(1);
  });

  it('never starts a queued save after the authenticated session changes', async () => {
    let resolveFirst!: (plan: ReturnType<typeof makeSafetyPlan>) => void;
    const saveDraft = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValue(makeSafetyPlan({ id: 'plan-a', revision: 3 }));
    const repository = makeRepository({ saveDraft });
    const view = renderProvider(repository);
    await act(async () => {});

    fireEvent.click(screen.getByText('edit a'));
    await act(async () => { vi.advanceTimersByTime(750); });
    fireEvent.click(screen.getByText('edit a newer'));
    await act(async () => { vi.advanceTimersByTime(750); });

    currentUser = {
      id: 'user-2',
      name: 'Other Operator',
      role: 'contractor',
      tenantId: 'tenant-2',
      safetyPlanAuthority: false,
    };
    await act(async () => {
      view.rerender(
        <SafetyPlanProvider repository={repository}>
          <Probe />
        </SafetyPlanProvider>
      );
    });
    await act(async () => {
      resolveFirst(makeSafetyPlan({ id: 'plan-a', revision: 2 }));
    });
    await act(async () => {});

    expect(saveDraft).toHaveBeenCalledTimes(1);
  });
});
