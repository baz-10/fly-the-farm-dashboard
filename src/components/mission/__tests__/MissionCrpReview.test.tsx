import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionCrpReview from '../MissionCrpReview';

const missionId = '11111111-1111-4111-8111-111111111111';
const packageRevision = {
  id: '22222222-2222-4222-8222-222222222222', missionId, revisionNumber: 4,
  fieldIds: ['33333333-3333-4333-8333-333333333333'],
  jsaRevisionId: '44444444-4444-4444-8444-444444444444',
  evidenceDigest: 'a'.repeat(64), state: 'AWAITING_CRP_APPROVAL' as const,
  createdAt: '2026-09-04T10:00:00.000Z',
};

describe('MissionCrpReview', () => {
  test('shows the exact revision and blocks stale CRP approval', async () => {
    const user = userEvent.setup();
    const api = {
      authorise: jest.fn().mockRejectedValue(Object.assign(new Error('Package changed.'), { code: 'VERSION_CONFLICT' })),
      reject: jest.fn(),
    };
    render(<MissionCrpReview missionId={missionId} packageRevision={packageRevision} api={api} />);

    expect(screen.getByText('Revision 4')).toBeVisible();
    expect(screen.getByText(packageRevision.jsaRevisionId)).toBeVisible();
    expect(screen.getByText(packageRevision.evidenceDigest)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Authorise Mission' }));

    expect(await screen.findByText('Package changed. Reload before deciding.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Authorise Mission' })).toBeDisabled();
  });

  test('does not offer a CRP decision for an incomplete package revision', () => {
    render(<MissionCrpReview missionId={missionId} packageRevision={{ ...packageRevision, state: 'PREPARING' }} api={{ authorise: jest.fn(), reject: jest.fn() }} />);

    expect(screen.getByText('This package is not ready for a CRP decision.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Authorise Mission' })).not.toBeInTheDocument();
  });

  test('removes the decision action when the server finds the operator ineligible as CRP', async () => {
    const user = userEvent.setup();
    const api = {
      authorise: jest.fn().mockRejectedValue(Object.assign(new Error('Not eligible.'), { code: 'CRP_INELIGIBLE' })),
      reject: jest.fn(),
    };
    render(<MissionCrpReview missionId={missionId} packageRevision={packageRevision} api={api} />);

    await user.click(screen.getByRole('button', { name: 'Authorise Mission' }));
    expect(await screen.findByText('Only an eligible CRP can decide this Mission package.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Authorise Mission' })).not.toBeInTheDocument();
  });
});
