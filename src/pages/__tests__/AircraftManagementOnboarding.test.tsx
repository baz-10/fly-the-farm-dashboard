import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AircraftManagement from '../AircraftManagement';

let mockQuery = new URLSearchParams();
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockQuery],
}), { virtual: true });
jest.mock('../../contexts/AircraftContext', () => ({
  useAircraft: () => ({
    aircraft: [], equipmentKits: [], isLoading: false, error: null,
    deleteAircraft: jest.fn(), deleteEquipmentKit: jest.fn(), getAircraftById: jest.fn(),
    getEquipmentKitById: jest.fn(), clearError: jest.fn(),
  }),
}));
jest.mock('../../components/AircraftForm', () => (props: any) => <button type="button" onClick={props.onSave}>Complete aircraft save</button>);
jest.mock('../../components/EquipmentKitForm', () => (props: any) => <button type="button" onClick={props.onSave}>Complete equipment save</button>);

beforeEach(() => { mockNavigate.mockReset(); mockQuery = new URLSearchParams(); });

test.each([
  ['aircraft', 'Add New Aircraft', 'Complete aircraft save'],
  ['equipment', 'Add New Equipment Kit', 'Complete equipment save'],
])('opens the existing %s form and returns only after save', async (workflow, dialogName, saveName) => {
  mockQuery = new URLSearchParams(`onboarding=${workflow}&returnTo=%2Fgetting-started`);
  render(<AircraftManagement />);

  expect(await screen.findByRole('dialog', { name: dialogName })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: saveName }));
  fireEvent.click(await screen.findByRole('button', { name: 'Return to Getting Started' }));
  expect(mockNavigate).toHaveBeenCalledWith('/getting-started');
});
