import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  test('shows the exact revision and blocks the canonical stale-package conflict', async () => {
    const user = userEvent.setup();
    const api = {
      authorise: jest.fn().mockRejectedValue(Object.assign(new Error('Package changed.'), { code: 'MISSION_PACKAGE_VERSION_CONFLICT' })),
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

  test('clears a stale decision state when reload supplies a different exact package', async () => {
    const user = userEvent.setup();
    const api = {
      authorise: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error('Package changed.'), { code: 'MISSION_PACKAGE_VERSION_CONFLICT' }))
        .mockResolvedValue({ packageRevisionId: '55555555-5555-4555-8555-555555555555', decision: 'AUTHORISED', decidedAt: '2026-09-04T11:00:00.000Z' }),
      reject: jest.fn(),
    };
    const onReload = jest.fn();
    const { rerender } = render(<MissionCrpReview missionId={missionId} packageRevision={packageRevision} api={api} onReload={onReload} />);

    await user.click(screen.getByRole('button', { name: 'Authorise Mission' }));
    expect(await screen.findByText('Package changed. Reload before deciding.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Reload package' }));
    expect(onReload).toHaveBeenCalledTimes(1);

    const reloadedPackage = {
      ...packageRevision,
      id: '55555555-5555-4555-8555-555555555555',
      revisionNumber: 5,
      evidenceDigest: 'b'.repeat(64),
    };
    rerender(<MissionCrpReview missionId={missionId} packageRevision={reloadedPackage} api={api} onReload={onReload} />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Authorise Mission' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Authorise Mission' }));
    await waitFor(() => expect(api.authorise).toHaveBeenLastCalledWith(
      missionId, reloadedPackage.id, 5, reloadedPackage.evidenceDigest, expect.any(String),
    ));
  });

  test('requires a separate rejection reason and never sends the authorisation declaration on reject', async () => {
    const user = userEvent.setup();
    const api = { authorise: jest.fn(), reject: jest.fn().mockResolvedValue({ packageRevisionId: packageRevision.id, decision: 'REJECTED', decidedAt: '2026-09-04T11:00:00.000Z' }) };
    render(<MissionCrpReview missionId={missionId} packageRevision={packageRevision} api={api} />);

    expect(screen.getByRole('button', { name: 'Reject Mission' })).toBeDisabled();
    await user.type(screen.getByRole('textbox', { name: 'Reason for rejecting package' }), 'JSA scope needs correction.');
    await user.click(screen.getByRole('button', { name: 'Reject Mission' }));

    await waitFor(() => expect(api.reject).toHaveBeenCalledWith(
      missionId, packageRevision.id, packageRevision.revisionNumber, packageRevision.evidenceDigest, 'JSA scope needs correction.',
    ));
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
