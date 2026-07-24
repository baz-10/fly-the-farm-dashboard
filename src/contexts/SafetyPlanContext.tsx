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
  userIdRef.current = user?.id;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    const sessionGeneration = ++sessionGenerationRef.current;
    operationGenerationRef.current += 1;
    clearTimer();
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
    repository.listPlans()
      .then((loaded) => {
        if (
          cancelled
          || sessionGenerationRef.current !== sessionGeneration
          || operationGenerationRef.current !== operationGeneration
        ) return;
        confirmedPlansRef.current = new Map(loaded.map((plan) => [plan.id, plan]));
        setPlans(loaded);
      })
      .catch((loadError) => {
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
    };
  }, [clearTimer, repository, user?.id, user?.role, user?.tenantId]);

  const performSave = useCallback(async (
    originalInput: SaveSafetyPlanDraftInput,
    generation: number,
    planEpoch: number,
    queuedUserId: string,
    queuedSessionGeneration: number
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
      const saved = await repository.saveDraft(input);
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
    const queued = saveQueueRef.current.then(
      () => performSave(
        input,
        generation,
        planEpoch,
        queuedUserId,
        queuedSessionGeneration
      )
    );
    saveQueueRef.current = queued.catch(() => undefined);
    return queued;
  }, [performSave]);

  const saveDraft = useCallback(async (input: SaveSafetyPlanDraftInput) => {
    if (!userIdRef.current) return;
    const previous = pendingRef.current;
    const isSwitchingBeforeDebounce = Boolean(
      previous
      && previous.plan.id !== input.plan.id
      && timerRef.current !== undefined
    );
    if (isSwitchingBeforeDebounce && previous) {
      clearTimer();
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
  }, [clearTimer, enqueueSave]);

  const retrySave = useCallback(async () => {
    if (!userIdRef.current) return;
    const retained = Array.from(failedInputsRef.current.values());
    const pending = pendingRef.current;
    if (pending && !retained.some((input) => input.plan.id === pending.plan.id)) {
      retained.push(pending);
    }
    if (retained.length === 0) return;
    failedInputsRef.current.clear();
    setPendingRetryPlanIds([]);
    setSaveState('saving');
    setError(undefined);
    for (const input of retained) {
      const generation = ++operationGenerationRef.current;
      latestPlanGenerationRef.current.set(input.plan.id, generation);
      await enqueueSave(input, generation);
    }
  }, [enqueueSave]);

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
      const remote = await repository.getPlan(pending.plan.id);
      if (
        !mountedRef.current
        || userIdRef.current !== resolvingUserId
        || sessionGenerationRef.current !== resolvingSessionGeneration
      ) return;
      if (!remote) throw new Error('The remote Safety Plan is no longer available.');

      if (choice === 'keep_remote') {
        confirmedPlansRef.current.set(remote.id, remote);
        pendingRef.current = undefined;
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
      if (
        !mountedRef.current
        || userIdRef.current !== resolvingUserId
        || sessionGenerationRef.current !== resolvingSessionGeneration
      ) return;
      setError(messageFrom(resolutionError));
      setSaveState('conflict');
    }
  }, [clearTimer, enqueueSave, repository]);

  const deleteDraft = useCallback(async (
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => {
    const mutationUserId = userIdRef.current;
    const mutationSessionGeneration = sessionGenerationRef.current;
    if (!mutationUserId) return;
    ++operationGenerationRef.current;
    const nextEpoch = (planEpochRef.current.get(planId) || 0) + 1;
    planEpochRef.current.set(planId, nextEpoch);
    if (pendingRef.current?.plan.id === planId) {
      clearTimer();
      pendingRef.current = undefined;
    }
    failedInputsRef.current.delete(planId);
    setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
    const deleted = await repository.deleteDraft(planId, expectedRevision, actor);
    if (
      !mountedRef.current
      || userIdRef.current !== mutationUserId
      || sessionGenerationRef.current !== mutationSessionGeneration
    ) return;
    confirmedPlansRef.current.delete(planId);
    setPlans((current) => current.filter((plan) => plan.id !== deleted.id));
  }, [clearTimer, repository]);

  const restoreDraft = useCallback(async (
    planId: string,
    expectedRevision: number,
    actor: SafetyPlanActor
  ) => {
    const mutationUserId = userIdRef.current;
    const mutationSessionGeneration = sessionGenerationRef.current;
    if (!mutationUserId) return;
    ++operationGenerationRef.current;
    const nextEpoch = (planEpochRef.current.get(planId) || 0) + 1;
    planEpochRef.current.set(planId, nextEpoch);
    if (pendingRef.current?.plan.id === planId) {
      clearTimer();
      pendingRef.current = undefined;
    }
    failedInputsRef.current.delete(planId);
    setPendingRetryPlanIds(Array.from(failedInputsRef.current.keys()));
    const restored = await repository.restoreDraft(planId, expectedRevision, actor);
    if (
      !mountedRef.current
      || userIdRef.current !== mutationUserId
      || sessionGenerationRef.current !== mutationSessionGeneration
    ) return;
    confirmedPlansRef.current.set(restored.id, restored);
    setPlans((current) => replacePlan(current, restored));
  }, [clearTimer, repository]);

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
