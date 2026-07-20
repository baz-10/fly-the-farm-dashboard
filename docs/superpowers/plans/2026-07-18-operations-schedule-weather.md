# Operations, Schedule, and Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an aligned Operations dashboard, a seven-day mission calendar, and reusable global weather with Delta T and inversion-potential decision support.

**Architecture:** Extract pure schedule and spray-weather domain utilities, place Open-Meteo behind an expanded provider service, and persist per-user location preferences separately from mission data. Schedule and Weather become authenticated route pages; Operations consumes the same utilities and provider state through focused hooks/components.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, React Router 7, date-fns 4, Recharts 3, Open-Meteo, Jest, Testing Library.

## Global Constraints

- Existing missions remain the only source of calendar bookings.
- Weather, Schedule, vehicles, work packs, and optional annotations never become mission-authorisation requirements.
- Delta T is dry-bulb temperature minus derived wet-bulb temperature, not temperature minus dew point.
- Forecast inversion output is potential only and never clears an operator to spray.
- Product-label and on-site requirements take priority over all forecast indicators.
- All primary Operations panels use one locked desktop height and content scrolls internally.

---

### Task 1: Schedule domain utilities

**Files:**
- Create: `src/utils/missionSchedule.ts`
- Create: `src/utils/__tests__/missionSchedule.test.ts`

**Interfaces:**
- Produces: `getOperationalWeek(anchor: Date): Date[]`, `groupMissionsByLocalDate(missions: MissionRecord[], dates: Date[]): MissionDayGroup[]`, `getCalendarRange(view: 'day' | 'week' | 'month', anchor: Date): { start: Date; end: Date }`.

- [ ] **Step 1: Write failing tests** for today-plus-six-days grouping, local date boundaries, sorting by `scheduledDate`, exclusion outside range, and day/week/month ranges.
- [ ] **Step 2: Run** `CI=true npm test -- --watchAll=false src/utils/__tests__/missionSchedule.test.ts` and confirm missing exports fail.
- [ ] **Step 3: Implement** pure date helpers with `startOfDay`, `startOfWeek`, `startOfMonth`, `endOfMonth`, `addDays`, and `isWithinInterval`; return groups shaped as `{ dateKey, date, missions }`.
- [ ] **Step 4: Re-run the focused test** and confirm PASS.
- [ ] **Step 5: Commit** `test + utility` as `feat: add mission schedule grouping`.

### Task 2: Correct spray-weather calculations and provider model

**Files:**
- Modify: `src/services/weatherService.ts`
- Create: `src/utils/sprayWeather.ts`
- Create: `src/utils/__tests__/sprayWeather.test.ts`
- Modify: `src/utils/__tests__/missionWeather.test.ts`

**Interfaces:**
- Produces: `calculateWetBulbC(tempC: number, humidityPercent: number): number`, `calculateDeltaT(...)`, `classifyDeltaT(deltaT: number): 'preferred' | 'marginal' | 'unsuitable'`, `assessInversionPotential(input: InversionInput): InversionAssessment`.
- Expands `HourlyWeatherPoint` with `precipitationProbability`, `cloudCoverPercent`, `isDay`, and correctly calculated `deltaT`.

- [ ] **Step 1: Write failing tests** for wet-bulb/Delta-T fixtures, bands at 2/8/10, invalid humidity clamping, daytime windy low potential, calm clear overnight high potential, moderate incomplete data, and cautious copy that always requires on-site verification.
- [ ] **Step 2: Run** `CI=true npm test -- --watchAll=false src/utils/__tests__/sprayWeather.test.ts src/utils/__tests__/missionWeather.test.ts` and confirm red tests.
- [ ] **Step 3: Implement** the documented Stull wet-bulb approximation and deterministic inversion scoring using sunrise/sunset proximity, wind below 11 km/h, cloud, humidity/fog proxy, and temperature trend; return rating, reasons, and operator message.
- [ ] **Step 4: Update Open-Meteo requests** to include precipitation probability, cloud cover, `is_day`, sunrise, and sunset; remove the old dew-point Delta-T approximation.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: add spray weather calculations`.

### Task 3: Weather location preferences and cache

**Files:**
- Create: `src/types/weather.ts`
- Create: `src/services/weatherPreferenceStore.ts`
- Create: `src/hooks/useOperationalWeather.ts`
- Create: `src/services/__tests__/weatherPreferenceStore.test.ts`
- Create: `src/hooks/__tests__/useOperationalWeather.test.tsx`

**Interfaces:**
- Produces: `WeatherLocation`, `OperationalForecast`, `WeatherLoadState`, `readWeatherPreferences(userId)`, `saveWeatherPreferences(userId, preferences)`, and hook actions `searchLocation`, `useDeviceLocation`, `refresh`.

- [ ] **Step 1: Write failing tests** proving user-scoped last/recent locations, coordinate-rounded cache keys, fresh-cache reuse, manual refresh bypass, stale-result retention on provider failure, denied geolocation fallback, and location-not-found state.
- [ ] **Step 2: Run focused tests** and confirm failures.
- [ ] **Step 3: Implement** best-effort browser preference/cache persistence with a maximum of five recent locations and typed loading/fresh/stale/unavailable/permission-denied states.
- [ ] **Step 4: Implement the hook** so geolocation is only requested from `useDeviceLocation`, never silently on render.
- [ ] **Step 5: Re-run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: add operational weather state`.

### Task 4: Schedule page and navigation

**Files:**
- Create: `src/pages/Schedule.tsx`
- Create: `src/pages/Schedule.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 1 range/group utilities and `useMission()` records.
- Produces: authenticated `/schedule` route with Day/Week/Month controls.

- [ ] **Step 1: Write failing page and route tests** for default Week view, Day/Month switching, previous/today/next navigation, booking details, unscheduled exclusion, booking-to-mission navigation, New Mission navigation, and visible Schedule menu item for admin/contractor.
- [ ] **Step 2: Run** `CI=true npm test -- --watchAll=false src/pages/Schedule.test.tsx src/App.test.tsx` and confirm failures.
- [ ] **Step 3: Implement** a responsive calendar using MUI grids and buttons, existing status colours, locale date headings, and horizontally scrollable week columns on narrow screens.
- [ ] **Step 4: Add route and menu item** with `CalendarMonthIcon` next to Missions.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: add mission schedule calendar`.

### Task 5: Full Weather page

**Files:**
- Create: `src/pages/Weather.tsx`
- Create: `src/pages/Weather.test.tsx`
- Create: `src/components/weather/LocationSearch.tsx`
- Create: `src/components/weather/SprayConditionBadge.tsx`
- Create: `src/components/weather/HourlyWeatherChart.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Layout.tsx`

**Interfaces:**
- Consumes: Task 2 calculations and Task 3 hook.
- Produces: authenticated `/weather` route and Weather navigation item.

- [ ] **Step 1: Write failing tests** for location search, device-location action, current data, hourly and seven-day sections, Delta-T badge, inversion wording, source/time, stale warning, and provider failure without app crash.
- [ ] **Step 2: Run focused test** and confirm failures.
- [ ] **Step 3: Implement** the page with current conditions, Recharts hourly plot, seven-day cards, recent locations, accessible textual equivalents, and explicit APVMA/label/on-site warning copy.
- [ ] **Step 4: Add route and Weather menu item** with `CloudQueueIcon` adjacent to Schedule.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: add spray weather workspace`.

### Task 6: Operations dashboard redesign

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/Home.test.tsx`
- Modify: `src/utils/operationsDashboard.ts`
- Modify: `src/utils/__tests__/operationsDashboard.test.ts`
- Create: `src/components/weather/OperationalWeatherCard.tsx`

**Interfaces:**
- Consumes: Tasks 1–3 and shared weather components from Task 5.
- Produces: fixed-height panel contract and `Today and upcoming` plus live-location Weather card.

- [ ] **Step 1: Write failing tests** for `/schedule` navigation, today-plus-six-days bookings, date grouping, empty-state copy, weather location/search/refresh actions, Delta T/inversion display, stale fallback, and a shared desktop panel height style.
- [ ] **Step 2: Run focused Home and operations tests** and confirm failures.
- [ ] **Step 3: Refactor `Panel`** to `height: { xs: 'auto', lg: 300 }`, flex column CardContent, and an internally scrolling body region; apply it to every primary panel.
- [ ] **Step 4: Replace current schedule and mission-weather content** with the Task 1 groups and `OperationalWeatherCard`; route both schedule actions to `/schedule` and weather action to `/weather`.
- [ ] **Step 5: Run focused tests** and confirm PASS.
- [ ] **Step 6: Commit** as `feat: upgrade operations schedule and weather`.

### Task 7: Stage 1 verification

**Files:**
- Modify only if verification exposes a defect.

- [ ] **Step 1: Run** `CI=true npm test -- --watchAll=false` and require all suites PASS.
- [ ] **Step 2: Run** `npm run build` and require exit 0.
- [ ] **Step 3: Run** `git diff --check` and require no whitespace errors.
- [ ] **Step 4: Browser-test** Operations card alignment and scrolling, Schedule Day/Week/Month, Weather search/device fallback, and narrow layout.
- [ ] **Step 5: Commit any verified corrections** with a focused message; otherwise record no additional commit.
