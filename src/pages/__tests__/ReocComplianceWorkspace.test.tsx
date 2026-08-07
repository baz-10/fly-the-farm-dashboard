import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReocComplianceWorkspace from '../ReocComplianceWorkspace';

const mockNavigate = jest.fn();
const mockOverview = jest.fn();
const mockSaveInstrument = jest.fn();

jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../../services/complianceApi', () => ({
  createComplianceApi: () => ({ overview: mockOverview, saveInstrument: mockSaveInstrument }),
}));

const missingOverview = { reoc: null };

describe('ReocComplianceWorkspace', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockOverview.mockReset().mockResolvedValue(missingOverview);
    mockSaveInstrument.mockReset().mockResolvedValue({});
  });

  test('shows current ReOC status and returns to CASA Compliance', async () => {
    render(<ReocComplianceWorkspace />);
    expect(await screen.findByRole('heading', { name: 'ReOC certificate' })).toBeVisible();
    expect(await screen.findByText('Evidence missing')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Back to CASA Compliance' }));
    expect(mockNavigate).toHaveBeenCalledWith('/compliance');
  });

  test('saves ReOC evidence and reloads the authoritative record', async () => {
    render(<ReocComplianceWorkspace />);
    await userEvent.type(await screen.findByRole('textbox', { name: /ReOC number/ }), 'CASA.REOC.123');
    fireEvent.change(screen.getByLabelText(/Expiry date/), { target: { value: '2027-08-08' } });
    const file = new File(['certificate'], 'reoc.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose ReOC certificate'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Save ReOC certificate' }));

    await waitFor(() => expect(mockSaveInstrument).toHaveBeenCalledWith(
      expect.objectContaining({ instrumentType: 'REOC', instrumentNumber: 'CASA.REOC.123', expiryDate: '2027-08-08' }),
      file,
    ));
    await waitFor(() => expect(mockOverview).toHaveBeenCalledTimes(2));
    expect(screen.getByText('ReOC certificate saved.')).toBeVisible();
  });

  test('keeps entered evidence available when the authoritative save is rejected', async () => {
    mockSaveInstrument.mockRejectedValue(new Error('ReOC evidence could not be stored.'));
    render(<ReocComplianceWorkspace />);
    await userEvent.type(await screen.findByRole('textbox', { name: /ReOC number/ }), 'CASA.REOC.999');
    fireEvent.change(screen.getByLabelText(/Expiry date/), { target: { value: '2027-12-01' } });
    const file = new File(['certificate'], 'current-reoc.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByLabelText('Choose ReOC certificate'), file);
    await userEvent.click(screen.getByRole('button', { name: 'Save ReOC certificate' }));

    expect(await screen.findByText('ReOC evidence could not be stored.')).toBeVisible();
    expect(screen.getByRole('textbox', { name: /ReOC number/ })).toHaveValue('CASA.REOC.999');
    expect(screen.getByText('current-reoc.pdf')).toBeVisible();
  });
});
