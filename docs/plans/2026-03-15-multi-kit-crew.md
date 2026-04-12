# Multi-Kit & Crew Configuration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Support multiple drone kits per quote/job with per-drone vs per-job cost splitting, and configurable crew (pilots + optional chemical operator) for accurate margin analysis.

**Architecture:** Add new types for kit selections and crew config. Update `calculateJobCosts` to accept multiple kits with quantity and a crew config, splitting costs into per-drone (scales) and per-job (fixed) buckets. Update QuoteCreate UI to allow adding multiple kits and configuring crew. Add default chem operator rate to QuoteConfig.

**Tech Stack:** React, TypeScript, MUI v7, localStorage persistence

---

### Task 1: Add types for multi-kit selection and crew config

**Files:**
- Modify: `src/types/quote.ts`

**Step 1: Add KitSelection and CrewConfig interfaces**

Add after the Kit interface (after line 108):

```typescript
// ─── Multi-Kit & Crew ─────────────────────────────────────────

export interface KitSelection {
  kitId: string;
  quantity: number;
}

export interface CrewConfig {
  pilotCount: number;
  pilotRatePerHour: number;       // overridable per quote
  hasChemOperator: boolean;
  chemOperatorRatePerHour: number; // overridable per quote
}
```

**Step 2: Update Quote interface**

Replace single `kitId` with multi-kit and crew fields. In the Quote interface (around line 246):

Replace:
```typescript
  kitId?: string;
```

With:
```typescript
  kitId?: string;               // legacy single kit
  kitSelections?: KitSelection[];
  crew?: CrewConfig;
```

**Step 3: Add default chem operator rate to QuoteConfig**

In the QuoteConfig interface, after `defaultComplexitySurchargePerHour` (around line 180), add:

```typescript
  defaultChemOperatorRatePerHour: number;
```

**Step 4: Commit**

```bash
git add src/types/quote.ts
git commit -m "feat: add KitSelection, CrewConfig types and multi-kit fields to Quote"
```

---

### Task 2: Update quoteCalculator to support multi-kit costing

**Files:**
- Modify: `src/utils/quoteCalculator.ts`

**Step 1: Add a new function `calculateMultiKitJobCosts`**

Add after the existing `calculateJobCosts` function. This new function:
- Takes `kits: (Kit & { quantity: number })[]`, crew config, and job params
- Splits costs into per-drone (scales with quantity) and per-job (fixed, taken from first kit)
- Calculates labour from crew config instead of single pilot rate

```typescript
/**
 * Calculate job costs with multiple kits and crew configuration.
 *
 * Per-drone costs (scale with quantity):
 *   drone depreciation, battery depreciation, charger depreciation,
 *   consumables (props/nozzles/filters), hull insurance
 *
 * Per-job costs (fixed, from primary kit):
 *   generator fuel & depreciation, vehicle, public liability,
 *   professional indemnity, licensing, software, PPE, overhead, maintenance
 */
export function calculateMultiKitJobCosts(
  kits: { kit: Kit; quantity: number }[],
  crew: { pilotCount: number; pilotRate: number; hasChemOp: boolean; chemOpRate: number },
  estimatedFlightHours: number,
  setupAndTravelHours: number,
  travelKm: number,
  operatorChemicalCost: number,
  revenue: number,
): JobCostBreakdown {
  if (kits.length === 0) {
    // Return zero breakdown
    return {
      droneDepreciationPerHour: 0, batteryDepreciationPerHour: 0,
      chargerDepreciationPerHour: 0, generatorDepreciationPerHour: 0,
      consumablesPerHour: 0, generatorFuelPerHour: 0, totalEquipmentCostPerHour: 0,
      insurancePerHour: 0, licensingPerJob: 0, softwarePerJob: 0,
      ppeSafetyPerJob: 0, maintenancePerHour: 0, overheadPercent: 0,
      estimatedFlightHours, estimatedTotalHours: estimatedFlightHours + setupAndTravelHours,
      travelKm, equipmentCost: 0, labourCost: 0, vehicleCost: 0,
      insuranceCost: 0, fixedCostAllocation: 0, chemicalCostToOperator: operatorChemicalCost,
      totalCost: operatorChemicalCost,
    };
  }

  const primaryKit = kits[0].kit;
  const primaryHrs = primaryKit.estimatedFlightHoursPerYear || 500;
  const primaryJobs = primaryKit.estimatedJobsPerYear || 150;
  const primaryRev = primaryKit.estimatedRevenuePerYear || 200000;
  const totalHours = estimatedFlightHours + setupAndTravelHours;

  // ── Per-drone costs (summed across all kits × quantities) ──
  let totalDroneDepPerHour = 0;
  let totalBatteryDepPerHour = 0;
  let totalChargerDepPerHour = 0;
  let totalConsumablesPerHour = 0;
  let totalHullInsurancePerHour = 0;
  let totalWorkersCompPerHour = 0;

  for (const { kit, quantity } of kits) {
    const hrs = kit.estimatedFlightHoursPerYear || 500;

    const droneDepPerHour = kit.dronePurchasePrice / (kit.droneLifespanYears * hrs);
    const totalBatteryHours = kit.batteryCount * kit.batteryCycleLife * kit.flightMinutesPerCharge / 60;
    const totalBatteryCost = kit.batteryCount * kit.batteryPriceEach;
    const batteryDepPerHour = totalBatteryHours > 0 ? totalBatteryCost / totalBatteryHours : 0;
    const chargerDepPerHour = kit.chargerPrice / (kit.chargerLifespanYears * hrs);
    const consumables = kit.propsCostPerHour + kit.nozzlesCostPerHour +
      kit.filtersCostPerHour + kit.pumpServiceCostPerHour + kit.otherConsumablesPerHour;
    const hullPerHour = kit.hullInsuranceAnnual / hrs;

    totalDroneDepPerHour += droneDepPerHour * quantity;
    totalBatteryDepPerHour += batteryDepPerHour * quantity;
    totalChargerDepPerHour += chargerDepPerHour * quantity;
    totalConsumablesPerHour += consumables * quantity;
    totalHullInsurancePerHour += hullPerHour * quantity;
  }

  // Workers comp scales per crew member
  const crewCount = crew.pilotCount + (crew.hasChemOp ? 1 : 0);
  totalWorkersCompPerHour = (primaryKit.workersCompAnnual / primaryHrs) * crewCount;

  // ── Per-job costs (fixed, from primary kit) ──
  const genDepPerHour = primaryKit.generatorPrice / (primaryKit.generatorLifespanYears * primaryHrs);
  const fuelPerHour = primaryKit.generatorFuelCostPerHour;
  const publicLiabilityPerHour = primaryKit.publicLiabilityAnnual / primaryHrs;
  const profIndemnityPerHour = primaryKit.professionalIndemnityAnnual / primaryHrs;
  const maintenancePerHour = primaryKit.maintenanceBudgetAnnual / primaryHrs;
  const licensingPerJob = primaryKit.licensingCostsAnnual / primaryJobs;
  const softwarePerJob = primaryKit.softwareCostsAnnual / primaryJobs;
  const ppeSafetyPerJob = primaryKit.ppeSafetyAnnual / primaryJobs;
  const overheadPercent = primaryRev > 0 ? (primaryKit.overheadAnnual / primaryRev) * 100 : 0;

  // ── Totals ──
  const perDroneEquipPerHour = totalDroneDepPerHour + totalBatteryDepPerHour +
    totalChargerDepPerHour + totalConsumablesPerHour;
  const perJobEquipPerHour = genDepPerHour + fuelPerHour;
  const totalEquipmentPerHour = perDroneEquipPerHour + perJobEquipPerHour;

  const equipmentCost = r2(totalEquipmentPerHour * estimatedFlightHours);

  // Insurance (per-drone: hull; per-job: public liability, prof indemnity; per-crew: workers comp)
  const insurancePerHour = totalHullInsurancePerHour + publicLiabilityPerHour +
    profIndemnityPerHour + totalWorkersCompPerHour;
  const insuranceCost = r2(insurancePerHour * estimatedFlightHours);

  // Labour: pilots + optional chem operator
  const pilotLabour = crew.pilotCount * crew.pilotRate * totalHours;
  const chemOpLabour = crew.hasChemOp ? crew.chemOpRate * totalHours : 0;
  const labourCost = r2(pilotLabour + chemOpLabour);

  const vehicleCost = r2(primaryKit.vehicleCostPerKm * travelKm);

  const fixedCosts = r2(
    licensingPerJob + softwarePerJob + ppeSafetyPerJob +
    maintenancePerHour * estimatedFlightHours
  );
  const overheadAmount = r2(revenue * (overheadPercent / 100));

  const totalCost = r2(
    equipmentCost + labourCost + vehicleCost + insuranceCost +
    fixedCosts + overheadAmount + operatorChemicalCost
  );

  return {
    droneDepreciationPerHour: r2(totalDroneDepPerHour),
    batteryDepreciationPerHour: r2(totalBatteryDepPerHour),
    chargerDepreciationPerHour: r2(totalChargerDepPerHour),
    generatorDepreciationPerHour: r2(genDepPerHour),
    consumablesPerHour: r2(totalConsumablesPerHour),
    generatorFuelPerHour: r2(fuelPerHour),
    totalEquipmentCostPerHour: r2(totalEquipmentPerHour),
    insurancePerHour: r2(insurancePerHour),
    licensingPerJob: r2(licensingPerJob),
    softwarePerJob: r2(softwarePerJob),
    ppeSafetyPerJob: r2(ppeSafetyPerJob),
    maintenancePerHour: r2(maintenancePerHour),
    overheadPercent: r2(overheadPercent),
    estimatedFlightHours,
    estimatedTotalHours: totalHours,
    travelKm,
    equipmentCost,
    labourCost,
    vehicleCost,
    insuranceCost,
    fixedCostAllocation: r2(fixedCosts + overheadAmount),
    chemicalCostToOperator: operatorChemicalCost,
    totalCost,
  };
}
```

**Step 2: Commit**

```bash
git add src/utils/quoteCalculator.ts
git commit -m "feat: add calculateMultiKitJobCosts with per-drone/per-job cost splitting"
```

---

### Task 3: Add default chem operator rate to QuoteConfig defaults

**Files:**
- Modify: `src/services/quoteStore.ts`
- Modify: `src/pages/QuoteSettings.tsx`

**Step 1: Update the default QuoteConfig in quoteStore.ts**

Find where the default QuoteConfig is created (the fallback/seed values). Add `defaultChemOperatorRatePerHour: 45` alongside the other default rates.

**Step 2: Add a chem operator rate field in QuoteSettings.tsx**

In the "Rates & Fees" section of QuoteSettings, add a TextField for the default chem operator hourly rate, following the same pattern as the existing rate fields (like `defaultHourlyRate`).

**Step 3: Commit**

```bash
git add src/services/quoteStore.ts src/pages/QuoteSettings.tsx
git commit -m "feat: add default chem operator rate to QuoteConfig and settings UI"
```

---

### Task 4: Update QuoteCreate — multi-kit selection UI

**Files:**
- Modify: `src/pages/QuoteCreate.tsx`

**Step 1: Replace single kit select with multi-kit selection**

Replace the current single kit select state:
```typescript
const [selectedKitId, setSelectedKitId] = useState<string | null>(defaultKit?.id || null);
```

With multi-kit state:
```typescript
const [kitSelections, setKitSelections] = useState<{ kitId: string; quantity: number }[]>(
  defaultKit ? [{ kitId: defaultKit.id, quantity: 1 }] : []
);
```

**Step 2: Build the multi-kit UI**

Replace the single kit dropdown in the Cost & Margin section with:

- A list of selected kits, each showing: kit name, drone model, quantity spinner (1-5), remove button
- An "Add Kit" button that opens a dropdown to select another kit
- Display total drone count (sum of all quantities)

Example UI structure:
```tsx
{kitSelections.map((sel, idx) => {
  const kit = allKits.find(k => k.id === sel.kitId);
  if (!kit) return null;
  return (
    <Stack key={idx} direction="row" alignItems="center" spacing={2}>
      <Typography variant="body2" fontWeight={700} sx={{ flex: 1 }}>
        {kit.name} ({kit.droneModel})
      </Typography>
      <TextField
        label="Qty"
        type="number"
        size="small"
        value={sel.quantity}
        onChange={(e) => {
          const updated = [...kitSelections];
          updated[idx] = { ...sel, quantity: Math.max(1, parseInt(e.target.value) || 1) };
          setKitSelections(updated);
        }}
        sx={{ width: 80 }}
        inputProps={{ min: 1, max: 10 }}
      />
      <IconButton size="small" onClick={() => {
        setKitSelections(kitSelections.filter((_, i) => i !== idx));
      }}>
        <DeleteIcon fontSize="small" />
      </IconButton>
    </Stack>
  );
})}
<Button
  size="small"
  startIcon={<AddIcon />}
  onClick={() => {
    // Add first available kit not already selected, or allow duplicates
    if (allKits.length > 0) {
      setKitSelections([...kitSelections, { kitId: allKits[0].id, quantity: 1 }]);
    }
  }}
>
  Add Kit
</Button>
```

**Step 3: Commit**

```bash
git add src/pages/QuoteCreate.tsx
git commit -m "feat: replace single kit select with multi-kit selection UI"
```

---

### Task 5: Update QuoteCreate — crew configuration UI

**Files:**
- Modify: `src/pages/QuoteCreate.tsx`

**Step 1: Add crew state**

```typescript
const totalDroneCount = kitSelections.reduce((sum, s) => sum + s.quantity, 0);
const [pilotCountStr, setPilotCountStr] = useState('1');
const pilotCount = parseInt(pilotCountStr) || 1;
const [pilotRateStr, setPilotRateStr] = useState(String(defaultKit?.pilotCostPerHour || 60));
const pilotRate = parseFloat(pilotRateStr) || 0;
const [hasChemOp, setHasChemOp] = useState(false);
const [chemOpRateStr, setChemOpRateStr] = useState(String(config.defaultChemOperatorRatePerHour || 45));
const chemOpRate = parseFloat(chemOpRateStr) || 0;
```

**Step 2: Add crew configuration UI in the Cost & Margin section**

After the kit selection, add:

```tsx
<Divider sx={{ my: 1.5 }} />
<Typography variant="body2" fontWeight={700} sx={{ mb: 1 }}>Crew</Typography>
<Stack direction="row" spacing={2} alignItems="center">
  <TextField
    label="Pilots"
    type="number"
    size="small"
    value={pilotCountStr}
    onChange={(e) => setPilotCountStr(e.target.value)}
    sx={{ width: 80 }}
    inputProps={{ min: 1, max: 10 }}
    helperText={totalDroneCount > 1 && pilotCount < totalDroneCount ? 'Swarming' : ''}
  />
  <TextField
    label="Pilot $/hr"
    type="number"
    size="small"
    value={pilotRateStr}
    onChange={(e) => setPilotRateStr(e.target.value)}
    sx={{ width: 120 }}
  />
  <FormControlLabel
    control={<Switch checked={hasChemOp} onChange={(e) => setHasChemOp(e.target.checked)} />}
    label="Chem Operator"
  />
  {hasChemOp && (
    <TextField
      label="Chem Op $/hr"
      type="number"
      size="small"
      value={chemOpRateStr}
      onChange={(e) => setChemOpRateStr(e.target.value)}
      sx={{ width: 120 }}
    />
  )}
</Stack>
```

**Step 3: Commit**

```bash
git add src/pages/QuoteCreate.tsx
git commit -m "feat: add crew configuration UI (pilots + chem operator)"
```

---

### Task 6: Wire multi-kit + crew into cost/margin calculation

**Files:**
- Modify: `src/pages/QuoteCreate.tsx`

**Step 1: Update the costBreakdown useMemo**

Replace the existing `costBreakdown` useMemo that calls `calculateJobCosts(selectedKit, ...)` with one that calls `calculateMultiKitJobCosts`:

```typescript
const resolvedKits = useMemo(() => {
  return kitSelections
    .map(sel => {
      const kit = allKits.find(k => k.id === sel.kitId);
      return kit ? { kit, quantity: sel.quantity } : null;
    })
    .filter(Boolean) as { kit: Kit; quantity: number }[];
}, [kitSelections, allKits]);

const costBreakdown = useMemo(() => {
  if (resolvedKits.length === 0 || estFlightHours <= 0) return null;
  return calculateMultiKitJobCosts(
    resolvedKits,
    { pilotCount, pilotRate, hasChemOp, chemOpRate },
    estFlightHours,
    setupTravelHours,
    travelKm,
    operatorChemCost,
    totals.subtotalAfterMarkup,
  );
}, [resolvedKits, pilotCount, pilotRate, hasChemOp, chemOpRate,
    estFlightHours, setupTravelHours, travelKm, operatorChemCost, totals.subtotalAfterMarkup]);
```

Import `calculateMultiKitJobCosts` from `../utils/quoteCalculator`.

**Step 2: Update the save handler**

In `handleSave`, save the new fields:
```typescript
kitSelections: kitSelections,
crew: {
  pilotCount,
  pilotRatePerHour: pilotRate,
  hasChemOperator: hasChemOp,
  chemOperatorRatePerHour: chemOpRate,
},
```

Also keep `kitId: kitSelections[0]?.kitId || undefined` for backwards compatibility.

**Step 3: Update the auto flight hours helper text**

The current helper uses `selectedKit.hectaresPerFlightHour`. Update to use the primary kit from `resolvedKits`:

```typescript
const primaryKit = resolvedKits[0]?.kit;
```

Then replace `selectedKit.hectaresPerFlightHour` with `primaryKit?.hectaresPerFlightHour` and `selectedKit` guard checks with `primaryKit`.

**Step 4: Update the condition for showing flight hours / cost section**

Replace `selectedKit &&` guards with `resolvedKits.length > 0 &&`.

**Step 5: Update the cost breakdown display table**

In the margin display, update the "Labour" row to show crew breakdown:
```
Labour: 2 pilots × $60/hr + Chem Op × $45/hr (X total hrs)
```

**Step 6: Commit**

```bash
git add src/pages/QuoteCreate.tsx
git commit -m "feat: wire multi-kit and crew config into cost/margin calculation"
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
git commit -m "fix: resolve build errors from multi-kit feature"
git push
```

Verify Vercel deployment succeeds.
