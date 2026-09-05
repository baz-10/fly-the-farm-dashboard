import { expect, test } from '@playwright/test';
import {
  controlledMissionFixture,
  assertFailureBoundary,
  installDeterministicMissionLifecycle,
  runAuthoritativeMissionLifecycle,
  type LifecycleFailure,
} from './fixtures/multidayMission';

test.describe('controlled multi-Field multi-day Mission lifecycle', () => {
  test('one Job spans Properties and one authorised Mission spans days', async ({ page }) => {
    const state = await installDeterministicMissionLifecycle(page, controlledMissionFixture);
    await runAuthoritativeMissionLifecycle(page, state);

    await expect(page.getByText('Mission finally signed off')).toBeVisible();
    await expect(page.getByText('2 operating days · 3 Fields · 30.0000 aircraft hours')).toBeVisible();
    const bodies = state.requests.map((request) => request.postDataJSON());
    expect(bodies.find((body) => body.jobId === controlledMissionFixture.jobId)?.fieldIds).toEqual(controlledMissionFixture.fieldIds);
    expect(bodies.find((body) => body.missionId === controlledMissionFixture.missionId && body.fieldIds)?.fieldIds).toEqual(controlledMissionFixture.missionFieldIds);
    expect(bodies.filter((body) => body.jsaRevisionId).map((body) => body.jsaRevisionId))
      .toEqual([controlledMissionFixture.jsaRevisionId, controlledMissionFixture.jsaRevisionId]);
    expect(bodies.filter((body) => body.totalAircraftHours).map((body) => body.totalAircraftHours)).toEqual(['20.0000', '10.0000']);
    expect(bodies.filter((body) => body.coverage).map((body) => body.dayId)).toEqual(controlledMissionFixture.days.map((day) => day.id));
    expect(bodies.filter((body) => body.dataUrl)).toHaveLength(2);
  });

  const boundedFailures: LifecycleFailure[] = [
    'CROSS_CLIENT_JOB_FIELD',
    'MISSION_FIELD_OUTSIDE_JOB',
    'STALE_CRP_REVISION',
    'MISSING_JSA_REVIEW',
    'MATERIAL_AMENDMENT_HOLD',
    'AIRCRAFT_TOTAL_MISMATCH',
    'WEATHER_PROVIDER_FAILURE',
    'INVALID_KML',
    'INCOMPLETE_FINAL_SIGNOFF',
    'UNSIGNED_MISSION_JOB_CLOSE',
    'STALE_CACHED_SCOPE',
    'SESSION_ORGANISATION_CHANGED',
  ];

  for (const failure of boundedFailures) {
    test(`${failure} fails closed at one authoritative command`, async ({ page }) => {
      const state = await installDeterministicMissionLifecycle(page, controlledMissionFixture, failure);
      await assertFailureBoundary(page, state, failure);
    });
  }
});
