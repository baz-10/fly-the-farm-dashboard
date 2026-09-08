import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PropertyDetail from '../PropertyDetail';

const mockPolygons: Array<Array<[number, number]>> = Array.from({ length: 14 }, (_, index) => {
  const offset = index * 0.02;
  return [[-27 - offset, 153 + offset], [-27 - offset, 153.01 + offset], [-27.01 - offset, 153.01 + offset]];
});
const mockCreateField = jest.fn();
const mockCreateFieldBoundaryVersion = jest.fn();

jest.mock('react-router-dom', () => ({
  useParams: () => ({ clientId: 'client-1', propertyId: 'property-1' }),
  useNavigate: () => jest.fn(),
}));

jest.mock('../../contexts/OperationalDataContext', () => ({
  useOperationalData: () => ({
    mode: 'remote', status: 'ready', lastSaved: null,
    clients: [{ id: 'client-1', name: 'Grower' }],
    properties: [{ id: 'property-1', clientId: 'client-1', name: 'Farm', address: '', state: 'QLD', locality: '', lotPlan: '', notes: '', rowVersion: 1 }],
    fields: [], createField: mockCreateField, createFieldBoundaryVersion: mockCreateFieldBoundaryVersion,
    updateProperty: jest.fn(), archiveProperty: jest.fn(),
  }),
}));

jest.mock('../../components/FieldBoundaryEditor', () => (props: any) => (
  <div>
    <div data-testid="polygon-count">{props.polygons?.length || 0}</div>
    <button type="button" onClick={() => {
      props.onCoordsChange(mockPolygons[0]);
      props.onPolygonsChange(mockPolygons);
      props.onBoundaryFile?.({ name: 'fourteen-paddocks.zip', size: 1024, type: 'application/zip' });
      props.onAreaChange(105.6);
    }}>Import 14 paddocks</button>
  </div>
));

beforeEach(() => {
  mockCreateField.mockReset().mockResolvedValue({ id: 'field-1', propertyId: 'property-1', name: 'North blocks', sizeHa: 105.6, rowVersion: 1 });
  mockCreateFieldBoundaryVersion.mockReset().mockResolvedValue({ id: 'boundary-1' });
});

test('creates the Field then publishes every imported polygon as its authoritative boundary', async () => {
  render(<PropertyDetail />);

  fireEvent.click(screen.getAllByRole('button', { name: 'Add Field' })[0]);
  const dialog = await screen.findByRole('dialog', { name: 'Add Field / Paddock' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Field Name/ }), { target: { value: 'North blocks' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import 14 paddocks' }));
  expect(within(dialog).getByTestId('polygon-count')).toHaveTextContent('14');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Field' }));

  await waitFor(() => expect(mockCreateField).toHaveBeenCalled());
  expect(mockCreateField).toHaveBeenCalledWith(expect.objectContaining({
    propertyId: 'property-1', name: 'North blocks', sizeHa: 105.6,
  }));
  expect(mockCreateFieldBoundaryVersion).toHaveBeenCalledWith('field-1', mockPolygons);
  expect(mockCreateField.mock.invocationCallOrder[0]).toBeLessThan(mockCreateFieldBoundaryVersion.mock.invocationCallOrder[0]);
});

test('retries a failed boundary publication without creating a duplicate Field', async () => {
  mockCreateFieldBoundaryVersion.mockRejectedValueOnce(new Error('Boundary unavailable')).mockResolvedValueOnce({ id: 'boundary-1' });
  render(<PropertyDetail />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Add Field' })[0]);
  const dialog = await screen.findByRole('dialog', { name: 'Add Field / Paddock' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Field Name/ }), { target: { value: 'North blocks' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import 14 paddocks' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Field' }));
  expect(await within(dialog).findByText(/Field was created, but its boundary is not yet saved/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Field' }));
  await waitFor(() => expect(mockCreateFieldBoundaryVersion).toHaveBeenCalledTimes(2));
  expect(mockCreateField).toHaveBeenCalledTimes(1);
});
