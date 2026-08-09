# Final Repair Package F: Safe Coming Soon Navigation and Maturity Accessibility

## Status

Completed locally. No push or deployment was performed.

## Repairs

- Compliance menu cards are now single semantic actions with no nested buttons or focus targets.
- Coming Soon cards remain visually discoverable and navigate to their existing authorised routes; the route guard renders the safe Coming Soon workspace without mounting the browser-local workflow.
- Real-router integration coverage proves authorised click-through for Chemical Transport & Storage and Safety & PPE Compliance, plus direct-route denial for client and production-beta-acceptance roles.
- Navigation items preserve their existing accessible names while shared descriptions communicate the full maturity explanation in expanded/mobile and collapsed desktop presentations.
- Collapsed desktop Beta tooltips now expose the exact approved explanation on keyboard focus instead of the abbreviated “— Beta” suffix.
- The collapsed trigger is programmatically associated with the open tooltip through the tooltip's generated `aria-describedby` ID. Expanded/mobile items retain their dedicated hidden description instead, avoiding conflicting or duplicate ID references.
- Visible maturity badges inside navigation and compliance actions are noninteractive, avoiding nested or duplicate keyboard interactions.
- Roles, entitlements, route paths, and navigation structure were unchanged.

## TDD Evidence

- RED: the focused suite initially failed six assertions: four missing navigation maturity descriptions and two Coming Soon cards that were not semantic buttons and could not navigate.
- GREEN: the focused compliance/navigation suite passed 13 tests after the production changes.
- Review RED/GREEN: a keyboard-focus regression assertion first proved the collapsed trigger described a hidden span rather than the visible tooltip, then passed after the conditional description strategy was applied.

## Verification

- Focused route guard and maturity surface batch: 4 suites, 25 tests passed.
- Review-focused maturity/navigation batch: 4 suites, 19 tests passed; broader route/maturity batch: 4 suites, 37 tests passed.
- Product maturity registry verifier passed: 46 modules, 12 workflows, 53 App routes, 148 customer UI source files, 64 evidence references, and zero customer-facing Legacy violations.
- Full test suite passed: 207 suites, 966 tests.
- Optimized production build succeeded. It retained the repository's existing lint and bundle-size warnings; no new warning points to this repair.
- `git diff --check` passed.
- No push or deployment.
