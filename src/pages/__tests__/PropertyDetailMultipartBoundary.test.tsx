import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PropertyDetail from '../PropertyDetail';

const mockPolygons: Array<Array<[number, number]>> = [
  [[-27, 153], [-27, 153.01], [-27.01, 153.01]],
  [[-27.02, 153.02], [-27.02, 153.03], [-27.03, 153.03]],
];
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
  expect(within(dialog).getByTestId('polygon-count')).toHaveTextContent('2');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add Field' }));

  await waitFor(() => expect(mockCreateField).toHaveBeenCalled());
  expect(mockCreateField).toHaveBeenCalledWith(expect.objectContaining({
    propertyId: 'property-1', name: 'North blocks', sizeHa: 105.6,
  }));
  expect(mockCreateFieldBoundaryVersion).toHaveBeenCalledWith('field-1', mockPolygons);
  expect(mockCreateField.mock.invocationCallOrder[0]).toBeLessThan(mockCreateFieldBoundaryVersion.mock.invocationCallOrder[0]);
});
