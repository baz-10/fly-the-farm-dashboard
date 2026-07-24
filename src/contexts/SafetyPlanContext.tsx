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
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingRef = useRef<SaveSafetyPlanDraftInput | undefined>(undefined);
  const mountedRef = useRef(true);
  const userIdRef = useRef(user?.id);
  const sessionGenerationRef = useRef(0);
  const operationGenerationRef = useRef(0);
  const planEpochRef = useRef(new Map<string, number>());
  const confirmedPlansRef = useRef(new Map<string, SafetyPlan>());
  const failedInputsRef = useRef(new Map<string, SaveSafetyPlanDraftInput>());
  const latestPlanGenerationRef = useRef(new Map<string, number>());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const queuedPlanCountsRef = useRef(new Map<string, number>());
  const loadControllerRef = useRef<AbortController | undefined>(undefined);
  const inFlightPlanMutationsRef = useRef(new Map<string, {
    controller: AbortController;
    promise: Promise<unknown>;
  }>());
  userIdRef.current = user?.id;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const abortPlanMutation = useCallback(async (planId: string) => {
    const mutation = inFlightPlanMutationsRef.current.get(planId);
    if (!mutation) return;
    mutation.controller.abort();
    try {
      await mutation.promise;
    } catch {
      // The operation owns its error state; cancellation only waits for settlement.
    }
  }, []);

  const abortAllMutations = useCallback(async () => {
    const mutations = Array.from(inFlightPlanMutationsRef.current.values());
    mutations.forEach(({ controller }) => controller.abort());
    await Promise.allSettled(mutations.map(({ promise }) => promise));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      clearTimer();
      loadControllerRef.current?.abort();
      void abortAllMutations();
    };
  }, [abortAllMutations, clearTimer]);

  useEffect(() => {
    const sessionGeneration = ++sessionGenerationRef.current;
    operationGenerationRef.current += 1;
    clearTimer();
    loadControllerRef.current?.abort();
    const priorMutationsSettled = abortAllMutations();
    pendingRef.current = undefined;
    confirmedPlansRef.current.clear();
    failedInputsRef.current.clear();
    latestPlanGenerationRef.current.clear();
    setPlans([]);
    setSaveState('idle');
    setError(undefined);
    setLastSavedAt(undefined);
    setPendingRetryPlanIds([]);

    if (!user || (user.role !== 'admin' && user.role !== 'contractor')) {
      return;
    }

    let cancelled = false;
    const operationGeneration = operationGenerationRef.current;
    const loadController = new AbortController();
    loadControllerRef.current = loadController;
    priorMutationsSettled
      .then(() => repository.listPlans({ signal: loadController.signal }))
      .then((loaded) => {
        if (
          cancelled
          || sessionGenerationRef.current !== sessionGeneration
          || operationGenerationRef.current !== operationGeneration
        ) return;
        const tenantPlans = loaded.filter((plan) => plan.tenantId === user.tenantId);
        confirmedPlansRef.current = new Map(tenantPlans.map((plan) => [plan.id, plan]));
        setPlans(tenantPlans);
      })
      .catch((loadError) => {
        if (isAbortError(loadError)) return;
        if (
          !cancelled
          && sessionGenerationRef.current === sessionGeneration
          && operationGenerationRef.current === operationGeneration
        ) {
          setError(messageFrom(loadError));
        }
      });

    return () => {
      cancelled = true;
      operationGenerationRef.current += 1;
      clearTimer();
      loadController.abort();
      void abortAllMutations();
    };
  }, [
    abortAllMutations,
    clearTimer,
    repository,
    user?.id,
    user?.role,
    user?.tenantId,
  ]);

  const performSave = useCallback(async (
    originalInput: SaveSafetyPlanDraftInput,
    generation: number,
    planEpoch: number,
    queuedUserId: string,
    queuedSessionGeneration: number,
    signal: AbortSignal
  ) => {
    if (
      userIdRef.current !== queuedUserId
      || sessionGenerationRef.current !== queuedSessionGeneration
    ) return;
    if ((planEpochRef.current.get(originalInput.plan.id) || 0) !== planEpoch) return;
    const input = rebaseInput(
      originalInput,
      confirmedPlansRef.current.get(originalInput.plan.id)
    );

    try {
      const saved = await repository.saveDraft({ ...input, signal });
      if (
        !mountedRef.current
        || userIdRef.current !== queuedUserId
        || sessionGenerationRef.current !== queuedSessionGeneration
        || (planEpochRef.current.get(saved.id) || 0) !== planEpoch
      ) return;
      confirmedPlansRef.current.set(saved.id, saved);
      failedInputsRef.current.delete(saved.id);
      setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
      const latestForPlan = latestPlanGenerationRef.current.get(saved.id) === generation;
      if (latestForPlan) {
        setPlans((current) => replacePlan(current, saved));
      }
      if (generation !== operationGenerationRef.current) return;
      pendingRef.current = undefined;
      setLastSavedAt(new Date().toISOString());
      setSaveState('saved');
    } catch (saveError) {
      if (isAbortError(saveError)) return;
      if (
        !mountedRef.current
        || userIdRef.current !== queuedUserId
        || sessionGenerationRef.current !== queuedSessionGeneration
        || (planEpochRef.current.get(originalInput.plan.id) || 0) !== planEpoch
      ) return;
      const latestForPlan =
        latestPlanGenerationRef.current.get(originalInput.plan.id) === generation;
      if (latestForPlan) {
        failedInputsRef.current.set(originalInput.plan.id, input);
        setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
        const confirmed = confirmedPlansRef.current.get(originalInput.plan.id);
        if (confirmed) {
          setPlans((current) => replacePlan(current, confirmed));
        } else if (generation !== operationGenerationRef.current) {
          setPlans((current) =>
            current.filter((plan) => plan.id !== originalInput.plan.id)
          );
        }
      }
      if (generation !== operationGenerationRef.current) return;
      pendingRef.current = input;
      setError(messageFrom(saveError));
      const code = (saveError as { code?: string })?.code;
      setSaveState(code === 'SAFETY_PLAN_CONFLICT' ? 'conflict' : 'pending_retry');
    }
  }, [repository]);

  const enqueueSave = useCallback((
    input: SaveSafetyPlanDraftInput,
    generation: number
  ): Promise<void> => {
    const queuedUserId = userIdRef.current;
    if (!queuedUserId) return Promise.resolve();
    const queuedSessionGeneration = sessionGenerationRef.current;
    const planEpoch = planEpochRef.current.get(input.plan.id) || 0;
    queuedPlanCountsRef.current.set(
      input.plan.id,
      (queuedPlanCountsRef.current.get(input.plan.id) || 0) + 1
    );
    const queued = saveQueueRef.current.then(async () => {
      if (
        userIdRef.current !== queuedUserId
        || sessionGenerationRef.current !== queuedSessionGeneration
        || (planEpochRef.current.get(input.plan.id) || 0) !== planEpoch
      ) return;
      const controller = new AbortController();
      const operation = performSave(
        input,
        generation,
        planEpoch,
        queuedUserId,
        queuedSessionGeneration,
        controller.signal
      );
      inFlightPlanMutationsRef.current.set(input.plan.id, {
        controller,
        promise: operation,
      });
      try {
        await operation;
      } finally {
        const tracked = inFlightPlanMutationsRef.current.get(input.plan.id);
        if (tracked?.promise === operation) {
          inFlightPlanMutationsRef.current.delete(input.plan.id);
        }
      }
    });
    const settled = queued.finally(() => {
      const remaining = (queuedPlanCountsRef.current.get(input.plan.id) || 1) - 1;
      if (remaining > 0) queuedPlanCountsRef.current.set(input.plan.id, remaining);
      else queuedPlanCountsRef.current.delete(input.plan.id);
    });
    saveQueueRef.current = settled.catch(() => undefined);
    return settled;
  }, [performSave]);

  const saveDraft = useCallback(async (input: SaveSafetyPlanDraftInput) => {
    if (!userIdRef.current) return;
    const previous = pendingRef.current;
    const isSwitchingPlan = Boolean(previous && previous.plan.id !== input.plan.id);
    if (isSwitchingPlan && previous) {
      clearTimer();
      planEpochRef.current.set(
        previous.plan.id,
        (planEpochRef.current.get(previous.plan.id) || 0) + 1
      );
      await abortPlanMutation(previous.plan.id);
      if (!userIdRef.current) return;
      failedInputsRef.current.set(previous.plan.id, previous);
      setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
      const confirmed = confirmedPlansRef.current.get(previous.plan.id);
      setPlans((current) => confirmed
        ? replacePlan(current, confirmed)
        : current.filter((plan) => plan.id !== previous.plan.id)
      );
    }
    const generation = ++operationGenerationRef.current;
    latestPlanGenerationRef.current.set(input.plan.id, generation);
    clearTimer();
    failedInputsRef.current.delete(input.plan.id);
    setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
    pendingRef.current = input;
    setPlans((current) => replacePlan(current, input.plan));
    setError(undefined);
    setSaveState('saving');
    timerRef.current = setTimeout(() => {
      timerRef.current = undefined;
      if (userIdRef.current) void enqueueSave(input, generation);
    }, AUTOSAVE_DELAY_MS);
  }, [abortPlanMutation, clearTimer, enqueueSave]);

  const retrySave = useCallback(async () => {
    if (!userIdRef.current) return;
    clearTimer();
    const retainedByPlan = new Map(failedInputsRef.current);
    const pending = pendingRef.current;
    if (pending) {
      retainedByPlan.set(pending.plan.id, pending);
    }
    const retained = Array.from(retainedByPlan.values()).filter(
      (input) =>
        !inFlightPlanMutationsRef.current.has(input.plan.id)
        && !queuedPlanCountsRef.current.has(input.plan.id)
    );
    if (retained.length === 0) return;
    retained.forEach((input) => failedInputsRef.current.delete(input.plan.id));
    setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
    setSaveState('saving');
    setError(undefined);
    for (const input of retained) {
      const generation = ++operationGenerationRef.current;
      latestPlanGenerationRef.current.set(input.plan.id, generation);
      await enqueueSave(input, generation);
    }
  }, [clearTimer, enqueueSave]);

  const resolveConflict = useCallback(async (
    choice: 'keep_remote' | 'create_revision'
  ) => {
    const pending = pendingRef.current;
    if (!pending || !userIdRef.current) return;
    const resolvingUserId = userIdRef.current;
    const resolvingSessionGeneration = sessionGenerationRef.current;
    const generation = ++operationGenerationRef.current;
    clearTimer();

    try {
      await abortPlanMutation(pending.plan.id);
      const controller = new AbortController();
      const lookup = repository.getPlan(pending.plan.id, { signal: controller.signal });
      inFlightPlanMutationsRef.current.set(pending.plan.id, {
        controller,
        promise: lookup,
      });
      let remote: SafetyPlan | null;
      try {
        remote = await lookup;
      } finally {
        const tracked = inFlightPlanMutationsRef.current.get(pending.plan.id);
        if (tracked?.promise === lookup) {
          inFlightPlanMutationsRef.current.delete(pending.plan.id);
        }
      }
      if (
        !mountedRef.current
        || userIdRef.current !== resolvingUserId
        || sessionGenerationRef.current !== resolvingSessionGeneration
      ) return;
      if (!remote) throw new Error('The remote Safety Plan is no longer available.');

      if (choice === 'keep_remote') {
        confirmedPlansRef.current.set(remote.id, remote);
        pendingRef.current = undefined;
        failedInputsRef.current.delete(remote.id);
        setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
        setPlans((current) => replacePlan(current, remote));
        setError(undefined);
        setSaveState('idle');
        return;
      }

      const sourceVersion = pending.plan.versions.find(
        (version) => version.id === pending.plan.currentVersionId
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
      const nextInput: SaveSafetyPlanDraftInput = {
        plan: rebased,
        expectedRevision: remote.revision,
        actor: pending.actor,
        isNewVersion: true,
      };
      pendingRef.current = nextInput;
      latestPlanGenerationRef.current.set(nextInput.plan.id, generation);
      setPlans((current) => replacePlan(current, rebased));
      setSaveState('saving');
      await enqueueSave(nextInput, generation);
    } catch (resolutionError) {
      if (isAbortError(resolutionError)) return;
      if (
        !mountedRef.current
        || userIdRef.current !== resolvingUserId
        || sessionGenerationRef.current !== resolvingSessionGeneration
      ) return;
      setError(messageFrom(resolutionError));
      setSaveState('conflict');
    }
  }, [abortPlanMutation, clearTimer, enqueueSave, repository]);

  const deleteDraft = useCallback(async (
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => {
    const mutationUserId = userIdRef.current;
    const mutationSessionGeneration = sessionGenerationRef.current;
    if (!mutationUserId) return;
    const snapshotPending = pendingRef.current?.plan.id === planId
      ? pendingRef.current
      : undefined;
    const snapshotFailed = failedInputsRef.current.get(planId);
    const retryInput = snapshotPending || snapshotFailed;
    clearTimer();
    const nextEpoch = (planEpochRef.current.get(planId) || 0) + 1;
    planEpochRef.current.set(planId, nextEpoch);
    await abortPlanMutation(planId);
    if (
      !mountedRef.current
      || userIdRef.current !== mutationUserId
      || sessionGenerationRef.current !== mutationSessionGeneration
    ) return;
    const controller = new AbortController();
    const mutation = repository.deleteDraft(
      planId,
      expectedRevision,
      actor,
      { signal: controller.signal }
    );
    inFlightPlanMutationsRef.current.set(planId, { controller, promise: mutation });
    try {
      const deleted = await mutation;
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;
      pendingRef.current = pendingRef.current?.plan.id === planId
        ? undefined
        : pendingRef.current;
      failedInputsRef.current.delete(planId);
      setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
      confirmedPlansRef.current.delete(planId);
      setPlans((current) => current.filter((plan) => plan.id !== deleted.id));
      setError(undefined);
      setSaveState('idle');
    } catch (mutationError) {
      if (isAbortError(mutationError)) return;
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;
      if (retryInput) {
        pendingRef.current = retryInput;
        failedInputsRef.current.set(planId, retryInput);
        setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
        setPlans((current) => replacePlan(current, retryInput.plan));
        setSaveState('pending_retry');
      }
      setError(messageFrom(mutationError));
    } finally {
      const tracked = inFlightPlanMutationsRef.current.get(planId);
      if (tracked?.promise === mutation) {
        inFlightPlanMutationsRef.current.delete(planId);
      }
    }
  }, [abortPlanMutation, clearTimer, repository]);

  const restoreDraft = useCallback(async (
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => {
    const mutationUserId = userIdRef.current;
    const mutationSessionGeneration = sessionGenerationRef.current;
    if (!mutationUserId) return;
    const snapshotPending = pendingRef.current?.plan.id === planId
      ? pendingRef.current
      : undefined;
    const snapshotFailed = failedInputsRef.current.get(planId);
    const retryInput = snapshotPending || snapshotFailed;
    clearTimer();
    const nextEpoch = (planEpochRef.current.get(planId) || 0) + 1;
    planEpochRef.current.set(planId, nextEpoch);
    await abortPlanMutation(planId);
    if (
      !mountedRef.current
      || userIdRef.current !== mutationUserId
      || sessionGenerationRef.current !== mutationSessionGeneration
    ) return;
    const controller = new AbortController();
    const mutation = repository.restoreDraft(
      planId,
      expectedRevision,
      actor,
      { signal: controller.signal }
    );
    inFlightPlanMutationsRef.current.set(planId, { controller, promise: mutation });
    try {
      const restored = await mutation;
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;
      pendingRef.current = pendingRef.current?.plan.id === planId
        ? undefined
        : pendingRef.current;
      failedInputsRef.current.delete(planId);
      setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
      confirmedPlansRef.current.set(restored.id, restored);
      setPlans((current) => replacePlan(current, restored));
      setError(undefined);
      setSaveState('idle');
    } catch (mutationError) {
      if (isAbortError(mutationError)) return;
      if (
        !mountedRef.current
        || userIdRef.current !== mutationUserId
        || sessionGenerationRef.current !== mutationSessionGeneration
      ) return;
      if (retryInput) {
        pendingRef.current = retryInput;
        failedInputsRef.current.set(planId, retryInput);
        setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
        setPlans((current) => replacePlan(current, retryInput.plan));
        setSaveState('pending_retry');
      }
      setError(messageFrom(mutationError));
    } finally {
      const tracked = inFlightPlanMutationsRef.current.get(planId);
      if (tracked?.promise === mutation) {
        inFlightPlanMutationsRef.current.delete(planId);
      }
    }
  }, [abortPlanMutation, clearTimer, repository]);

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
    plans,
    pendingRetryPlanIds,
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
