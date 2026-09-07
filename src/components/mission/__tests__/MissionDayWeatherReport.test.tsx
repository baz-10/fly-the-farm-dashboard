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
  const shortDay = { ...day, actualFinishedAt: '2026-09-04T23:15:00.000Z' };
  render(<MissionDayWeatherReport day={shortDay} report={null} api={api} />);
  await user.click(screen.getByRole('button', { name: 'Enter manual evidence' }));
  expect(screen.getByText('2026-09-04T22:00:00.000Z')).toBeVisible();
  expect(screen.getByText('2026-09-04T23:00:00.000Z')).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Evidence for 2026-09-04T22:00:00.000Z' }), 'OBSERVATION');
  await user.type(screen.getByRole('textbox', { name: /Observed temperature at 2026-09-04T22:00:00.000Z/ }), '23');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Evidence for 2026-09-04T23:00:00.000Z' }), 'GAP');
  await user.type(screen.getByRole('textbox', { name: /Gap reason at 2026-09-04T23:00:00/ }), 'Station logger was offline.');
  await user.type(screen.getByRole('textbox', { name: 'Reason for manual evidence' }), 'Copied from the on-site station log.');
  await user.click(screen.getByRole('button', { name: 'Freeze manual weather evidence' }));
  await waitFor(() => expect(api.saveManualWeather).toHaveBeenCalledWith(day.id, expect.objectContaining({
    coverage: 'ACTUAL_INTERVAL',
    evidence: expect.objectContaining({
      source: 'MANUAL', providerIdentifier: null, providerRetrievedAt: null,
      manualReason: 'Copied from the on-site station log.', coverageGaps: [{
        observedAt: '2026-09-04T23:00:00.000Z', reason: 'Station logger was offline.',
      }],
      hourlyObservations: [expect.objectContaining({ observedAt: '2026-09-04T22:00:00.000Z', temperatureC: 23 })],
    }),
  })));
});

test('does not invent empty gaps or accept an all-null manual observation', async () => {
  const user = userEvent.setup();
  const api = { captureWeather: jest.fn(), saveManualWeather: jest.fn() };
  const oneHourDay = { ...day, actualStartedAt: '2026-09-04T21:30:00.000Z', actualFinishedAt: '2026-09-04T22:30:00.000Z' };
  render(<MissionDayWeatherReport day={oneHourDay} report={null} api={api} />);
  await user.click(screen.getByRole('button', { name: 'Enter manual evidence' }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Evidence for 2026-09-04T22:00:00.000Z' }), 'OBSERVATION');
  await user.type(screen.getByRole('textbox', { name: 'Reason for manual evidence' }), 'Checked station log.');
  await user.click(screen.getByRole('button', { name: 'Freeze manual weather evidence' }));
  expect(await screen.findByText('Every measured hour needs at least one observed value; every gap needs a truthful reason.')).toBeVisible();
  expect(api.saveManualWeather).not.toHaveBeenCalled();
});

test('derives manual full-day UTC buckets from the Base timezone and work date', async () => {
  const user = userEvent.setup();
  const api = { captureWeather: jest.fn(), saveManualWeather: jest.fn() };
  render(<MissionDayWeatherReport day={{
    ...day,
    workDate: '2026-09-06',
    state: 'DRAFT',
    actualStartedAt: null,
    actualFinishedAt: null,
  }} report={null} api={api} />);
  await user.click(screen.getByRole('button', { name: 'Enter manual evidence' }));
  expect(screen.getByText('2026-09-05T14:00:00.000Z')).toBeVisible();
  expect(screen.getByText('2026-09-06T13:00:00.000Z')).toBeVisible();
  expect(screen.getAllByRole('combobox', { name: /Evidence for/ })).toHaveLength(24);
});
