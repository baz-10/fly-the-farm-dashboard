import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionAuthorisation from '../MissionAuthorisation';

const missionId = '11111111-1111-4111-8111-111111111111';
const fieldId = '22222222-2222-4222-8222-222222222222';
const preparing = {
  id: '33333333-3333-4333-8333-333333333333', missionId, revisionNumber: 1, fieldIds: [fieldId],
  jsaRevisionId: '44444444-4444-4444-8444-444444444444', evidenceDigest: 'a'.repeat(64),
  state: 'PREPARING' as const, createdAt: '2026-09-04T10:00:00.000Z',
};
const awaiting = { ...preparing, state: 'AWAITING_CRP_APPROVAL' as const };

describe('MissionAuthorisation', () => {
  test('saves a non-empty Job Field proposal then submits that exact package for CRP review', async () => {
    const user = userEvent.setup();
    const api = {
      readPackageHistory: jest.fn().mockResolvedValue({ missionId, currentRevision: 0, packages: [], decisions: [] }),
      saveScope: jest.fn().mockResolvedValue(preparing),
      submitForApproval: jest.fn().mockResolvedValue(awaiting),
      authorise: jest.fn(), reject: jest.fn(),
    };
    render(<MissionAuthorisation missionId={missionId} jobFieldIds={[fieldId]} fieldsByProperty={[
      { propertyId: 'property-1', propertyName: 'North Farm', fields: [{ id: fieldId, name: 'North Paddock' }] },
    ]} api={api} />);

    expect(await screen.findByRole('checkbox', { name: 'North Paddock' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save Mission Field scope' }));
    await waitFor(() => expect(api.saveScope).toHaveBeenCalledWith(missionId, 0, [fieldId]));
    await user.click(screen.getByRole('button', { name: 'Submit exact package for CRP review' }));
    await waitFor(() => expect(api.submitForApproval).toHaveBeenCalledWith(missionId, preparing.id, 1, preparing.evidenceDigest));
    expect(await screen.findByText('Revision 1')).toBeVisible();
  });

  test('requires a Job Field context before a mission package can be created', async () => {
    const api = { readPackageHistory: jest.fn().mockResolvedValue({ missionId, currentRevision: 0, packages: [], decisions: [] }), saveScope: jest.fn(), submitForApproval: jest.fn(), authorise: jest.fn(), reject: jest.fn() };
    render(<MissionAuthorisation missionId={missionId} api={api} />);

    expect(await screen.findByText('Open this review from an authoritative Job with at least one selected Field.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Authorise Mission' })).not.toBeInTheDocument();
  });

  test('does not offer a scope command when Job Field records are unavailable', async () => {
    const api = { readPackageHistory: jest.fn().mockResolvedValue({ missionId, currentRevision: 0, packages: [], decisions: [] }), saveScope: jest.fn(), submitForApproval: jest.fn(), authorise: jest.fn(), reject: jest.fn() };
    render(<MissionAuthorisation missionId={missionId} jobFieldIds={[fieldId]} api={api} />);

    expect(await screen.findByText('Open this review from an authoritative Job with at least one selected Field.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save Mission Field scope' })).not.toBeInTheDocument();
  });
});
