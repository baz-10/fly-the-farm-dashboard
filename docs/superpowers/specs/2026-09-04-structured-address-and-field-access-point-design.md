# Structured Address and Field Access Point Design

## Outcome

Clients and Properties support both address search and complete manual Australian address entry. A map pin must be explicitly confirmed and is the authoritative operational location. Fields may additionally carry an optional confirmed access/launch point without duplicating or replacing the Property address or Field boundary.

## Authority model

- The written address is descriptive location evidence. Its structured fields are street/property address, locality or region, state, and postcode.
- Latitude and longitude become authoritative for navigation only after an explicit **Confirm location** action.
- Selecting a search result populates the structured fields but does not lock them.
- Editing structured address fields invalidates location confirmation. It does not silently move a manually adjusted pin.
- The map identifies whether its current pin is address-derived or manually adjusted.
- A failed or ambiguous geocode never invents coordinates. The user may position the pin directly and confirm it.
- Client locations remain labelled and may include Primary address, Site entrance, Loading area, Billing address, Office, Workshop, or a bounded custom label.
- A Property may inherit a Client location as a starting point, but must confirm its own authoritative coordinates.
- A Field inherits Property context and boundary. Its optional access/launch point is a separate operational coordinate, not a postal address and not a replacement for the field polygon.

## User workflow

### Client and Property

1. The form starts in **Search address** mode and exposes **Enter manually** at all times.
2. Selecting a result fills street/property address, locality/region, state, and postcode in editable inputs.
3. Manual mode accepts those same fields without requiring a search result.
4. The system attempts a best-effort geocode of the composed address when the operator requests map placement.
5. If geocoding succeeds, the suggested pin is shown. If it fails, the operator can place the pin on the map.
6. The operator moves the pin to the exact entrance or operational point and selects **Confirm location**.
7. Save stays unavailable until required address fields are valid and the current pin is confirmed.

### Field

1. The Property's confirmed location is shown as context.
2. The operator may choose **Add field access / launch point**.
3. The map initially frames the Field boundary where available, otherwise the Property pin.
4. The operator positions and confirms one access/launch point and may provide a short label such as “North gate” or “Aircraft staging area”.
5. The Field remains valid without an access point. If supplied, all access-point fields must pass together or fail closed.

## State transitions

- `GEOCODED_UNCONFIRMED`: search/manual geocode produced a suggestion.
- `MANUALLY_ADJUSTED_UNCONFIRMED`: operator moved or directly placed the pin.
- `CONFIRMED`: current coordinates were explicitly confirmed.
- Any address-component edit moves a confirmed Client/Property location back to unconfirmed while retaining the pin for visible review.
- Any coordinate change moves the location back to unconfirmed.
- Clearing manual Field access removes the optional point as one explicit action.

## Persistence

Existing Client JSON addresses retain `address`, `locality`, `state`, `postcode`, `lat`, `lng`, `coordinateSource`, and `locationConfirmedAt`. No private location becomes cross-tenant visible.

Existing Property columns continue to hold structured address and confirmed coordinates. `address_source` remains `GEOCODED` or `MANUAL`; manual pin adjustment maps to `MANUAL`.

Fields gain nullable, all-or-none access-point attributes:

- `access_point_label`
- `access_latitude`
- `access_longitude`
- `access_coordinate_source` (`PROPERTY_SUGGESTED` or `MANUALLY_ADJUSTED`)
- `access_location_confirmed_at`

The checked write authority validates coordinate ranges, bounded label length, allowed provenance, same-organisation Property ownership, and the all-or-none invariant. Existing Fields remain unchanged with no access point.

## Safety and tenancy

- The server derives organisation scope from the authenticated session; browser-supplied organisation IDs are not accepted.
- A Field access point can only be written through the existing checked Field command and only for a Property visible in the same organisation.
- Search/geocode results are suggestions, never authority.
- No address or coordinate is shared between organisations.
- No background request automatically overwrites typed fields or a moved pin.
- Stale asynchronous search/geocode responses are discarded.

## Error handling

- Search unavailable: retain entered fields and offer manual entry and map placement.
- No result: explain that manual entry remains valid.
- Incomplete manual address: identify the missing structured field.
- Unconfirmed pin: block save and focus the confirmation region.
- Invalid or cross-tenant Field access point: reject the command without mutation.
- API errors retain safe code/message/correlation ID through the existing operational error path.

## Accessibility and responsive behaviour

- Search/manual modes, map controls, confirmation state, and errors use semantic labels and keyboard-operable controls.
- Structured inputs remain usable without interacting with search suggestions.
- Phone layouts stack fields and map actions; tablet/desktop layouts group locality, state, and postcode without creating a long scrolling form.

## Verification boundary

Tests cover manual entry, editable search results, stale-result rejection, confirmation invalidation, direct pin placement, exact payloads, tenant rejection, optional Field access points, and equivalent Chromium/WebKit workflows. No Production migration or deployment is part of this implementation.
