import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionDayWeatherReport from '../MissionDayWeatherReport';
import type { MissionDayWeatherReportRecord, MissionOperatingDay } from '../../../types/missionOperations';

const day: MissionOperatingDay = {
  id: '11111111-1111-4111-8111-111111111111',
  missionId: '22222222-2222-4222-8222-222222222222',
  workDate: '2026-09-05',
  timezone: 'Australia/Brisbane',
  packageRevisionId: '33333333-3333-4333-8333-333333333333',
  jsaRevisionId: '44444444-4444-4444-8444-444444444444',
  state: 'COMPLETED',
  actualStartedAt: '2026-09-04T21:30:00.000Z',
  actualFinishedAt: '2026-09-05T03:15:00.000Z',
  notes: null,
  rowVersion: 4,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-05T03:15:00.000Z',
  jsaReview: null,
  fieldActivities: [],
};

const frozen: MissionDayWeatherReportRecord = {
  id: '55555555-5555-4555-8555-555555555555',
  missionId: day.missionId,
  operatingDayId: day.id,
  packageRevisionId: day.packageRevisionId,
  coverage: 'ACTUAL_INTERVAL',
  intervalStartAt: day.actualStartedAt!,
  intervalEndAt: day.actualFinishedAt!,
  timezone: day.timezone,
  source: 'OPEN_METEO',
  sourceWeatherObservationId: '66666666-6666-4666-8666-666666666666',
  latitude: '-27.500000',
  longitude: '153.100000',
  providerIdentifier: 'OPEN_METEO_ARCHIVE_V1',
  providerRetrievedAt: '2026-09-06T00:00:00.000Z',
  hourlyObservations: [{ observedAt: '2026-09-04T22:00:00.000Z', temperatureC: 24, relativeHumidity: 60,
    dewPointC: 16, windSpeedKmh: 10, windDirectionDegrees: 90, precipitationMm: 0 }],
  inversionInputs: { available: false },
  inversionResults: { assessment: 'UNABLE_TO_DETERMINE' },
  coverageGaps: [],
  sourceMetadata: {},
  manualReason: null,
  sourceDigest: 'b'.repeat(64),
  recordedByInternalUserId: '77777777-7777-4777-8777-777777777777',
  createdAt: '2026-09-06T00:00:00.000Z',
};

test('freezes weather for the exact work interval', async () => {
  const user = userEvent.setup();
  const api = { captureWeather: jest.fn().mockResolvedValue(frozen), saveManualWeather: jest.fn() };
  render(<MissionDayWeatherReport day={day} report={null} api={api} />);
  await user.click(screen.getByRole('button', { name: 'Capture weather for operating hours' }));
  await waitFor(() => expect(api.captureWeather).toHaveBeenCalledWith(day.id, { coverage: 'ACTUAL_INTERVAL' }));
});

test('offers explicit full-day capture when authoritative operating timestamps are unavailable', async () => {
  const user = userEvent.setup();
  const api = { captureWeather: jest.fn().mockResolvedValue({ ...frozen, coverage: 'FULL_DAY' }), saveManualWeather: jest.fn() };
  render(<MissionDayWeatherReport day={{ ...day, state: 'DRAFT', actualStartedAt: null, actualFinishedAt: null }} report={null} api={api} />);
  expect(screen.queryByRole('button', { name: 'Capture weather for operating hours' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Capture full Base-local day' }));
  await waitFor(() => expect(api.captureWeather).toHaveBeenCalledWith(day.id, { coverage: 'FULL_DAY' }));
});

test('shows frozen provenance and never refreshes a historical report', () => {
  const api = { captureWeather: jest.fn(), saveManualWeather: jest.fn() };
  render(<MissionDayWeatherReport day={day} report={frozen} api={api} />);
  expect(screen.getByText('Frozen weather evidence')).toBeVisible();
  expect(screen.getByText(/Open-Meteo archive/)).toBeVisible();
  expect(screen.getByText(/Australia\/Brisbane/)).toBeVisible();
  expect(screen.getByText(frozen.sourceDigest)).toBeVisible();
  expect(screen.queryByRole('button', { name: /Capture weather/ })).not.toBeInTheDocument();
  expect(api.captureWeather).not.toHaveBeenCalled();
});

test('submits explicit manual evidence against the same authoritative interval', async () => {
  const user = userEvent.setup();
  const api = { captureWeather: jest.fn(), saveManualWeather: jest.fn().mockResolvedValue({ ...frozen, source: 'MANUAL' }) };
  render(<MissionDayWeatherReport day={day} report={null} api={api} />);
  await user.click(screen.getByRole('button', { name: 'Enter manual evidence' }));
  await user.type(screen.getByLabelText('Observed temperature (°C)'), '23');
  await user.type(screen.getByRole('textbox', { name: 'Reason for manual evidence' }), 'Copied from the on-site station log.');
  await user.click(screen.getByRole('button', { name: 'Freeze manual weather evidence' }));
  await waitFor(() => expect(api.saveManualWeather).toHaveBeenCalledWith(day.id, expect.objectContaining({
    coverage: 'ACTUAL_INTERVAL',
    evidence: expect.objectContaining({
      source: 'MANUAL', providerIdentifier: null, providerRetrievedAt: null,
      manualReason: 'Copied from the on-site station log.',
      hourlyObservations: [expect.objectContaining({ observedAt: day.actualStartedAt, temperatureC: 23 })],
    }),
  })));
});
