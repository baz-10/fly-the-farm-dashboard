import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OperationsManualWorkspace from '../OperationsManualWorkspace';

const mockNavigate = jest.fn();
const mockOverview = jest.fn();
const mockPublishManual = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../../services/complianceApi', () => ({
  createComplianceApi: () => ({ overview: mockOverview, publishManual: mockPublishManual }),
}));

describe('OperationsManualWorkspace', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockOverview.mockReset().mockResolvedValue({ operationsManual: null });
    mockPublishManual.mockReset().mockResolvedValue({});
  });

  test('shows publication status and returns to CASA Compliance', async () => {
    render(<OperationsManualWorkspace />);
    expect(await screen.findByRole('heading', { name: 'Operations Manual' })).toBeVisible();
    expect(await screen.findByText('Not yet published')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Back to CASA Compliance' }));
    expect(mockNavigate).toHaveBeenCalledWith('/compliance');
  });

  test('publishes an approved Operations Manual and reloads authoritative status', async () => {
    render(<OperationsManualWorkspace />);
    await screen.findByRole('textbox', { name: 'Document title' });
    fireEvent.change(screen.getByLabelText(/Effective date/), { target: { value: '2026-08-08' } });
    const file = new File(['manual'], 'operations-manual.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose Operations Manual'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Publish Operations Manual' }));

    await waitFor(() => expect(mockPublishManual).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'RPAS Operations Manual', effectiveDate: '2026-08-08' }),
      file,
    ));
    await waitFor(() => expect(mockOverview).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Operations Manual published.')).toBeVisible();
  });

  test('keeps publication evidence available when the command is rejected', async () => {
    mockPublishManual.mockRejectedValue(new Error('Operations Manual could not be stored.'));
    render(<OperationsManualWorkspace />);
    await screen.findByRole('textbox', { name: 'Document title' });
    fireEvent.change(screen.getByLabelText(/Effective date/), { target: { value: '2026-08-09' } });
    const file = new File(['manual'], 'approved-manual.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose Operations Manual'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Publish Operations Manual' }));

    expect(await screen.findByText('Operations Manual could not be stored.')).toBeVisible();
    expect(screen.getByLabelText(/Effective date/)).toHaveValue('2026-08-09');
    expect(screen.getByText('approved-manual.pdf')).toBeVisible();
  });
});
