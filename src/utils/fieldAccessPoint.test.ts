import { suggestFieldAccessPoint, moveFieldAccessPoint } from './fieldAccessPoint';

test('a Property coordinate is only an unconfirmed Field access-point suggestion', () => {
  expect(suggestFieldAccessPoint(-26.97, 152.96)).toEqual({
    label: 'Field access point', lat: -26.97, lng: 152.96,
    coordinateSource: 'PROPERTY_SUGGESTED', locationConfirmedAt: undefined,
  });
});

test('moving a Field access point marks it manually adjusted and unconfirmed', () => {
  expect(moveFieldAccessPoint({
    label: 'North gate', lat: -26.97, lng: 152.96,
    coordinateSource: 'PROPERTY_SUGGESTED', locationConfirmedAt: '2026-09-04T06:00:00.000Z',
  }, -26.971, 152.961)).toEqual({
    label: 'North gate', lat: -26.971, lng: 152.961,
    coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: undefined,
  });
});
