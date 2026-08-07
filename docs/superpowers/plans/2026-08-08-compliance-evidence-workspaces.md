# Compliance Evidence Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hidden inline ReOC and Operations Manual forms with two dedicated, authoritative CASA Compliance workspaces.

**Architecture:** Add one route-level page per evidence type, both using the existing `createComplianceApi()` read and command boundaries. Simplify the CASA Compliance Overview to navigate to those routes, retaining its current read projection and disclosures while removing form ownership from the overview.

**Tech Stack:** React 18, TypeScript, React Router, Material UI, Jest, React Testing Library, existing Spray Command compliance API.

## Global Constraints

- Preserve PostgreSQL persistence, immutable evidence and document versions, audit and transactional outbox behaviour.
- Preserve RLS, tenant, operating-location and existing route-role enforcement.
- Reuse internal file IDs, checksums, provenance and existing compliance commands.
- Do not introduce a database migration, browser persistence or legacy persistence.
- ReOC route: `/compliance/reoc`.
- Operations Manual route: `/compliance/operations-manual`.
- Validation and command errors remain visible without discarding entered metadata or the selected file.
- Run the complete regression suite and production build before deployment.

---

### Task 1: Route CASA Compliance actions to dedicated workspaces

**Files:**
- Modify: `src/pages/CasaComplianceOverview.tsx`
- Modify: `src/pages/__tests__/CasaComplianceOverview.test.tsx`

**Interfaces:**
- Consumes: React Router `useNavigate(): NavigateFunction`.
- Produces: overview actions that navigate to `/compliance/reoc` or `/compliance/operations-manual`.

- [ ] **Step 1: Write failing navigation tests**

Mock `useNavigate` and replace the current inline-workflow assertions with:

```tsx
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

test('opens ReOC actions in the dedicated workspace', async () => {
  render(<CasaComplianceOverview />);
  await screen.findByText('92%');
  fireEvent.click(screen.getByRole('button', { name: 'Upload ReOC' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/reoc');
  fireEvent.click(screen.getByRole('button', { name: 'Manage ReOC certificate' }));
  expect(mockNavigate).toHaveBeenLastCalledWith('/compliance/reoc');
});

test('opens Operations Manual management in its dedicated workspace', async () => {
  render(<CasaComplianceOverview />);
  await screen.findByText('92%');
  fireEvent.click(screen.getByRole('button', { name: 'Publish Operations Manual' }));
  expect(mockNavigate).toHaveBeenCalledWith('/compliance/operations-manual');
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
CI=true npm test -- --runInBand src/pages/__tests__/CasaComplianceOverview.test.tsx
```

Expected: FAIL because the buttons still open inline panels and do not call `navigate`.

- [ ] **Step 3: Implement route navigation and remove inline form ownership**

In `CasaComplianceOverview.tsx`:

```tsx
const navigate = useNavigate();
const openEvidenceWorkspace = (panel: 'reoc' | 'manual') =>
  navigate(panel === 'reoc' ? '/compliance/reoc' : '/compliance/operations-manual');
```

Use `openEvidenceWorkspace` from the primary blocker and category actions. Remove `evidencePanel`, upload-form state, save functions and the bottom inline `Collapse` forms. Keep overview loading, calendar, issue details and category details unchanged.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
CI=true npm test -- --runInBand src/pages/__tests__/CasaComplianceOverview.test.tsx
```

Expected: all CASA Compliance Overview tests pass and no evidence form is rendered on the overview.

- [ ] **Step 5: Commit the focused overview change**

```bash
git add src/pages/CasaComplianceOverview.tsx src/pages/__tests__/CasaComplianceOverview.test.tsx
git commit -m "UX: route compliance actions to dedicated workspaces"
```

---

### Task 2: Build the authoritative ReOC workspace

**Files:**
- Create: `src/pages/ReocComplianceWorkspace.tsx`
- Create: `src/pages/__tests__/ReocComplianceWorkspace.test.tsx`

**Interfaces:**
- Consumes: `createComplianceApi().overview()` and `createComplianceApi().saveInstrument(input, file)`.
- Produces: default export `ReocComplianceWorkspace`.

- [ ] **Step 1: Write failing page tests**

Mock `createComplianceApi` with stable `overview` and `saveInstrument` functions. Cover loading the current status, back navigation, preserving form state on rejection and refreshing after a successful save:

```tsx
test('shows current ReOC status and returns to CASA Compliance', async () => {
  render(<ReocComplianceWorkspace />);
  expect(await screen.findByRole('heading', { name: 'ReOC certificate' })).toBeVisible();
  expect(screen.getByText('Evidence missing')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Back to CASA Compliance' }));
  expect(mockNavigate).toHaveBeenCalledWith('/compliance');
});

test('saves ReOC evidence and reloads the authoritative record', async () => {
  render(<ReocComplianceWorkspace />);
  await screen.findByRole('heading', { name: 'ReOC certificate' });
  await userEvent.type(screen.getByLabelText('ReOC number'), 'CASA.REOC.123');
  fireEvent.change(screen.getByLabelText('Expiry date'), { target: { value: '2027-08-08' } });
  const file = new File(['certificate'], 'reoc.pdf', { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText('Choose ReOC certificate'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Save ReOC certificate' }));
  await waitFor(() => expect(mockSaveInstrument).toHaveBeenCalledWith(
    expect.objectContaining({ instrumentType: 'REOC', instrumentNumber: 'CASA.REOC.123' }), file,
  ));
  expect(mockOverview).toHaveBeenCalledTimes(2);
});
```

Add a rejection test that asserts the error text, entered ReOC number and selected filename remain visible.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
CI=true npm test -- --runInBand src/pages/__tests__/ReocComplianceWorkspace.test.tsx
```

Expected: FAIL because `ReocComplianceWorkspace` does not exist.

- [ ] **Step 3: Implement the ReOC page**

Create a page that:

```tsx
const api = React.useMemo(() => createComplianceApi(), []);
const [data, setData] = React.useState<any>(null);
const [form, setForm] = React.useState({ instrumentNumber: '', issueDate: '', expiryDate: '', holder: '', arn: '', conditions: '' });
const [file, setFile] = React.useState<File | null>(null);
```

Loads `api.overview()` on mount, displays `data.reoc` or “Evidence missing”, and submits:

```tsx
await api.saveInstrument({
  operation: 'CREATE',
  instrumentType: 'REOC',
  instrumentNumber: form.instrumentNumber,
  issueDate: form.issueDate || null,
  expiryDate: form.expiryDate,
  status: 'CURRENT',
  scope: { legalCertificateHolder: form.holder, organisationArn: form.arn },
  conditions: form.conditions.split('\n').filter(Boolean),
}, file);
```

After success, show “ReOC certificate saved.” and call `overview()` again. On failure, set a page-level error without clearing `form` or `file`. Give the hidden file input `aria-label="Choose ReOC certificate"`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
CI=true npm test -- --runInBand src/pages/__tests__/ReocComplianceWorkspace.test.tsx
```

Expected: all ReOC workspace tests pass.

- [ ] **Step 5: Commit the ReOC workspace**

```bash
git add src/pages/ReocComplianceWorkspace.tsx src/pages/__tests__/ReocComplianceWorkspace.test.tsx
git commit -m "UX: add dedicated ReOC workspace"
```

---

### Task 3: Build the authoritative Operations Manual workspace

**Files:**
- Create: `src/pages/OperationsManualWorkspace.tsx`
- Create: `src/pages/__tests__/OperationsManualWorkspace.test.tsx`

**Interfaces:**
- Consumes: `createComplianceApi().overview()` and `createComplianceApi().publishManual(input, file)`.
- Produces: default export `OperationsManualWorkspace`.

- [ ] **Step 1: Write failing page tests**

Cover missing/current status, back navigation, immutable publication payload, authoritative refresh and recoverable errors:

```tsx
test('publishes an approved Operations Manual and reloads authoritative status', async () => {
  render(<OperationsManualWorkspace />);
  expect(await screen.findByRole('heading', { name: 'Operations Manual' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-08-08' } });
  const file = new File(['manual'], 'operations-manual.pdf', { type: 'application/pdf' });
  await userEvent.upload(screen.getByLabelText('Choose Operations Manual'), file);
  await userEvent.click(screen.getByRole('button', { name: 'Publish Operations Manual' }));
  await waitFor(() => expect(mockPublishManual).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'RPAS Operations Manual', effectiveDate: '2026-08-08' }), file,
  ));
  expect(mockOverview).toHaveBeenCalledTimes(2);
});
```

Add a rejection test asserting the error, entered effective date and selected filename remain visible.

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
CI=true npm test -- --runInBand src/pages/__tests__/OperationsManualWorkspace.test.tsx
```

Expected: FAIL because `OperationsManualWorkspace` does not exist.

- [ ] **Step 3: Implement the Operations Manual page**

Use local state:

```tsx
const [form, setForm] = React.useState({ title: 'RPAS Operations Manual', effectiveDate: '', reviewDueDate: '' });
const [file, setFile] = React.useState<File | null>(null);
```

Load `api.overview()`, show `data.operationsManual` or “Not yet published”, and publish:

```tsx
await api.publishManual({
  ...form,
  documentId: data?.operationsManual?.document_id,
  expectedVersion: data?.operationsManual?.document_row_version,
}, file);
```

After success, show “Operations Manual published.” and reload `overview()`. On failure, retain the form and file and show a page-level error. Give the file input `aria-label="Choose Operations Manual"`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
CI=true npm test -- --runInBand src/pages/__tests__/OperationsManualWorkspace.test.tsx
```

Expected: all Operations Manual workspace tests pass.

- [ ] **Step 5: Commit the Operations Manual workspace**

```bash
git add src/pages/OperationsManualWorkspace.tsx src/pages/__tests__/OperationsManualWorkspace.test.tsx
git commit -m "UX: add Operations Manual workspace"
```

---

### Task 4: Register protected routes and verify the operational slice

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `ReocComplianceWorkspace` and `OperationsManualWorkspace` default exports.
- Produces: protected application routes `/compliance/reoc` and `/compliance/operations-manual` with the same roles as `/compliance`.

- [ ] **Step 1: Write failing route assertions**

Extend the App route regression to assert both paths are present behind the existing `ProtectedRoute allowedRoles={['admin', 'contractor']}` boundary. Use the project’s existing App test harness and page mocks so each route renders its unique heading.

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
CI=true npm test -- --runInBand src/App.test.tsx
```

Expected: FAIL because neither dedicated route exists.

- [ ] **Step 3: Add imports and protected routes**

In `src/App.tsx` add:

```tsx
import ReocComplianceWorkspace from './pages/ReocComplianceWorkspace';
import OperationsManualWorkspace from './pages/OperationsManualWorkspace';
```

Register:

```tsx
<Route path="/compliance/reoc" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><ReocComplianceWorkspace /></ProtectedRoute>} />
<Route path="/compliance/operations-manual" element={<ProtectedRoute allowedRoles={['admin', 'contractor']}><OperationsManualWorkspace /></ProtectedRoute>} />
```

- [ ] **Step 4: Run focused route and workspace tests**

Run:

```bash
CI=true npm test -- --runInBand src/App.test.tsx src/pages/__tests__/CasaComplianceOverview.test.tsx src/pages/__tests__/ReocComplianceWorkspace.test.tsx src/pages/__tests__/OperationsManualWorkspace.test.tsx
```

Expected: all dedicated-route and workspace tests pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
CI=true npm test -- --runInBand
npm run build
git diff --check
```

Expected: all test suites pass, production build exits 0, and `git diff --check` reports no errors. Existing unrelated lint and bundle-size warnings may remain.

- [ ] **Step 6: Commit integration**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "UX: register compliance evidence workspaces"
```

- [ ] **Step 7: Release through the established Production Beta path**

Confirm the branch is `codex/production-beta`, the push remote is `BJT-FTF/Spray-Command`, and `.vercel/project.json` names `spray-command-production-beta`. Run the existing secret and environment-file checks, push without force, deploy production, verify READY, then smoke-check `/`, `/login`, `/compliance/reoc` and `/compliance/operations-manual` without exposing credentials.
