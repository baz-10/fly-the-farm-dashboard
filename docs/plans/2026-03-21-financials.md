# Financials — Job Actuals & P&L Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Financials section with job actuals tracking, comparing real costs against quoted estimates to calculate actual margins and inform future quoting.

**Architecture:** New `JobActual` type stored in localStorage (`ftf_actuals`). New pages: FinancialsList (landing), ActualCreate (form), ActualDetail (P&L view with quote comparison). New store service following the same pattern as quoteStore. Nav/routing updates to wire it all in.

**Tech Stack:** React, TypeScript, MUI v7, localStorage persistence, react-router-dom

---

### Task 1: Create JobActual type

**Files:**
- Create: `src/types/financials.ts`

**Step 1: Create the type file**

```typescript
import { KitSelection } from './quote';

// ─── Cost Line Item (for breakdowns) ────────────────────────

export interface CostLineItem {
  id: string;
  description: string;
  quantity: number;
  unitLabel: string;  // e.g. 'L', 'nights', 'hrs', 'ea'
  unitCost: number;
  total: number;
}

// ─── Actual Cost Categories ─────────────────────────────────

export interface ActualEquipmentCosts {
  kitSelections: KitSelection[];
  actualFlightHours: number;
  fuelTotal: number;
  fuelBreakdown: CostLineItem[];  // optional detail
}

export interface ActualLabourCosts {
  pilotCount: number;
  pilotHours: number;
  pilotRatePerHour: number;
  hasChemOperator: boolean;
  chemOpHours: number;
  chemOpRatePerHour: number;
  additionalLabour: CostLineItem[];  // unexpected helpers
}

export interface ActualTravelCosts {
  kilometres: number;
  vehicleCostPerKm: number;
  vehicleTotal: number;
  accommodation: number;
  accommodationBreakdown: CostLineItem[];
  meals: number;
  mealsBreakdown: CostLineItem[];
}

export interface ActualRepairCosts {
  items: CostLineItem[];  // drone repairs, vehicle issues, generator fixes, etc.
}

export interface ActualOtherCosts {
  items: CostLineItem[];  // anything else
}

// ─── Job Actual ─────────────────────────────────────────────

export type ActualStatus = 'draft' | 'finalised';

export interface JobActual {
  id: string;
  contractorUserId: string;

  // Links (all optional)
  jobId?: string;
  quoteId?: string;
  clientId?: string;
  propertyId?: string;
  fieldId?: string;

  // Header
  title: string;         // e.g. "Broadacre spray — Smith Farm"
  jobDate: string;       // ISO date
  status: ActualStatus;

  // Revenue
  revenue: number;       // what was actually invoiced
  revenueNotes: string;  // explain variance from quote

  // Costs
  equipment: ActualEquipmentCosts;
  labour: ActualLabourCosts;
  travel: ActualTravelCosts;
  repairs: ActualRepairCosts;
  otherCosts: ActualOtherCosts;
  chemicalCost: number;  // actual chemical spend

  // Calculated (stored for quick access)
  totalCost: number;
  grossProfit: number;
  grossMarginPercent: number;

  // Notes
  notes: string;
  lessonsLearned: string;  // what to do differently next time

  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Commit**

```bash
git add src/types/financials.ts
git commit -m "feat: add JobActual type for financials tracking"
```

---

### Task 2: Create financials store service

**Files:**
- Create: `src/services/financialsStore.ts`

**Step 1: Create the store**

Follow the same pattern as `quoteStore.ts` — localStorage persistence with CRUD operations:

```typescript
import { JobActual } from '../types/financials';

const ACTUALS_KEY = 'ftf_actuals';

function load(): JobActual[] {
  try {
    return JSON.parse(localStorage.getItem(ACTUALS_KEY) || '[]');
  } catch {
    return [];
  }
}

function save(actuals: JobActual[]): void {
  localStorage.setItem(ACTUALS_KEY, JSON.stringify(actuals));
}

export function getActuals(contractorUserId: string): JobActual[] {
  return load().filter((a) => a.contractorUserId === contractorUserId);
}

export function getActualById(id: string): JobActual | undefined {
  return load().find((a) => a.id === id);
}

export function getActualByJobId(jobId: string): JobActual | undefined {
  return load().find((a) => a.jobId === jobId);
}

export function getActualByQuoteId(quoteId: string): JobActual | undefined {
  return load().find((a) => a.quoteId === quoteId);
}

export function saveActual(
  data: Omit<JobActual, 'id' | 'createdAt' | 'updatedAt'>,
): JobActual {
  const all = load();
  const now = new Date().toISOString();
  const actual: JobActual = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  all.push(actual);
  save(all);
  return actual;
}

export function updateActual(
  id: string,
  updates: Partial<JobActual>,
): JobActual | undefined {
  const all = load();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  save(all);
  return all[idx];
}

export function deleteActual(id: string): void {
  save(load().filter((a) => a.id !== id));
}

// ─── Summary stats ──────────────────────────────────────────

export function getFinancialsSummary(contractorUserId: string) {
  const actuals = getActuals(contractorUserId).filter((a) => a.status === 'finalised');
  const totalRevenue = actuals.reduce((s, a) => s + a.revenue, 0);
  const totalCosts = actuals.reduce((s, a) => s + a.totalCost, 0);
  const avgMargin = actuals.length > 0
    ? actuals.reduce((s, a) => s + a.grossMarginPercent, 0) / actuals.length
    : 0;
  return {
    count: actuals.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
    totalProfit: Math.round((totalRevenue - totalCosts) * 100) / 100,
    avgMargin: Math.round(avgMargin * 10) / 10,
  };
}
```

**Step 2: Commit**

```bash
git add src/services/financialsStore.ts
git commit -m "feat: add financials store with CRUD and summary stats"
```

---

### Task 3: Create FinancialsList page

**Files:**
- Create: `src/pages/FinancialsList.tsx`

**Step 1: Build the landing page**

This page shows:
- Summary stats at top (total revenue, total costs, total profit, avg margin %)
- "New Actual" button
- Table/list of all job actuals with: title, client name, date, revenue, total cost, margin %, status chip
- Each row links to `/financials/:id`

Follow the same visual style as QuoteList.tsx — use the existing theme, Card components, alpha colours, SectionCard pattern (defined OUTSIDE the component if needed), and the green/orange/red margin colour coding from QuoteCreate.

Key imports needed:
- `getActuals, getFinancialsSummary` from `../services/financialsStore`
- `getClientById` from `../services/fieldManagementStore`
- `formatCurrency` from `../utils/quoteCalculator`
- `useAuth` from `../contexts/AuthContext`
- MUI components: Box, Typography, Button, Card, CardContent, Stack, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, alpha, useTheme

Navigation: "New Actual" button navigates to `/financials/new`.

**Step 2: Commit**

```bash
git add src/pages/FinancialsList.tsx
git commit -m "feat: add FinancialsList page with summary stats and actual listing"
```

---

### Task 4: Create ActualCreate page

**Files:**
- Create: `src/pages/ActualCreate.tsx`

**Step 1: Build the form page**

This is the main form for recording job actuals. It has these sections:

**A. Header section:**
- Link to existing job (optional Autocomplete from `getJobs()`)
- Link to existing quote (optional Autocomplete from `getQuotes()`)
- When a job is selected: auto-fill client, property, field, date, title
- When a quote is linked: auto-fill revenue from quote total, show "Quoted: $X" chip
- Manual fields: title, job date, client (Autocomplete), revenue

**B. Equipment section:**
- Kit selections: same multi-kit UI as QuoteCreate (kit dropdown + quantity, add/remove)
- Actual flight hours (number input)
- Generator fuel: lump sum input + "Add breakdown" toggle that shows line items (litres × $/L)

**C. Labour section:**
- Pilot count, hours worked, rate per hour (all editable)
- Chemical operator toggle + hours + rate
- "Add Labour" button for additional unexpected labour (description + amount line items)

**D. Travel & Accommodation section:**
- Kilometres driven + cost per km
- Accommodation: lump sum + optional breakdown (nights × $/night)
- Meals: lump sum + optional breakdown

**E. Repairs & Breakdowns section:**
- "Add Item" button to add line items
- Each: description, amount (e.g. "T100 prop replacement — $180")
- Category suggestions in placeholder: "Drone repair, vehicle issue, generator fix..."

**F. Other Costs section:**
- Same "Add Item" pattern for miscellaneous costs

**G. Notes section:**
- General notes textarea
- "Lessons learned" textarea — what to do differently

**H. Quote Comparison panel (if quote linked):**
- Show side-by-side: quoted vs actual for each category
- Highlight variances (red if over, green if under)
- Show missing categories: "Your quote included setup fees — have you recorded these?"

**I. P&L Summary (always visible, auto-calculated):**
- Revenue
- Total costs (sum all categories)
- Gross profit
- Gross margin % with colour coding (green ≥40%, orange 20-40%, red <20%)
- Save button (saves as draft or finalised)

**IMPORTANT:** Do NOT define any components inside the main component function — define helper components at module level to avoid the focus-loss bug.

**On mount:** Check sessionStorage for `ftf_actual_prefill` (set by JobDetail "Record Actuals" button — Task 6). If found, use it to pre-fill job/quote/client/revenue data. Clear it after reading.

**Save handler:** Calculate totalCost, grossProfit, grossMarginPercent before saving. Navigate to `/financials/:id` after save.

**Step 2: Commit**

```bash
git add src/pages/ActualCreate.tsx
git commit -m "feat: add ActualCreate page with full cost entry form and P&L summary"
```

---

### Task 5: Create ActualDetail page

**Files:**
- Create: `src/pages/ActualDetail.tsx`

**Step 1: Build the detail/view page**

Read-only view of a recorded job actual showing:

**Header:**
- Title, date, status chip (draft/finalised)
- Client/property/field breadcrumb
- Linked job and linked quote chips (clickable)
- Actions: Edit (navigate to ActualCreate with prefill), Delete, Change Status

**P&L Summary card (prominent at top):**
- Revenue, Total Cost, Gross Profit, Margin %
- Colour-coded margin indicator
- If quote linked: "Quoted margin: X% → Actual margin: Y%" comparison

**Cost breakdown cards (same style as JobDetail):**
- Equipment: kits used, flight hours, fuel
- Labour: pilots, chem op, additional
- Travel: km, accommodation, meals
- Repairs: line items
- Other: line items
- Each card shows the category total

**Quote variance table (if quote linked):**
- Table with columns: Category, Quoted, Actual, Variance
- Colour code variances

**Notes & Lessons:**
- Display notes and lessons learned

Follow the same card-based visual style as JobDetail.tsx.

**Step 2: Commit**

```bash
git add src/pages/ActualDetail.tsx
git commit -m "feat: add ActualDetail page with P&L view and quote comparison"
```

---

### Task 6: Add routing, nav, and home page card

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/JobDetail.tsx`

**Step 1: Add routes in App.tsx**

Add lazy imports at the top:
```typescript
import FinancialsList from './pages/FinancialsList';
import ActualCreate from './pages/ActualCreate';
import ActualDetail from './pages/ActualDetail';
```

Add routes (after the quotes routes, before admin):
```tsx
<Route path="/financials" element={<FinancialsList />} />
<Route path="/financials/new" element={<ActualCreate />} />
<Route path="/financials/:actualId" element={<ActualDetail />} />
```

**Step 2: Add nav item in Layout.tsx**

Import `AccountBalanceIcon` from `@mui/icons-material/AccountBalance`.

Add to the `navItems` array (after Quotes, before Admin):
```typescript
{ label: 'Financials', path: '/financials', icon: <AccountBalanceIcon />, roles: ['admin', 'contractor'] },
```

**Step 3: Add home page card in Home.tsx**

Import `AccountBalanceIcon` from `@mui/icons-material/AccountBalance`.

Add to the `tools` array (after Quote Builder):
```typescript
{
  title: 'Financials',
  description: 'Track actual job costs against quotes. See real margins and improve future pricing.',
  icon: <AccountBalanceIcon />,
  color: '#d4782f',
  path: '/financials',
  ready: true,
},
```

Update the Grid from `md: 3` to handle 5 cards properly — change to a layout that works (e.g. keep `sm: 6` and `md: 4` for first row, or use `md: 'auto'` with flex). Simplest: use `sm: 6, md: 4` so it wraps to 3+2 on desktop.

**Step 4: Add "Record Actuals" button on JobDetail.tsx**

Import `AccountBalanceIcon` from `@mui/icons-material/AccountBalance`.

Add an IconButton in the header actions (next to the Create Quote button):
```tsx
<IconButton
  size="small"
  onClick={() => {
    const prefill = {
      jobId: job.id,
      clientId: job.clientId,
      propertyId: job.propertyId,
      fieldId: job.fieldId,
      title: `${job.weedTarget} — ${client.name}`,
      jobDate: job.dateSprayed,
      quoteId: job.quoteId || undefined,
    };
    sessionStorage.setItem('ftf_actual_prefill', JSON.stringify(prefill));
    navigate('/financials/new');
  }}
  sx={{ color: '#d4782f' }}
  title="Record Actuals"
>
  <AccountBalanceIcon fontSize="small" />
</IconButton>
```

Also show a linked actual chip if one exists (check via `getActualByJobId`):
```tsx
// At the top of the component, add:
const existingActual = getActualByJobId(jobId || '');

// In the header, after the linked quote chip:
{existingActual && (
  <Chip
    label="View Actuals"
    size="small"
    onClick={() => navigate(`/financials/${existingActual.id}`)}
    sx={{ cursor: 'pointer', fontWeight: 700, mb: 2 }}
    color="warning"
    variant="outlined"
  />
)}
```

Import `getActualByJobId` from `../services/financialsStore`.

**Step 5: Commit**

```bash
git add src/App.tsx src/components/Layout.tsx src/pages/Home.tsx src/pages/JobDetail.tsx
git commit -m "feat: add Financials routing, nav item, home card, and JobDetail link"
```

---

### Task 7: Build and deploy

**Step 1: Build locally**

```bash
npm run build
```

Fix any TypeScript/lint errors.

**Step 2: Commit fixes and push**

```bash
git add -A
git commit -m "fix: resolve build errors from financials feature"
git push
```

Verify Vercel deployment succeeds.
