# Final repair package A — security and presentation

## Outcome

Completed the final security/presentation integration repair against starting commit `c94663a`.

The route composition now enforces authentication, role, and entitlement checks before rendering any maturity surface. Unauthorised direct or manipulated URLs therefore fail closed without disclosing a Coming Soon destination. Existing route permissions were retained, including the `legacyAskFtf` entitlement.

## Changes

- Added `AuthorisedProductRoute`, which composes the existing `ProtectedRoute` outside the route maturity surface.
- Moved maturity presentation out of the shared `Layout` outlet and onto each route so guards execute first.
- Applied maturity presentation to public Register, public Customer Acceptance, and the protected platform shell without bypassing their existing lifecycle/security boundaries.
- Classified Spray Recommendation Import as Coming Soon and retained its remote-mode operational gate because the real importer still writes clients, properties, fields, and jobs through browser-local persistence.
- Mapped `/treatment/:id` to the Beta Chemical Database module.
- Restored Organisation Administration to Operationally Ready while constraining only the unsafe network/source, chemical extraction, and document-sourcing workflows as Coming Soon.
- Removed browser-local network overview reads from `/admin`; supported organisation access, branding, and authoritative chemical review functions remain available.
- Constrained Personnel CASA Credentials to its Beta workflow while leaving personnel identity linking outside that workflow boundary.
- Removed nested keyboard stops from navigation maturity badges.
- Replaced customer-visible development/legacy wording with availability-safe copy.

## Security review

- Direct-role denial covered for both `production_beta_acceptance` and `client` users.
- Entitlement denial covered for a manipulated `/ask-ftf` route.
- Denied routes do not render either the destination content or its Coming Soon presentation.
- Existing allowed-role sets remain unchanged for calculator, quote, financial, aircraft, personnel, fleet, JSA, mission, weather, compliance, settings, and administration routes.
- `/admin` still requires the `admin` role.
- Public routes retain their existing public lifecycle; protected platform routes retain `PlatformProtectedRoute`.
- The real Spray Recommendation Import page is exercised by the App regression (not replaced with a page mock); in Production Beta its upload control and browser-local write path are not exposed.
- Personnel coverage forces the CASA Credentials workflow unavailable and proves identity linking remains usable outside that boundary.

## Verification

- Focused repair suite: 9 suites, 47 tests passed.
- Follow-up registry/admin/personnel suite: 3 suites, 10 tests passed.
- Full test suite: `CI=true npm test -- --watchAll=false --runInBand` exited 0. Existing console warnings remain in unrelated tests.
- Registry verifier: 46 modules and 12 workflows classified; 53 App routes checked; 0 customer-facing Legacy violations.
- Production build: `npm run build` exited 0. It completed with pre-existing lint and bundle-size warnings.
- Diff hygiene: `git diff --check` exited 0.

No push or deployment was performed.

## Review follow-up

The safety review identified that Spray Recommendation Import still uses `fieldManagementStore` for browser-local writes. The follow-up restores defense in depth: the route is Coming Soon at the maturity surface and retains `OperationalFeatureGate` for remote mode. The App regression renders the real importer module and demonstrates that its upload/write workflow was exposed before the fix and is absent afterward. Personnel coverage now also forces the CASA Credentials boundary to Coming Soon and verifies that identity linking remains outside it.

Fresh follow-up verification:

- Focused security/maturity suite: 5 suites, 33 tests passed.
- Registry verifier: 46 modules and 12 workflows classified; 53 App routes checked; 0 customer-facing Legacy violations.
- Production build: exited 0 with the same pre-existing lint and bundle-size warnings.
