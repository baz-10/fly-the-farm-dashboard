# Job-Quote Linking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable bidirectional linking between jobs and quotes — create quotes from jobs, convert quotes to jobs, quick-add clients inline, and auto-populate hectares from field boundaries.

**Architecture:** Add `quoteId` to JobRecord and `jobIds` to Quote types. Add "Create Quote" button on JobDetail that navigates to QuoteCreate with pre-filled data via URL params + sessionStorage. Add "Convert to Job" button on QuoteDetail. Add inline quick-add client dialog to QuoteCreate. Wire field `sizeHa` (from boundary calculations) into quote hectare fields.

**Tech Stack:** React, TypeScript, MUI v7, localStorage persistence, react-router-dom

---

### Task 1: Add linking fields to types

**Files:**
- Modify: `src/types/fieldManagement.ts` (JobRecord)
- Modify: `src/types/quote.ts` (Quote)

**Step 1: Add `quoteId` to JobRecord**

In `src/types/fieldManagement.ts`, add to the JobRecord interface:

```typescript
quoteId?: string;  // Linked quote if created from/for this job
```

Add after the `notes` field (line 160).

**Step 2: Add `jobIds` to Quote**

In `src/types/quote.ts`, add to the Quote interface:

```typescript
jobIds?: string[];  // Linked job(s) created from this quote
```

Add after the `fieldIds` field (line 224).

**Step 3: Commit**

```bash
git add src/types/fieldManagement.ts src/types/quote.ts
git commit -m "feat: add quoteId/jobIds linking fields to Job and Quote types"
```

---

### Task 2: Add "Create Quote" button to JobDetail

**Files:**
- Modify: `src/pages/JobDetail.tsx`

**Step 1: Add a "Create Quote" button in the header actions area**

Import `ReceiptLongIcon` from `@mui/icons-material/ReceiptLong`.

Add a "Create Quote" button next to the delete button in the header Stack (around line 183):

```tsx
<IconButton
  size="small"
  onClick={() => {
    // Store job data in sessionStorage for QuoteCreate to pick up
    const prefill = {
      fromJobId: job.id,
      clientId: job.clientId,
      propertyId: job.propertyId,
      fieldIds: [job.fieldId],
      jobDescription: `Spray job: ${job.weedTarget} — ${job.chemicals.map(c => c.product).join(', ')}`,
      chemicals: job.chemicals,
      droneModel: job.droneModel,
    };
    sessionStorage.setItem('ftf_quote_prefill', JSON.stringify(prefill));
    navigate('/quotes/new');
  }}
  sx={{ color: '#6a4c93' }}
  title="Create Quote"
>
  <ReceiptLongIcon fontSize="small" />
</IconButton>
```

**Step 2: Show linked quote if one exists**

After the header, if `job.quoteId` exists, show a link chip:

```tsx
{job.quoteId && (
  <Chip
    label={`Linked Quote`}
    size="small"
    onClick={() => navigate(`/quotes/${job.quoteId}`)}
    sx={{ cursor: 'pointer', fontWeight: 700 }}
    color="secondary"
    variant="outlined"
  />
)}
```

**Step 3: Commit**

```bash
git add src/pages/JobDetail.tsx
git commit -m "feat: add Create Quote button to JobDetail page"
```

---

### Task 3: QuoteCreate reads prefill data from sessionStorage

**Files:**
- Modify: `src/pages/QuoteCreate.tsx`

**Step 1: On mount, check for prefill data**

Near the top of the QuoteCreate component, after existing state initialization, add:

```typescript
useEffect(() => {
  const raw = sessionStorage.getItem('ftf_quote_prefill');
  if (raw) {
    sessionStorage.removeItem('ftf_quote_prefill');
    try {
      const prefill = JSON.parse(raw);
      if (prefill.clientId) setClientId(prefill.clientId);
      if (prefill.propertyId) setPropertyId(prefill.propertyId);
      if (prefill.fieldIds) setFieldIds(prefill.fieldIds);
      if (prefill.jobDescription) setJobDescription(prefill.jobDescription);
      // Store fromJobId for linking on save
      setFromJobId(prefill.fromJobId || null);
    } catch { /* ignore bad data */ }
  }
}, []);
```

Add `fromJobId` state: `const [fromJobId, setFromJobId] = useState<string | null>(null);`

**Step 2: On save, link the quote back to the job**

In the save handler, after `saveQuote()`, if `fromJobId` exists:

```typescript
if (fromJobId) {
  updateJob(fromJobId, { quoteId: saved.id });
  updateQuote(saved.id, { jobIds: [fromJobId] });
}
```

Import `updateJob` from `fieldManagementStore`.

**Step 3: Commit**

```bash
git add src/pages/QuoteCreate.tsx
git commit -m "feat: QuoteCreate reads prefill data and links back to source job"
```

---

### Task 4: Add "Convert to Job" button on QuoteDetail

**Files:**
- Modify: `src/pages/QuoteDetail.tsx`

**Step 1: Add a "Convert to Job" button in the header actions**

Import `AssignmentIcon` from `@mui/icons-material/Assignment`.

Add button in the actions Stack (after Print, before Delete):

```tsx
{quote.status === 'accepted' && quote.fieldIds?.[0] && (
  <Button
    variant="outlined"
    startIcon={<AssignmentIcon />}
    onClick={() => {
      const prefill = {
        fromQuoteId: quote.id,
        clientId: quote.clientId,
        propertyId: quote.propertyId,
        fieldId: quote.fieldIds?.[0],
        jobDescription: quote.jobDescription,
      };
      sessionStorage.setItem('ftf_job_prefill', JSON.stringify(prefill));
      navigate(`/jobs/client/${quote.clientId}/property/${quote.propertyId}/field/${quote.fieldIds?.[0]}/new-job`);
    }}
    sx={{ borderRadius: '10px', fontWeight: 700 }}
  >
    Create Job
  </Button>
)}
```

**Step 2: Show linked jobs if any exist**

After the header, if `quote.jobIds` has entries:

```tsx
{quote.jobIds && quote.jobIds.length > 0 && (
  <Alert severity="info" sx={{ mb: 2, borderRadius: '12px' }}>
    This quote has {quote.jobIds.length} linked job(s).
  </Alert>
)}
```

**Step 3: Commit**

```bash
git add src/pages/QuoteDetail.tsx
git commit -m "feat: add Convert to Job button on QuoteDetail page"
```

---

### Task 5: JobCreate reads prefill data from QuoteDetail

**Files:**
- Modify: `src/pages/JobCreate.tsx`

**Step 1: On mount, check for job prefill data**

Near the top of JobCreate, add:

```typescript
useEffect(() => {
  const raw = sessionStorage.getItem('ftf_job_prefill');
  if (raw) {
    sessionStorage.removeItem('ftf_job_prefill');
    try {
      const prefill = JSON.parse(raw);
      if (prefill.jobDescription) setWeedTarget(prefill.jobDescription);
      setFromQuoteId(prefill.fromQuoteId || null);
    } catch { /* ignore */ }
  }
}, []);
```

Add `fromQuoteId` state: `const [fromQuoteId, setFromQuoteId] = useState<string | null>(null);`

**Step 2: On save, link the job back to the quote**

In the save handler, after `saveJob()`, if `fromQuoteId` exists:

```typescript
if (fromQuoteId) {
  updateJob(saved.id, { quoteId: fromQuoteId });
  const existingQuote = getQuoteById(fromQuoteId);
  if (existingQuote) {
    const existingJobIds = existingQuote.jobIds || [];
    updateQuote(fromQuoteId, { jobIds: [...existingJobIds, saved.id] });
  }
}
```

Import `getQuoteById`, `updateQuote` from `quoteStore` and `updateJob` from `fieldManagementStore`.

**Step 3: Commit**

```bash
git add src/pages/JobCreate.tsx
git commit -m "feat: JobCreate reads prefill from quote and links back"
```

---

### Task 6: Quick Add Client dialog in QuoteCreate

**Files:**
- Modify: `src/pages/QuoteCreate.tsx`

**Step 1: Add quick-add client dialog state**

```typescript
const [quickClientOpen, setQuickClientOpen] = useState(false);
const [quickClient, setQuickClient] = useState({ name: '', phone: '', email: '' });
```

**Step 2: Add "Add Client" button next to client select**

Next to the client dropdown, add a small button:

```tsx
<Button
  size="small"
  startIcon={<AddIcon />}
  onClick={() => setQuickClientOpen(true)}
  sx={{ ml: 1, borderRadius: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}
>
  New Client
</Button>
```

Import `AddIcon` from `@mui/icons-material/Add`.

**Step 3: Add the dialog**

```tsx
<Dialog open={quickClientOpen} onClose={() => setQuickClientOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: '16px' } }}>
  <DialogTitle sx={{ fontWeight: 700 }}>Quick Add Client</DialogTitle>
  <DialogContent>
    <Stack spacing={2} sx={{ mt: 1 }}>
      <TextField label="Name" value={quickClient.name} onChange={(e) => setQuickClient({ ...quickClient, name: e.target.value })} fullWidth required />
      <TextField label="Phone" value={quickClient.phone} onChange={(e) => setQuickClient({ ...quickClient, phone: e.target.value })} fullWidth />
      <TextField label="Email" value={quickClient.email} onChange={(e) => setQuickClient({ ...quickClient, email: e.target.value })} fullWidth />
    </Stack>
  </DialogContent>
  <DialogActions sx={{ px: 3, pb: 2.5 }}>
    <Button onClick={() => setQuickClientOpen(false)}>Cancel</Button>
    <Button
      variant="contained"
      disabled={!quickClient.name.trim()}
      onClick={() => {
        const newClient = saveClient({
          name: quickClient.name.trim(),
          phone: quickClient.phone.trim(),
          email: quickClient.email.trim(),
          notes: '',
        });
        setClientId(newClient.id);
        setQuickClientOpen(false);
        setQuickClient({ name: '', phone: '', email: '' });
        // Refresh client list
        window.location.reload(); // Simple approach; or use state refresh
      }}
      sx={{ borderRadius: '10px', fontWeight: 700 }}
    >
      Add Client
    </Button>
  </DialogActions>
</Dialog>
```

Import `saveClient` from `fieldManagementStore` and `Dialog, DialogTitle, DialogContent, DialogActions` from MUI (may already be imported).

**Step 4: Commit**

```bash
git add src/pages/QuoteCreate.tsx
git commit -m "feat: add Quick Add Client dialog to QuoteCreate"
```

---

### Task 7: Auto-populate hectares from field boundary into quote

**Files:**
- Modify: `src/pages/QuoteCreate.tsx`

**Step 1: When fields are selected, auto-calculate total hectares**

After field selection changes, compute total hectares from selected fields:

```typescript
const totalHectares = useMemo(() => {
  if (!fieldIds.length) return 0;
  return fieldIds.reduce((sum, fid) => {
    const f = getFieldById(fid);
    return sum + (f?.sizeHa || 0);
  }, 0);
}, [fieldIds]);
```

Import `getFieldById` from `fieldManagementStore`.

**Step 2: Auto-update the hectares quantity in the broadacre-spray line item**

When `totalHectares` changes and is > 0, update the relevant line item quantity:

```typescript
useEffect(() => {
  if (totalHectares > 0) {
    setHectares(totalHectares);
  }
}, [totalHectares]);
```

This hooks into the existing `hectares` state that drives the broadacre spray line item.

**Step 3: Commit**

```bash
git add src/pages/QuoteCreate.tsx
git commit -m "feat: auto-populate hectares from selected field sizes into quote"
```

---

### Task 8: Final integration test and push

**Step 1: Build locally**

```bash
npm run build
```

Fix any TypeScript/lint errors.

**Step 2: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build errors from job-quote linking feature"
```

**Step 3: Push to deploy**

```bash
git push
```

Verify on Vercel that the deployment succeeds.
