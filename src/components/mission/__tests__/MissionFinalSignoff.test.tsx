import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MissionFinalSignoff from '../MissionFinalSignoff';

const ready = {
  missionId: '11111111-1111-4111-8111-111111111111',
  operationalWorkCompleted: true,
  finalSignedOff: false,
  readyForFinalSignoff: true,
  currentCompletionRevision: 0,
  blockers: [],
};

test('lists precise unresolved evidence and withholds final sign-off', () => {
  render(<MissionFinalSignoff readiness={{ ...ready, readyForFinalSignoff: false, blockers: [
    { code: 'MISSION_EVIDENCE_UNRECONCILED', message: '6 September: aircraft totals do not reconcile' },
  ] }} onFinalSignoff={jest.fn()} />);
  expect(screen.getByText('6 September: aircraft totals do not reconcile')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Final sign-off Mission' })).not.toBeInTheDocument();
});

test('distinguishes operational completion and sends one bounded declaration', async () => {
  const onFinalSignoff = jest.fn().mockResolvedValue(undefined);
  render(<MissionFinalSignoff readiness={ready} onFinalSignoff={onFinalSignoff} />);
  expect(screen.getByText('Operational work completed')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox', { name: 'Final sign-off declaration' }), { target: { value: 'Evidence reviewed and complete.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Final sign-off Mission' }));
  await waitFor(() => expect(onFinalSignoff).toHaveBeenCalledWith({ expectedRevision: 0, declaration: 'Evidence reviewed and complete.' }));
});

test('does not present operational completion as final sign-off', () => {
  render(<MissionFinalSignoff readiness={{ ...ready, operationalWorkCompleted: false, readyForFinalSignoff: false,
    blockers: [{ code: 'MISSION_DAY_INCOMPLETE', message: '6 September: operating work remains active' }] }} onFinalSignoff={jest.fn()} />);
  expect(screen.getByText('Operational work in progress')).toBeVisible();
  expect(screen.getByText('Awaiting final sign-off')).toBeVisible();
});
