import { AustralianState } from '../../types/chemical';

export interface StructuredAddress {
  address: string;
  locality: string;
  state: AustralianState;
  postcode: string;
}

export interface ConfirmedLocation extends StructuredAddress {
  lat: number;
  lng: number;
  coordinateSource?: 'GEOCODED' | 'MANUALLY_ADJUSTED';
  locationConfirmedAt?: string;
}

export function composeAddress(value: StructuredAddress): string {
  const street = value.address.trim();
  const locality = value.locality.trim();
  const statePostcode = [value.state, value.postcode.trim()].filter(Boolean).join(' ');
  return [street, [locality, statePostcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export function invalidateAddressConfirmation<T extends ConfirmedLocation>(
  current: T,
  updates: Partial<StructuredAddress>
): T {
  return { ...current, ...updates, locationConfirmedAt: undefined };
}
