# Weather Centre Correctness and Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a genuinely rolling local 24-hour forecast with explainable inversion potential and an unclipped, engaging operational chart.

**Architecture:** A server utility validates provider timezone metadata and selects hourly buckets relative to an injected retrieval instant. A separate inversion-proxy function returns Low/Medium/High/Unknown plus bounded factors. The Weather Centre consumes one shared rolling series for both chart and cards and renders an explicit dual-axis visual hierarchy.

**Tech Stack:** Node.js, Open-Meteo API, React, TypeScript, MUI, Recharts, Jest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-08-weather-field-beta-corrections-design.md`

## Global Constraints

- Forecast inversion potential is advisory and never operational authorisation.
- Missing required inputs return Unknown rather than Low.
- The chart and written cards consume the same rolling series.
- No Production mutation, migration, deployment, alias change, or genuine record mutation.

---

### Task 1: Provider-time authority

**Files:**
- Modify: `server/weather-provider.js`
- Test: `src/__tests__/weatherProvider.test.js`

**Interfaces:**
- Produces: `selectRollingProviderHours({ times, timezone, utcOffsetSeconds, now, count })` behavior embedded or exported for tests; forecast metadata includes `timezone`, `utcOffsetSeconds`, `retrievedAt` and rolling hourly values.

- [ ] Write failing tests for Brisbane 20:22 selecting 21:00, an offset mismatch, a stale response and the historical 11:00 regression.
- [ ] Run the provider suite and confirm the historical case begins at the wrong provider hour.
- [ ] Implement explicit provider-offset validation and instant-to-provider-local bucket selection using an injected `now` dependency.
- [ ] Require aligned provider arrays and reject stale/inconsistent data into the existing unavailable path.
- [ ] Run the provider suite and confirm all timing cases pass.

### Task 2: Explainable inversion proxy

**Files:**
- Modify: `server/spray-weather.js`
- Test: `src/__tests__/operationsBriefWeather.test.js`
- Test: `src/__tests__/weatherProvider.test.js`

**Interfaces:**
- Produces: `{ rating: 'low'|'moderate'|'high'|'unknown', score: 0|1|2|null, label, message, factors: string[] }`.

- [ ] Write failing deterministic fixtures for Low, Medium, High and missing-input Unknown.
- [ ] Run focused tests and confirm Unknown currently collapses to Low.
- [ ] Implement validated inputs, bounded scoring, factor explanations and permanent onsite-check wording.
- [ ] Pass the result through current and hourly provider records without claiming vertical-profile evidence.
- [ ] Run focused weather suites and confirm all states pass.

### Task 3: Shared rolling view and visual hierarchy

**Files:**
- Modify: `src/utils/weatherOutlook.ts`
- Modify: `src/pages/WeatherCentre.tsx`
- Test: `src/utils/__tests__/weatherOutlook.test.ts`
- Test: `src/pages/WeatherCentre.test.tsx`

**Interfaces:**
- Consumes: server-provided rolling hourly series and timezone/freshness metadata.
- Produces: shared two-hour points and hourly cards, explicit axes/legend, risk colours, day/night cues and condition icons.

- [ ] Write failing tests that require an explicit wind-axis label, inversion-axis label, legend, Now marker, Unknown state and identical start time for chart/cards.
- [ ] Run the focused client tests and confirm the current clipped/ambiguous presentation fails them.
- [ ] Remove the negative chart margin, reserve axis widths, add labels/legend, segmented risk colours, day/night cues and restrained weather icons.
- [ ] Rename every user-facing result to `Forecast inversion potential` and expose factor detail without replacing existing written cards.
- [ ] Run the focused client suites and confirm all tests pass.

### Task 4: Cross-browser and shared release gates

**Files:**
- Modify: `e2e/weather/weather-centre.spec.ts`
- Modify if required: `playwright.weather.config.ts`

**Interfaces:**
- Produces: Chromium/WebKit evidence for rolling time, readable axes, risk states and responsive cards.

- [ ] Add browser assertions for a 20:22 clock, 21:00 first bucket, axis visibility, legend, day/night cues and High/Medium/Low/Unknown presentation.
- [ ] Run Chromium and WebKit weather projects.
- [ ] Run focused Field and Weather suites together.
- [ ] Run `TZ=Australia/Brisbane npm run test:ci:sharded`.
- [ ] Run `npm run verify:product-maturity` and `npm run build`.
- [ ] Run `git diff --check`, review the complete diff, and commit the independently verified Weather Centre correction.
