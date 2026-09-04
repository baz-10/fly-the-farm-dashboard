import { invalidateAddressConfirmation, composeAddress } from './structuredLocation';

describe('structured location authority', () => {
  const confirmed = {
    address: '304A Glasshouse Mountains Road', locality: 'Beerburrum', state: 'QLD' as const,
    postcode: '4517', lat: -26.96, lng: 152.96, coordinateSource: 'MANUALLY_ADJUSTED' as const,
    locationConfirmedAt: '2026-09-04T06:00:00.000Z',
  };

  test('address edits invalidate confirmation without moving an adjusted pin', () => {
    expect(invalidateAddressConfirmation(confirmed, { locality: 'Glass House Mountains' })).toEqual({
      ...confirmed, locality: 'Glass House Mountains', locationConfirmedAt: undefined,
    });
  });

  test('composes a complete Australian address without requiring a search result', () => {
    expect(composeAddress({
      address: '304A Glasshouse Mountains Road', locality: 'Beerburrum', state: 'QLD', postcode: '4517',
    })).toBe('304A Glasshouse Mountains Road, Beerburrum QLD 4517');
  });
});
