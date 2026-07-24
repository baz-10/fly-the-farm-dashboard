import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { SafetyPlan, SafetyPlanActor, SafetyPlanVersion } from '../types/safetyPlan';
import {
  safetyPlanRepository,
  type SafetyPlanRepository,
  type SaveSafetyPlanDraftInput,
} from '../services/safetyPlanRepository';
import { useAuth } from './AuthContext';

export type SaveState = 'idle' | 'saving' | 'saved' | 'pending_retry' | 'conflict';

export class SafetyPlanLifecycleActiveError extends Error {
  readonly status = 409;
  readonly code = 'SAFETY_PLAN_LIFECYCLE_ACTIVE';

  constructor(planId: string) {
    super(`Safety Plan ${planId} lifecycle operation is active. Wait for it to finish.`);
    this.name = 'SafetyPlanLifecycleActiveError';
  }
}

export interface SafetyPlanContextValue {
  plans: SafetyPlan[];
  saveState: SaveState;
  lastSavedAt?: string;
  error?: string;
  pendingRetryPlanIds: string[];
  saveDraft(input: SaveSafetyPlanDraftInput): Promise<void>;
  retrySave(): Promise<void>;
  resolveConflict(choice: 'keep_remote' | 'create_revision'): Promise<void>;
  deleteDraft(
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ): Promise<void>;
  restoreDraft(
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ): Promise<void>;
}

interface SafetyPlanProviderProps {
  children: ReactNode;
  repository?: SafetyPlanRepository;
}

interface PendingSave {
  input: SaveSafetyPlanDraftInput;
  generation: number;
}

interface ActiveOperation {
  controller: AbortController;
  promise: Promise<unknown>;
}

interface LifecycleLock extends ActiveOperation {
  kind: 'delete' | 'restore';
}

const SafetyPlanContext = createContext<SafetyPlanContextValue | undefined>(undefined);
const AUTOSAVE_DELAY_MS = 750;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Safety Plan storage failed.';
}

function isAbortError(error: unknown): boolean {
  return (error as { name?: string })?.name === 'AbortError';
}

function replacePlan(plans: SafetyPlan[], replacement: SafetyPlan): SafetyPlan[] {
  const found = plans.some((plan) => plan.id === replacement.id);
  return found
    ? plans.map((plan) => plan.id === replacement.id ? replacement : plan)
    : [...plans, replacement];
}

function createVersionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `safety_version_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function nextVersionLabel(version: string): string {
  const parsed = Number.parseFloat(version);
  return Number.isFinite(parsed) ? (parsed + 1).toFixed(1) : `${version}.1`;
}

function rebaseInput(
  input: SaveSafetyPlanDraftInput,
  confirmed: SafetyPlan | undefined
): SaveSafetyPlanDraftInput {
  if (!confirmed || confirmed.revision <= input.expectedRevision) return input;
  const confirmedVersions = new Map(
    confirmed.versions.map((version) => [version.id, version])
  );
  return {
    ...input,
    expectedRevision: confirmed.revision,
    plan: {
      ...input.plan,
      tenantId: confirmed.tenantId,
      createdAt: confirmed.createdAt,
      revision: confirmed.revision,
      versions: input.plan.versions.map((version) => {
        const stored = confirmedVersions.get(version.id);
        return stored ? { ...version, revision: stored.revision } : version;
      }),
    },
  };
}

export function SafetyPlanProvider({
  children,
  repository = safetyPlanRepository,
}: SafetyPlanProviderProps) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<SafetyPlan[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string>();
  const [error, setError] = useState<string>();
  const [pendingRetryPlanIds, setPendingRetryPlanIds] = useState<string[]>([]);

  const mountedRef = useRef(true);
  const userIdRef = useRef(user?.id);
  const sessionGenerationRef = useRef(0);
  const generationRef = useRef(0);
  const currentPlanIdRef = useRef<string | undefined>(undefined);
  const conflictPlanIdRef = useRef<string | undefined>(undefined);
  const confirmedPlansRef = useRef(new Map<string, SafetyPlan>());
  const timerByPlanRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingByPlanRef = useRef(new Map<string, PendingSave>());
  const failedByPlanRef = useRef(new Map<string, PendingSave>());
  const activeSaveByPlanRef = useRef(new Map<string, ActiveOperation>());
  const saveChainByPlanRef = useRef(new Map<string, Promise<void>>());
  const queuedCountByPlanRef = useRef(new Map<string, number>());
  const retryReservationsRef = useRef(new Set<string>());
  const lifecycleLockByPlanRef = useRef(new Map<string, LifecycleLock>());
  const epochByPlanRef = useRef(new Map<string, number>());
  const loadControllerRef = useRef<AbortController | undefined>(undefined);
  userIdRef.current = user?.id;

  const refreshPendingRetryIds = useCallback(() => {
    setPendingRetryPlanIds(Array.from(failedByPlanRef.current.keys()));
  }, []);

  const setStatusForPlan = useCallback((
    planId: string,
    state: SaveState,
    nextError?: string
  ) => {
    if (currentPlanIdRef.current !== planId) return;
    setSaveState(state);
    setError(nextError);
  }, []);

  const clearPlanTimer = useCallback((planId: string) => {
    const timer = timerByPlanRef.current.get(planId);
    if (timer !== undefined) clearTimeout(timer);
    timerByPlanRef.current.delete(planId);
  }, []);

  const clearAllTimers = useCallback(() => {
    timerByPlanRef.current.forEach((timer) => clearTimeout(timer));
    timerByPlanRef.current.clear();
  }, []);

  const abortActiveSave = useCallback(async (planId: string) => {
    const active = activeSaveByPlanRef.current.get(planId);
    if (!active) return;
    active.controller.abort();
    await Promise.allSettled([active.promise]);
  }, []);

  const abortAllOperations = useCallback(async () => {
    const operations = [
      ...activeSaveByPlanRef.current.values(),
      ...lifecycleLockByPlanRef.current.values(),
    ];
    operations.forEach(({ controller }) => controller.abort());
    await Promise.allSettled(operations.map(({ promise }) => promise));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAllTimers();
      loadControllerRef.current?.abort();
      void abortAllOperations();
    };
  }, [abortAllOperations, clearAllTimers]);

  useEffect(() => {
    const sessionGeneration = ++sessionGenerationRef.current;
    clearAllTimers();
    loadControllerRef.current?.abort();
    const priorOperationsSettled = abortAllOperations();
    pendingByPlanRef.current.clear();
    failedByPlanRef.current.clear();
    retryReservationsRef.current.clear();
    confirmedPlansRef.current.clear();
    currentPlanIdRef.current = undefined;
    conflictPlanIdRef.current = undefined;
    setPlans([]);
    setSaveState('idle');
    setError(undefined);
    setLastSavedAt(undefined);
    setPendingRetryPlanIds([]);

    if (!user || (user.role !== 'admin' && user.role !== 'contractor')) return;

    let cancelled = false;
    const generationAtLoadStart = generationRef.current;
    const loadController = new AbortController();
    loadControllerRef.current = loadController;
    priorOperationsSettled
      .then(() => repository.listPlans({ signal: loadController.signal }))
      .then((loaded) => {
        if (
          cancelled
          || sessionGenerationRef.current !== sessionGeneration
          || loadController.signal.aborted
          || generationRef.current !== generationAtLoadStart
        ) return;
        const tenantPlans = loaded.filter((plan) => plan.tenantId === user.tenantId);
        confirmedPlansRef.current = new Map(tenantPlans.map((plan) => [plan.id, plan]));
        setPlans(tenantPlans);
      })
      .catch((loadError) => {
        if (
          !cancelled
          && !isAbortError(loadError)
          && sessionGenerationRef.current === sessionGeneration
        ) {
          setError(messageFrom(loadError));
        }
      });

    return () => {
      cancelled = true;
      loadController.abort();
      clearAllTimers();
      void abortAllOperations();
    };
  }, [
    abortAllOperations,
    clearAllTimers,
    repository,
    user?.id,
    user?.role,
    user?.tenantId,
  ]);

  const performSave = useCallback(async (
    entry: PendingSave,
    epoch: number,
    queuedUserId: string,
    queuedSessionGeneration: number,
    signal: AbortSignal
  ) => {
    const planId = entry.input.plan.id;
    if (
      userIdRef.current !== queuedUserId
      || sessionGenerationRef.current !== queuedSessionGeneration
      || (epochByPlanRef.current.get(planId) || 0) !== epoch
      || lifecycleLockByPlanRef.current.has(planId)
    ) return;

    const input = rebaseInput(entry.input, confirmedPlansRef.current.get(planId));
    try {
      const saved = await repository.saveDraft({ ...input, signal });
      if (
        !mountedRef.current
        || userIdRef.current !== queuedUserId
        || sessionGenerationRef.current !== queuedSessionGeneration
        || (epochByPlanRef.current.get(planId) || 0) !== epoch
      ) return;

      confirmedPlansRef.current.set(saved.id, saved);
      failedByPlanRef.current.delete(saved.id);
      refreshPendingRetryIds();
      const latest = pendingByPlanRef.current.get(saved.id);
      if (latest?.generation === entry.generation) {
        pendingByPlanRef.current.delete(saved.id);
        setPlans((current) => replacePlan(current, saved));
        if (currentPlanIdRef.current === saved.id) {
          setLastSavedAt(new Date().toISOString());
          setSaveState('saved');
          setError(undefined);
        }
      }
    } catch (saveError) {
      if (isAbortError(saveError)) return;
      if (
        !mountedRef.current
        || userIdRef.current !== queuedUserId
        || sessionGenerationRef.current !== queuedSessionGeneration
        || (epochByPlanRef.current.get(planId) || 0) !== epoch
      ) return;
      const latest = pendingByPlanRef.current.get(planId);
      if (latest?.generation !== entry.generation) return;
      failedByPlanRef.current.set(planId, { ...entry, input });
      refreshPendingRetryIds();
      const code = (saveError as { code?: string })?.code;
      if (code === 'SAFETY_PLAN_CONFLICT') conflictPlanIdRef.current = planId;
      setStatusForPlan(
        planId,
        code === 'SAFETY_PLAN_CONFLICT' ? 'conflict' : 'pending_retry',
        messageFrom(saveError)
      );
    }
  }, [refreshPendingRetryIds, repository, setStatusForPlan]);

  const enqueueSave = useCallback((entry: PendingSave): Promise<void> => {
    const planId = entry.input.plan.id;
    const queuedUserId = userIdRef.current;
    if (!queuedUserId) return Promise.resolve();
    const queuedSessionGeneration = sessionGenerationRef.current;
    const epoch = epochByPlanRef.current.get(planId) || 0;
    queuedCountByPlanRef.current.set(
      planId,
      (queuedCountByPlanRef.current.get(planId) || 0) + 1
    );

    const prior = saveChainByPlanRef.current.get(planId) || Promise.resolve();
    const task = prior.catch(() => undefined).then(async () => {
      if (
        userIdRef.current !== queuedUserId
        || sessionGenerationRef.current !== queuedSessionGeneration
        || (epochByPlanRef.current.get(planId) || 0) !== epoch
        || lifecycleLockByPlanRef.current.has(planId)
      ) return;
      const controller = new AbortController();
      const operation = performSave(
        entry,
        epoch,
        queuedUserId,
        queuedSessionGeneration,
        controller.signal
      );
      activeSaveByPlanRef.current.set(planId, { controller, promise: operation });
      try {
        await operation;
      } finally {
        const active = activeSaveByPlanRef.current.get(planId);
        if (active?.promise === operation) activeSaveByPlanRef.current.delete(planId);
      }
    });

    const settled = task.finally(() => {
      const remaining = (queuedCountByPlanRef.current.get(planId) || 1) - 1;
      if (remaining > 0) queuedCountByPlanRef.current.set(planId, remaining);
      else queuedCountByPlanRef.current.delete(planId);
    });
    const safe = settled.catch(() => undefined);
    saveChainByPlanRef.current.set(planId, safe);
    void safe.finally(() => {
      if (saveChainByPlanRef.current.get(planId) === safe) {
        saveChainByPlanRef.current.delete(planId);
      }
    });
    return settled;
  }, [performSave]);

  const scheduleSave = useCallback((entry: PendingSave) => {
    const planId = entry.input.plan.id;
    clearPlanTimer(planId);
    const timer = setTimeout(() => {
      timerByPlanRef.current.delete(planId);
      const latest = pendingByPlanRef.current.get(planId);
      if (latest?.generation === entry.generation) void enqueueSave(latest);
    }, AUTOSAVE_DELAY_MS);
    timerByPlanRef.current.set(planId, timer);
  }, [clearPlanTimer, enqueueSave]);

  const saveDraft = useCallback(async (input: SaveSafetyPlanDraftInput) => {
    const planId = input.plan.id;
    currentPlanIdRef.current = planId;
    if (!userIdRef.current) return;
    if (lifecycleLockByPlanRef.current.has(planId)) {
      const lifecycleError = new SafetyPlanLifecycleActiveError(planId);
      setSaveState('idle');
      setError(lifecycleError.message);
      throw lifecycleError;
    }

    const entry: PendingSave = {
      input,
      generation: ++generationRef.current,
    };
    pendingByPlanRef.current.set(planId, entry);
    failedByPlanRef.current.delete(planId);
    refreshPendingRetryIds();
    setPlans((current) => replacePlan(current, input.plan));
    setSaveState('saving');
    setError(undefined);
    scheduleSave(entry);
  }, [refreshPendingRetryIds, scheduleSave]);

  const retrySave = useCallback(async () => {
    if (!userIdRef.current) return;
    const candidates = new Map(failedByPlanRef.current);
    pendingByPlanRef.current.forEach((entry, planId) => {
      if (!candidates.has(planId)) candidates.set(planId, entry);
    });

    const reserved: PendingSave[] = [];
    for (const [planId, entry] of candidates) {
      if (
        retryReservationsRef.current.has(planId)
        || lifecycleLockByPlanRef.current.has(planId)
        || activeSaveByPlanRef.current.has(planId)
        || queuedCountByPlanRef.current.has(planId)
      ) continue;
      retryReservationsRef.current.add(planId);
      clearPlanTimer(planId);
      failedByPlanRef.current.delete(planId);
      reserved.push(entry);
    }
    refreshPendingRetryIds();
    if (reserved.length === 0) return;

    const activePlanId = currentPlanIdRef.current;
    if (activePlanId && reserved.some((entry) => entry.input.plan.id === activePlanId)) {
      setSaveState('saving');
      setError(undefined);
    }
    await Promise.all(reserved.map(async (entry) => {
      try {
        await enqueueSave(entry);
      } finally {
        retryReservationsRef.current.delete(entry.input.plan.id);
      }
    }));
  }, [clearPlanTimer, enqueueSave, refreshPendingRetryIds]);

  const resolveConflict = useCallback(async (
    choice: 'keep_remote' | 'create_revision'
  ) => {
    const planId = conflictPlanIdRef.current || currentPlanIdRef.current;
    if (!planId || !userIdRef.current) return;
    const pending = pendingByPlanRef.current.get(planId);
    if (!pending || lifecycleLockByPlanRef.current.has(planId)) return;
    const resolvingUserId = userIdRef.current;
    const resolvingSessionGeneration = sessionGenerationRef.current;
    clearPlanTimer(planId);
    await abortActiveSave(planId);

    const controller = new AbortController();
    const lookup = repository.getPlan(planId, { signal: controller.signal });
    activeSaveByPlanRef.current.set(planId, { controller, promise: lookup });
    try {
      const remote = await lookup;
      if (
        !mountedRef.current
        || userIdRef.current !== resolvingUserId
        || sessionGenerationRef.current !== resolvingSessionGeneration
      ) return;
      if (!remote) throw new Error('The remote Safety Plan is no longer available.');

      if (choice === 'keep_remote') {
        confirmedPlansRef.current.set(remote.id, remote);
        pendingByPlanRef.current.delete(remote.id);
        failedByPlanRef.current.delete(remote.id);
        conflictPlanIdRef.current = undefined;
        refreshPendingRetryIds();
        setPlans((current) => replacePlan(current, remote));
        setStatusForPlan(remote.id, 'idle');
        return;
      }

      const sourceVersion = pending.input.plan.versions.find(
        (version) => version.id === pending.input.plan.currentVersionId
      );
      if (!sourceVersion) throw new Error('The conflicting draft version was not found.');
      const remoteCurrentVersion = remote.versions.find(
        (version) => version.id === remote.currentVersionId
      );
      const now = new Date().toISOString();
      const revision: SafetyPlanVersion = {
        ...sourceVersion,
        id: createVersionId(),
        planId: remote.id,
        version: nextVersionLabel(remoteCurrentVersion?.version || sourceVersion.version),
        status: 'draft',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      const rebased: SafetyPlan = {
        ...remote,
        status: 'draft',
        currentVersionId: revision.id,
        versions: [...remote.versions, revision],
        updatedAt: now,
      };
      const entry: PendingSave = {
        generation: ++generationRef.current,
        input: {
          plan: rebased,
          expectedRevision: remote.revision,
          actor: pending.input.actor,
          isNewVersion: true,
        },
      };
      pendingByPlanRef.current.set(planId, entry);
      failedByPlanRef.current.delete(planId);
      conflictPlanIdRef.current = undefined;
      refreshPendingRetryIds();
      setPlans((current) => replacePlan(current, rebased));
      setStatusForPlan(planId, 'saving');
      await enqueueSave(entry);
    } catch (resolutionError) {
      if (isAbortError(resolutionError)) return;
      if (
        mountedRef.current
        && userIdRef.current === resolvingUserId
        && sessionGenerationRef.current === resolvingSessionGeneration
      ) {
        setStatusForPlan(planId, 'conflict', messageFrom(resolutionError));
      }
    } finally {
      const active = activeSaveByPlanRef.current.get(planId);
      if (active?.promise === lookup) activeSaveByPlanRef.current.delete(planId);
    }
  }, [
    abortActiveSave,
    clearPlanTimer,
    enqueueSave,
    refreshPendingRetryIds,
    repository,
    setStatusForPlan,
  ]);

  const runLifecycle = useCallback(async (
    kind: 'delete' | 'restore',
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => {
    currentPlanIdRef.current = planId;
    const mutationUserId = userIdRef.current;
    const mutationSessionGeneration = sessionGenerationRef.current;
    if (!mutationUserId) return;
    if (lifecycleLockByPlanRef.current.has(planId)) {
      const lifecycleError = new SafetyPlanLifecycleActiveError(planId);
      setStatusForPlan(planId, 'idle', lifecycleError.message);
      throw lifecycleError;
    }

    const controller = new AbortController();
    let settleLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      settleLock = resolve;
    });
    lifecycleLockByPlanRef.current.set(planId, {
      kind,
      controller,
      promise: lockPromise,
    });

    const snapshotPending = pendingByPlanRef.current.get(planId);
    const snapshotFailed = failedByPlanRef.current.get(planId);
    const retryEntry = snapshotPending || snapshotFailed;
    clearPlanTimer(planId);
    epochByPlanRef.current.set(planId, (epochByPlanRef.current.get(planId) || 0) + 1);

    try {
      await abortActiveSave(planId);
      await saveChainByPlanRef.current.get(planId);
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;
      const mutation = kind === 'delete'
        ? repository.deleteDraft(planId, expectedRevision, actor, {
          signal: controller.signal,
        })
        : repository.restoreDraft(planId, expectedRevision, actor, {
          signal: controller.signal,
        });
      const result = await mutation;
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;

      clearPlanTimer(planId);
      pendingByPlanRef.current.delete(planId);
      failedByPlanRef.current.delete(planId);
      retryReservationsRef.current.delete(planId);
      queuedCountByPlanRef.current.delete(planId);
      saveChainByPlanRef.current.delete(planId);
      activeSaveByPlanRef.current.delete(planId);
      epochByPlanRef.current.delete(planId);
      conflictPlanIdRef.current = conflictPlanIdRef.current === planId
        ? undefined
        : conflictPlanIdRef.current;
      refreshPendingRetryIds();
      if (kind === 'delete') {
        confirmedPlansRef.current.delete(planId);
        setPlans((current) => current.filter((plan) => plan.id !== result.id));
      } else {
        confirmedPlansRef.current.set(result.id, result);
        setPlans((current) => replacePlan(current, result));
      }
      setStatusForPlan(planId, 'idle');
    } catch (mutationError) {
      if (isAbortError(mutationError)) return;
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;
      if (retryEntry) {
        pendingByPlanRef.current.set(planId, retryEntry);
        failedByPlanRef.current.set(planId, retryEntry);
        setPlans((current) => replacePlan(current, retryEntry.input.plan));
        refreshPendingRetryIds();
        setStatusForPlan(planId, 'pending_retry', messageFrom(mutationError));
      } else {
        setStatusForPlan(planId, 'idle', messageFrom(mutationError));
      }
    } finally {
      const lock = lifecycleLockByPlanRef.current.get(planId);
      if (lock?.promise === lockPromise) lifecycleLockByPlanRef.current.delete(planId);
      settleLock();
    }
  }, [
    abortActiveSave,
    clearPlanTimer,
    refreshPendingRetryIds,
    repository,
    setStatusForPlan,
  ]);

  const deleteDraft = useCallback((
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => runLifecycle('delete', planId, expectedRevision, actor), [runLifecycle]);

  const restoreDraft = useCallback((
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => runLifecycle('restore', planId, expectedRevision, actor), [runLifecycle]);

  const value = useMemo<SafetyPlanContextValue>(() => ({
    plans,
    saveState,
    lastSavedAt,
    error,
    pendingRetryPlanIds,
    saveDraft,
    retrySave,
    resolveConflict,
    deleteDraft,
    restoreDraft,
  }), [
    deleteDraft,
    error,
    lastSavedAt,
    pendingRetryPlanIds,
    plans,
    resolveConflict,
    restoreDraft,
    retrySave,
    saveDraft,
    saveState,
  ]);

  return (
    <SafetyPlanContext.Provider value={value}>
      {children}
    </SafetyPlanContext.Provider>
  );
}

export function useSafetyPlans(): SafetyPlanContextValue {
  const context = useContext(SafetyPlanContext);
  if (!context) throw new Error('useSafetyPlans must be used within SafetyPlanProvider.');
  return context;
}
