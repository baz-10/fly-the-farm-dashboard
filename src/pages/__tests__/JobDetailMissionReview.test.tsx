import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JobDetail from '../JobDetail';

const mockNavigate = jest.fn();

jest.mock('../../utils/clientReportPdf', () => ({ generateClientReportPdf: jest.fn() }));
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ clientId: 'client-1', propertyId: 'property-1', fieldId: 'field-1', jobId: 'job-1' }),
}), { virtual: true });
jest.mock('../../contexts/OperationalDataContext', () => ({ useOperationalData: () => ({
  mode: 'remote', status: 'ready', saving: false, lastSaved: null,
  clients: [{ id: 'client-1', name: 'North Farm' }],
  properties: [{ id: 'property-1', clientId: 'client-1', name: 'Home Block' }],
  fields: [{ id: 'field-1', propertyId: 'property-1', name: 'North Paddock', sizeHa: 10 }],
  jobs: [{ id: 'job-1', clientId: 'client-1', propertyId: 'property-1', fieldIds: ['field-1'], reference: 'JOB-42', scope: 'Spray lantana', status: 'open', requestedDate: '', scheduledDate: '', notes: '' }],
  missions: [{ id: 'mission-1', jobId: 'job-1', missionNumber: 'MSN-001', title: 'North block spray' }],
  archiveJob: jest.fn(),
}) }));

describe('JobDetail mission review link', () => {
  beforeEach(() => mockNavigate.mockReset());

  test('links to Mission CRP review without approving work on the Job', async () => {
    const user = userEvent.setup();
    render(<JobDetail />);

    expect(screen.getByText(/A Job defines eligible Fields; it does not approve operational work/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Open Mission review' }));
    expect(mockNavigate).toHaveBeenCalledWith('/missions/mission-1?stage=review');
  });
});
