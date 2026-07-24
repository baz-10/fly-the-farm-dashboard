import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, vi } from 'vitest';

import type { User } from '../contexts/AuthContext';
import { makeSafetyPlan, makeSafetyPlanVersion } from '../test/safetyPlanFixtures';
import type { SafetyPlan, SafetyPlanSourceSnapshot } from '../types/safetyPlan';
import type { SaveSafetyPlanDraftInput } from '../services/safetyPlanRepository';
import SafetyPlanEditor from './SafetyPlanEditor';

const useSafetyPlans = vi.fn();
const useAuth = vi.fn();

vi.mock('../contexts/SafetyPlanContext', () => ({
  useSafetyPlans: () => useSafetyPlans(),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuth(),
}));

const admin: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  tenantId: 'tenant-1',
  tier: 'pro',
  safetyPlanAuthority: false,
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

function incompletePlan(overrides: Partial<SafetyPlan> = {}) {
  const version = makeSafetyPlanVersion({
    sections: makeSafetyPlanVersion().sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => ({ ...field, value: undefined })),
    })),
  });
  return makeSafetyPlan({ versions: [version], ...overrides });
}

function renderEditor(
  plan = incompletePlan(),
  options: {
    latestSourceSnapshot?: SafetyPlanSourceSnapshot;
    saveState?: string;
    error?: string;
    acceptServerPlan?: ReturnType<typeof vi.fn>;
  } = {}
) {
  const saveDraft = vi.fn(async (_input: SaveSafetyPlanDraftInput) => undefined);
  const retrySave = vi.fn(async () => undefined);
  useAuth.mockReturnValue({ user: admin });
  useSafetyPlans.mockReturnValue({
    plans: [plan],
    saveState: options.saveState ?? 'idle',
    error: options.error,
    lastSavedAt: undefined,
    pendingRetryPlanIds: [],
    saveDraft,
    retrySave,
    resolveConflict: vi.fn(),
    acceptServerPlan: options.acceptServerPlan ?? vi.fn(),
  });
  const result = render(
    <MemoryRouter initialEntries={[`/compliance/safety-plans/${plan.id}`]}>
      <SafetyPlanEditor
        planId={plan.id}
        latestSourceSnapshot={options.latestSourceSnapshot}
      />
    </MemoryRouter>
  );
  return { ...result, saveDraft, retrySave };
}

describe('SafetyPlanEditor', () => {
  it('moves through five short steps and keeps readiness visible', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByRole('heading', { name: /job details/i })).toBeVisible();
    expect(screen.getByTestId('safety-plan-readiness')).toBeVisible();

    await user.click(screen.getByRole('button', { name: /next: people and assets/i }));
    expect(screen.getByRole('heading', { name: /people and assets/i })).toBeVisible();
    expect(screen.getByRole('button', { name: /next: hazards and controls/i })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /review & submit/i }));
    expect(screen.getByRole('heading', { name: 'Supporting evidence' })).toBeVisible();
  });

  it('restores the last visited step from the draft field rather than browser storage', () => {
    localStorage.setItem('safety-plan-step', '4');
    const plan = incompletePlan();
    const version = plan.versions[0];
    version.sections[0].fields.push({
      id: 'editor_last_step',
      label: 'Editor last step',
      helpText: '',
      type: 'text',
      required: false,
      companyEditable: true,
      value: '2',
    });

    renderEditor(plan);

    expect(screen.getByRole('heading', { name: /hazards and controls/i })).toBeVisible();
  });

  it('autosaves field edits and keeps the operator text visible', async () => {
    vi.useFakeTimers();
    const { saveDraft } = renderEditor();

    fireEvent.change(screen.getByLabelText(/^scope/i), {
      target: { value: 'Keep gate closed' },
    });
    expect(screen.getByDisplayValue('Keep gate closed')).toBeVisible();
    expect(screen.getByText(/saving/i)).toBeVisible();
    await vi.runAllTimersAsync();

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({
        versions: [expect.objectContaining({
          sections: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({ id: 'plan_scope', value: 'Keep gate closed' }),
              ]),
            }),
          ]),
        })],
      }),
      expectedRevision: 1,
      actor: expect.objectContaining({ userId: admin.id }),
    }));
  });

  it('shows failed autosave as retryable without losing entered text', async () => {
    const user = userEvent.setup();
    const { retrySave } = renderEditor(incompletePlan(), {
      saveState: 'pending_retry',
      error: 'offline',
    });

    await user.type(screen.getByLabelText(/^scope/i), 'Keep gate closed');

    expect(screen.getByText(/save pending/i)).toBeVisible();
    expect(screen.getByDisplayValue('Keep gate closed')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /retry save/i }));
    expect(retrySave).toHaveBeenCalled();
  });

  it.each([
    ['saving', /wait for draft changes to finish saving/i, false],
    ['pending_retry', /draft save failed/i, true],
  ])('blocks evidence deletion while same-plan save state is %s', async (
    saveState,
    message,
    retryable,
  ) => {
    const user = userEvent.setup();
    const version = makeSafetyPlanVersion({
      attachments: [{
        id: 'attachment-1',
        tenantId: 'tenant-1',
        versionId: 'safety-plan-version-1',
        fileName: 'evidence.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12,
        contentDigest: 'digest',
        source: 'upload',
        uploadedBy: {
          userId: admin.id,
          name: admin.name,
          role: 'admin',
          operationalAuthority: true,
        },
        uploadedAt: '2026-07-24T00:00:00.000Z',
      }],
    });
    const plan = makeSafetyPlan({ versions: [version] });
    const { retrySave } = renderEditor(plan, { saveState });
    await user.click(screen.getByRole('button', { name: /review & submit/i }));

    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole('button', { name: /delete evidence.pdf/i })).toBeDisabled();
    if (retryable) {
      await user.click(screen.getByRole('button', { name: /retry draft save/i }));
      expect(retrySave).toHaveBeenCalled();
    }
  });

  it('keeps an edit made during deferred evidence deletion when server-plan acceptance rejects', async () => {
    const user = userEvent.setup();
    let resolveDelete!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      resolveDelete = resolve;
    })));
    const acceptServerPlan = vi.fn(async () => {
      throw new Error('Draft changes appeared while evidence was being deleted.');
    });
    const version = makeSafetyPlanVersion({
      attachments: [{
        id: 'attachment-1',
        tenantId: 'tenant-1',
        versionId: 'safety-plan-version-1',
        fileName: 'evidence.pdf',
        contentType: 'application/pdf',
        sizeBytes: 12,
        contentDigest: 'digest',
        source: 'upload',
        uploadedBy: {
          userId: admin.id,
          name: admin.name,
          role: 'admin',
          operationalAuthority: true,
        },
        uploadedAt: '2026-07-24T00:00:00.000Z',
      }],
    });
    const plan = makeSafetyPlan({ versions: [version] });
    renderEditor(plan, { acceptServerPlan });
    await user.click(screen.getByRole('button', { name: /review & submit/i }));
    await user.click(screen.getByRole('button', { name: /delete evidence.pdf/i }));
    fireEvent.change(screen.getByLabelText(/submission and review/i), {
      target: { value: 'Keep this local edit' },
    });
    expect(screen.getByDisplayValue('Keep this local edit')).toBeVisible();

    const serverPlan = makeSafetyPlan({
      ...plan,
      revision: 2,
      versions: [{ ...version, revision: 2, attachments: [] }],
    });
    resolveDelete(new Response(JSON.stringify({ plan: serverPlan }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    expect(await screen.findByText(/draft changes appeared while evidence was being deleted/i))
      .toBeVisible();
    expect(screen.getByDisplayValue('Keep this local edit')).toBeVisible();
    expect(acceptServerPlan).toHaveBeenCalledWith(serverPlan);
  });

  it('shows source changes and requires every conflict decision before applying them', async () => {
    const user = userEvent.setup();
    const plan = incompletePlan();
    plan.versions[0].sourceSnapshot = {
      ...plan.versions[0].sourceSnapshot,
      crew: [{ id: 'spotter-1', name: 'Company spotter remains', role: 'Spotter' }],
    };
    const latest: SafetyPlanSourceSnapshot = {
      ...plan.versions[0].sourceSnapshot,
      capturedAt: '2026-07-25T00:00:00.000Z',
      crew: [{ id: 'spotter-2', name: 'Replacement spotter', role: 'Spotter' }],
    };
    const { saveDraft } = renderEditor(plan, { latestSourceSnapshot: latest });

    await user.click(screen.getByRole('button', { name: /review source changes/i }));
    expect(screen.getAllByText(/company spotter remains/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /apply refresh/i })).toBeDisabled();

    for (const option of screen.getAllByLabelText(/keep current (?:assigned )?crew/i)) {
      await user.click(option);
    }
    expect(screen.getByRole('button', { name: /apply refresh/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /apply refresh/i }));

    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    const input = saveDraft.mock.calls.at(-1)?.[0];
    if (!input) throw new Error('Expected the refreshed plan to be saved');
    expect(input.plan.versions[0].sourceRefreshIntent).toMatchObject({
      kind: 'source_refresh',
    });
    expect(input.plan.versions[0].sourceRefreshIntent).not.toHaveProperty('actor');
    expect(input.plan.versions[0].sourceRefreshIntent).not.toHaveProperty('occurredAt');
  });

  it('supports keyboard step navigation with labelled current state', async () => {
    renderEditor();
    const navigation = screen.getByRole('navigation', { name: /safety plan steps/i });
    const first = within(navigation).getByRole('button', { name: /job details/i });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });

    expect(screen.getByRole('heading', { name: /people and assets/i })).toBeVisible();
    expect(within(navigation).getByRole('button', { name: /people & assets/i }))
      .toHaveAttribute('aria-current', 'step');
  });

  it('uses a 375px-safe responsive shell without fixed minimum widths', () => {
    renderEditor();
    const shell = screen.getByTestId('safety-plan-editor-shell');

    expect(shell).toHaveStyle({ maxWidth: '100%' });
    expect(shell).toHaveStyle({ overflowX: 'clip' });
    expect(screen.getByTestId('safety-plan-readiness')).not.toHaveStyle({ minWidth: '300px' });
    expect(screen.getByTestId('safety-plan-stepper')).toHaveStyle({ flexDirection: 'column' });
  });

  it('hydrates a direct URL when the requested plan arrives without overwriting a local edit', async () => {
    const user = userEvent.setup();
    useAuth.mockReturnValue({ user: admin });
    const context = {
      plans: [] as SafetyPlan[],
      saveState: 'idle',
      lastSavedAt: undefined,
      error: undefined,
      pendingRetryPlanIds: [],
      saveDraft: vi.fn(async (_input: SaveSafetyPlanDraftInput) => undefined),
      retrySave: vi.fn(),
      resolveConflict: vi.fn(),
    };
    useSafetyPlans.mockImplementation(() => context);
    const view = render(
      <MemoryRouter initialEntries={['/compliance/safety-plans/safety-plan-1']}>
        <SafetyPlanEditor planId="safety-plan-1" />
      </MemoryRouter>
    );
    expect(screen.getByText(/could not be found/i)).toBeVisible();

    context.plans = [incompletePlan()];
    view.rerender(
      <MemoryRouter initialEntries={['/compliance/safety-plans/safety-plan-1']}>
        <SafetyPlanEditor planId="safety-plan-1" />
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: /job details/i })).toBeVisible();

    await user.type(screen.getByLabelText(/^scope/i), 'Local gate control');
    context.plans = [incompletePlan({ revision: 2 })];
    view.rerender(
      <MemoryRouter initialEntries={['/compliance/safety-plans/safety-plan-1']}>
        <SafetyPlanEditor planId="safety-plan-1" />
      </MemoryRouter>
    );
    expect(screen.getByDisplayValue('Local gate control')).toBeVisible();
  });

  it('offers both safe conflict recovery actions', async () => {
    const plan = incompletePlan();
    const resolveConflict = vi.fn();
    useAuth.mockReturnValue({ user: admin });
    useSafetyPlans.mockReturnValue({
      plans: [plan],
      saveState: 'conflict',
      error: 'Changed elsewhere',
      lastSavedAt: undefined,
      pendingRetryPlanIds: [],
      saveDraft: vi.fn(),
      retrySave: vi.fn(),
      resolveConflict,
    });
    render(
      <MemoryRouter>
        <SafetyPlanEditor planId={plan.id} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /use remote version/i }));
    fireEvent.click(screen.getByRole('button', { name: /create revision/i }));

    await waitFor(() => {
      expect(resolveConflict).toHaveBeenNthCalledWith(1, 'keep_remote');
      expect(resolveConflict).toHaveBeenNthCalledWith(2, 'create_revision');
    });
  });

  it('shows source mission, JSA question, risk score, mitigation and company control', async () => {
    const user = userEvent.setup();
    const plan = incompletePlan();
    plan.versions[0].sourceSnapshot = {
      ...plan.versions[0].sourceSnapshot,
      missions: [{ id: 'mission-1', name: 'North paddock spray' }],
      hazards: [{
        id: 'risk_assessment:mission-1:q-signage',
        sourceType: 'risk_assessment',
        sourceId: 'mission-1',
        sourceRecordId: 'jsa-1',
        sourceItemId: 'q-signage',
        sourceUpdatedAt: '2026-07-24T01:00:00.000Z',
        label: 'Will there be a need for signage?',
        value: 'Risk score 8 · Establish exclusion area',
        companyValue: 'Place signs at both gates',
      }],
    };
    renderEditor(plan);

    await user.click(screen.getByRole('button', { name: /hazards & controls/i }));

    expect(screen.getByText('North paddock spray')).toBeVisible();
    expect(screen.getByText('Will there be a need for signage?')).toBeVisible();
    expect(screen.getByText(/risk score 8/i)).toBeVisible();
    expect(screen.getByText(/establish exclusion area/i)).toBeVisible();
    expect(screen.getByDisplayValue('Place signs at both gates')).toBeVisible();
  });
});
