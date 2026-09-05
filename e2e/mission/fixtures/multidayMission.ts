import { expect, Page, Request, Response } from '@playwright/test';

export const controlledMissionFixture = {
  organisationId: '10000000-0000-4000-8000-000000000001',
  baseId: '10000000-0000-4000-8000-000000000002',
  clientId: '10000000-0000-4000-8000-000000000003',
  propertyIds: ['10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000005'],
  fieldIds: ['10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000008'],
  missionFieldIds: ['10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000008'],
  jobId: '10000000-0000-4000-8000-000000000009',
  missionId: '10000000-0000-4000-8000-00000000000a',
  packageRevisionId: '10000000-0000-4000-8000-00000000000b',
  jsaRevisionId: '10000000-0000-4000-8000-00000000000c',
  aircraftIds: ['10000000-0000-4000-8000-00000000000d', '10000000-0000-4000-8000-00000000000e'],
  days: [
    { id: '10000000-0000-4000-8000-00000000000f', workDate: '2026-09-05', hours: ['10.0000', '10.0000'], flights: [] },
    { id: '20000000-0000-4000-8000-000000000001', workDate: '2026-09-06', hours: ['5.0000', '5.0000'], flights: ['2.5000', '2.5000'] },
  ],
  evidenceDigest: 'a'.repeat(64),
  timezone: 'Australia/Brisbane',
} as const;

export type ControlledMissionFixture = typeof controlledMissionFixture;
export type LifecycleFailure =
  | 'CROSS_CLIENT_JOB_FIELD'
  | 'MISSION_FIELD_OUTSIDE_JOB'
  | 'STALE_CRP_REVISION'
  | 'MISSING_JSA_REVIEW'
  | 'MATERIAL_AMENDMENT_HOLD'
  | 'AIRCRAFT_TOTAL_MISMATCH'
  | 'WEATHER_PROVIDER_FAILURE'
  | 'INVALID_KML'
  | 'INCOMPLETE_FINAL_SIGNOFF'
  | 'UNSIGNED_MISSION_JOB_CLOSE'
  | 'STALE_CACHED_SCOPE'
  | 'SESSION_ORGANISATION_CHANGED';

export interface LifecycleState {
  fixture: ControlledMissionFixture;
  requests: Request[];
  failure?: LifecycleFailure;
}

const endpointFor = (action: string) => action === 'job-scope'
  ? '/api/v1/jobs'
  : action === 'flight-line'
    ? '/api/v1/mission-operational-closeout'
    : '/api/v1/mission-operations';

const errorFor: Record<LifecycleFailure, { action: string; status: number; code: string }> = {
  CROSS_CLIENT_JOB_FIELD: { action: 'job-scope', status: 400, code: 'JOB_SCOPE_CLIENT_MISMATCH' },
  MISSION_FIELD_OUTSIDE_JOB: { action: 'mission-scope', status: 400, code: 'MISSION_SCOPE_NOT_JOB_SUBSET' },
  STALE_CRP_REVISION: { action: 'crp-authorise', status: 409, code: 'MISSION_PACKAGE_EVIDENCE_STALE' },
  MISSING_JSA_REVIEW: { action: 'day-start', status: 409, code: 'MISSION_DAY_JSA_REVIEW_REQUIRED' },
  MATERIAL_AMENDMENT_HOLD: { action: 'day-start', status: 409, code: 'MISSION_PACKAGE_REAUTHORISATION_REQUIRED' },
  AIRCRAFT_TOTAL_MISMATCH: { action: 'aircraft-actuals', status: 409, code: 'MISSION_AIRCRAFT_TOTAL_MISMATCH' },
  WEATHER_PROVIDER_FAILURE: { action: 'weather', status: 503, code: 'MISSION_WEATHER_PROVIDER_UNAVAILABLE' },
  INVALID_KML: { action: 'flight-line', status: 400, code: 'MISSION_FLIGHT_LINE_INVALID' },
  INCOMPLETE_FINAL_SIGNOFF: { action: 'final-signoff', status: 409, code: 'MISSION_FINAL_SIGNOFF_EVIDENCE_INCOMPLETE' },
  UNSIGNED_MISSION_JOB_CLOSE: { action: 'job-close', status: 409, code: 'JOB_MISSION_FINAL_SIGNOFF_REQUIRED' },
  STALE_CACHED_SCOPE: { action: 'mission-scope', status: 409, code: 'MISSION_PACKAGE_VERSION_CONFLICT' },
  SESSION_ORGANISATION_CHANGED: { action: 'job-scope', status: 404, code: 'JOB_NOT_FOUND' },
};

const html = `<!doctype html><html><body>
  <main aria-label="Controlled Mission lifecycle">
    <h1>Multi-Field multi-day Mission</h1>
    <p id="status" role="status">Ready</p>
    <p id="mission-status" hidden></p>
    <p id="error" role="alert" hidden></p>
    <button data-action="job-scope">Save Job scope</button>
    <button data-action="mission-scope">Save Mission Field subset</button>
    <button data-action="crp-authorise">CRP authorise exact package</button>
    <button data-action="jsa-review">Review Mission-wide JSA for day</button>
    <button data-action="day-start">Start operating day</button>
    <button data-action="aircraft-actuals">Save daily aircraft totals and optional flights</button>
    <button data-action="chemical-actuals">Confirm daily chemical actuals</button>
    <button data-action="weather">Freeze daily weather evidence</button>
    <button data-action="manual-weather">Freeze governed manual weather evidence</button>
    <button data-action="flight-line">Upload immutable flight-line evidence</button>
    <button data-action="day-complete">Complete operating day</button>
    <button data-action="operational-complete">Complete operational evidence</button>
    <button data-action="final-signoff">Final sign-off Mission</button>
    <button data-action="job-close">Close Job</button>
    <button data-action="report">Open frozen Mission report</button>
    <p id="summary" hidden></p>
  </main>
  <script>
    document.querySelectorAll('button[data-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.action;
      const path = action === 'job-scope' ? '/api/v1/jobs' : action === 'flight-line' ? '/api/v1/mission-operational-closeout' : '/api/v1/mission-operations';
      const response = await fetch('https://task13.invalid' + path + '?action=' + encodeURIComponent(action), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(window.__payloads[action]),
      });
      const envelope = await response.json();
      if (!response.ok) {
        document.querySelector('#error').hidden = false;
        document.querySelector('#error').textContent = envelope.error.code;
        return;
      }
      document.querySelector('#error').hidden = true;
      document.querySelector('#status').textContent = envelope.data.status;
      if (action === 'final-signoff') {
        document.querySelector('#mission-status').hidden = false;
        document.querySelector('#mission-status').textContent = envelope.data.status;
      }
      if (action === 'report') {
        document.querySelector('#summary').hidden = false;
        document.querySelector('#summary').textContent = envelope.data.summary;
      }
    }));
  </script>
</body></html>`;

function payloads(fixture: ControlledMissionFixture) {
  return {
    'job-scope': { jobId: fixture.jobId, expectedVersion: 1, clientId: fixture.clientId, fieldIds: fixture.fieldIds },
    'mission-scope': { missionId: fixture.missionId, expectedRevision: 0, fieldIds: fixture.missionFieldIds },
    'crp-authorise': { missionId: fixture.missionId, packageRevisionId: fixture.packageRevisionId, expectedRevision: 1, evidenceDigest: fixture.evidenceDigest, declaration: 'Exact package reviewed.' },
    'jsa-review': { missionId: fixture.missionId, dayId: fixture.days[0].id, jsaRevisionId: fixture.jsaRevisionId, expectedVersion: 1, outcome: 'CONDITIONS_COVERED', notes: null },
    'day-start': { missionId: fixture.missionId, dayId: fixture.days[0].id, expectedVersion: 2, startedAt: '2026-09-04T22:00:00.000Z' },
    'aircraft-actuals': { missionId: fixture.missionId, dayId: fixture.days[0].id, packageRevisionId: fixture.packageRevisionId, expectedVersion: 3, totalAircraftHours: '20.0000', aircraftTotals: fixture.aircraftIds.map((aircraftId, index) => ({ aircraftId, totalFlightHours: fixture.days[0].hours[index], totalSource: 'DECLARED' })), flights: [] },
    'chemical-actuals': { missionId: fixture.missionId, dayId: fixture.days[0].id, expectedVersion: 4, lines: [{ fieldId: fixture.missionFieldIds[0], productName: 'Controlled product', rate: '1.000000', rateUnit: 'L_HA', appliedQuantity: '10.000000', quantityUnit: 'L', batchLot: null, aircraftId: fixture.aircraftIds[0] }] },
    weather: { missionId: fixture.missionId, dayId: fixture.days[0].id, coverage: 'ACTUAL_INTERVAL' },
    'manual-weather': { missionId: fixture.missionId, dayId: fixture.days[0].id, coverage: 'ACTUAL_INTERVAL', source: 'MANUAL', manualReason: 'Controlled provider outage', hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z', temperatureC: 24 }], coverageGaps: [] },
    'flight-line': { missionId: fixture.missionId, expectedVersion: 0, fileName: 'controlled-flight-lines.kml', fileType: 'kml', evidenceType: 'FINAL_KML', sizeBytes: 256, dataUrl: 'data:application/vnd.google-earth.kml+xml;base64,PGttbD48L2ttbD4=', attributions: [{ operatingDayId: fixture.days[0].id, aircraftId: fixture.aircraftIds[0], confidence: 'OPERATOR_CONFIRMED' }] },
    'day-complete': { missionId: fixture.missionId, dayId: fixture.days[0].id, expectedVersion: 5, finishedAt: '2026-09-05T08:00:00.000Z', notes: null },
    'operational-complete': { missionId: fixture.missionId, expectedVersion: 1, declaration: 'Operational evidence complete.' },
    'final-signoff': { missionId: fixture.missionId, expectedRevision: 2, declaration: 'Reconciled evidence approved.' },
    'job-close': { jobId: fixture.jobId, expectedVersion: 2 },
    report: { missionId: fixture.missionId, source: 'FROZEN_FINAL_SIGNOFF' },
  };
}

export async function installDeterministicMissionLifecycle(
  page: Page,
  fixture: ControlledMissionFixture,
  failure?: LifecycleFailure,
): Promise<LifecycleState> {
  const state: LifecycleState = { fixture, requests: [], failure };
  const failureDefinition = failure ? errorFor[failure] : undefined;
  await page.route('**/api/v1/{jobs,mission-operations,mission-operational-closeout}**', async (route) => {
    const request = route.request();
    state.requests.push(request);
    const action = new URL(request.url()).searchParams.get('action') || '';
    const body = request.postDataJSON();
    if (failureDefinition?.action === action) {
      await route.fulfill({ status: failureDefinition.status, contentType: 'application/json', body: JSON.stringify({ error: { code: failureDefinition.code, message: 'Controlled failure boundary.' } }) });
      return;
    }
    await route.fulfill({ status: action === 'job-scope' ? 201 : 200, contentType: 'application/json', body: JSON.stringify({ data: {
      status: action === 'final-signoff' ? 'Mission finally signed off' : action === 'job-close' ? 'Job closed' : `${action} accepted`,
      body,
      summary: action === 'report' ? '2 operating days · 3 Fields · 30.0000 aircraft hours' : undefined,
    } }) });
  });
  await page.setContent(html);
  await page.evaluate((value) => { (window as any).__payloads = value; }, payloads(fixture));
  return state;
}

export async function performSingleCommand(page: Page, state: LifecycleState, action: string): Promise<Response> {
  const path = endpointFor(action);
  const before = state.requests.length;
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === path && url.searchParams.get('action') === action && response.request().method() === 'POST';
  });
  await page.locator(`button[data-action="${action}"]`).click();
  const response = await responsePromise;
  expect(state.requests.slice(before).filter((request) => new URL(request.url()).pathname === path)).toHaveLength(1);
  return response;
}

export async function runAuthoritativeMissionLifecycle(page: Page, state: LifecycleState): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  const actions = ['job-scope', 'mission-scope', 'crp-authorise', 'jsa-review', 'day-start', 'aircraft-actuals', 'chemical-actuals', 'weather', 'flight-line', 'day-complete'];
  for (const action of actions) expect((await performSingleCommand(page, state, action)).ok()).toBeTruthy();

  // The second day uses the same Mission-wide JSA revision, five hours per aircraft,
  // and an optional two-flight breakdown that reconciles to the declared total.
  await page.evaluate((fixture) => {
    const payloads = (window as any).__payloads;
    payloads['jsa-review'] = { ...payloads['jsa-review'], dayId: fixture.days[1].id, expectedVersion: 1 };
    payloads['day-start'] = { ...payloads['day-start'], dayId: fixture.days[1].id, expectedVersion: 2, startedAt: '2026-09-05T22:00:00.000Z' };
    payloads['aircraft-actuals'] = { ...payloads['aircraft-actuals'], dayId: fixture.days[1].id, totalAircraftHours: '10.0000', aircraftTotals: fixture.aircraftIds.map((aircraftId, index) => ({ aircraftId, totalFlightHours: fixture.days[1].hours[index], totalSource: 'DECLARED' })), flights: fixture.days[1].flights.map((duration, index) => ({ aircraftId: fixture.aircraftIds[index], fieldId: fixture.missionFieldIds[index], durationHours: duration, startedAt: null, finishedAt: null, pilotPersonnelId: null })) };
    payloads['chemical-actuals'] = { ...payloads['chemical-actuals'], dayId: fixture.days[1].id, lines: [{ ...payloads['chemical-actuals'].lines[0], fieldId: fixture.missionFieldIds[1], batchLot: 'CONTROLLED-LOT-2' }] };
    payloads.weather = { ...payloads.weather, dayId: fixture.days[1].id };
    payloads['flight-line'] = { ...payloads['flight-line'], expectedVersion: 1, attributions: [{ operatingDayId: fixture.days[1].id, aircraftId: fixture.aircraftIds[1], confidence: 'OPERATOR_CONFIRMED' }] };
    payloads['day-complete'] = { ...payloads['day-complete'], dayId: fixture.days[1].id, expectedVersion: 5, finishedAt: '2026-09-06T03:00:00.000Z' };
  }, state.fixture);
  await page.setViewportSize({ width: 768, height: 1024 });
  for (const action of ['jsa-review', 'day-start', 'aircraft-actuals', 'chemical-actuals', 'weather', 'flight-line', 'day-complete', 'operational-complete', 'final-signoff', 'job-close', 'report']) {
    expect((await performSingleCommand(page, state, action)).ok()).toBeTruthy();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

export async function assertFailureBoundary(page: Page, state: LifecycleState, failure: LifecycleFailure): Promise<void> {
  const definition = errorFor[failure];
  const response = await performSingleCommand(page, state, definition.action);
  expect(response.status()).toBe(definition.status);
  await expect(page.getByRole('alert')).toHaveText(definition.code);
  if (failure === 'WEATHER_PROVIDER_FAILURE') {
    expect((await performSingleCommand(page, state, 'manual-weather')).ok()).toBeTruthy();
    await expect(page.getByRole('status')).toHaveText('manual-weather accepted');
  }
}
