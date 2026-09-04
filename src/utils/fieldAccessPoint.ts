import { FieldAccessPoint } from '../types/fieldManagement';

export type FieldAccessPointDraft = Omit<FieldAccessPoint, 'locationConfirmedAt'> & { locationConfirmedAt?: string };

export function suggestFieldAccessPoint(lat: number, lng: number): FieldAccessPointDraft {
  return { label: 'Field access point', lat, lng, coordinateSource: 'PROPERTY_SUGGESTED', locationConfirmedAt: undefined };
}

export function moveFieldAccessPoint(current: FieldAccessPointDraft, lat: number, lng: number): FieldAccessPointDraft {
  return { ...current, lat, lng, coordinateSource: 'MANUALLY_ADJUSTED', locationConfirmedAt: undefined };
}
