# Final repair package C — case-normalisation and presentation

## Outcome

Completed the case-normalisation maturity-bypass repair against starting commit `947dcb9`.

Static route segments in the maturity resolver now match case-insensitively, consistent with React Router's default route behavior. Named dynamic segments remain non-empty single-segment matches, query values retain their existing case-sensitive semantics, and the existing specificity ordering remains unchanged.

## Security coverage

- Added a React Router integration suite using the installed router implementation rather than a hand-written route mock.
- Covered authorised navigation to `/QUOTES`, `/Quotes`, `/FINANCIALS`, `/COMPLIANCE/TRANSPORT`, `/Compliance/Safety`, and `/compliance/DOCUMENTATION`.
- Each case proves the Coming Soon surface renders before a browser-local child can mount or write.
- Covered unauthorised `client` and `production_beta_acceptance` navigation, proving the role guard redirects before maturity presentation or local code execution.
- Covered `/ADMIN` and `/Admin` with the real Admin page and real workflow boundaries, proving all three browser-local administration workflows remain constrained.
- Added resolver coverage for uppercase static routes, dynamic quote IDs, most-specific `/QUOTES/NEW` resolution, uppercase Jobs paths, and unchanged case-sensitive query values.

## Presentation and accessibility

- Coming Soon badges are presentational and no longer create keyboard focus stops.
- Explicitly noninteractive Beta badges remain outside the tab order.
- Default Beta badges remain focusable so their explanatory tooltip is keyboard-accessible.
- `ComingSoonWorkspace` now accepts a semantic heading level; full route surfaces remain `h1`, while nested workflow boundaries use `h2`.

## TDD evidence

The initial regression run failed for the intended causes:

- uppercase static paths resolved to no maturity surface;
- Coming Soon badges rendered with `tabindex="0"`;
- nested workflow placeholders rendered as `h1`.

After the focused production changes, the security, resolver, workflow, badge, Admin, and Personnel suite passed: 7 suites and 46 tests.

Fresh final verification:

- Full test suite: 206 suites and 932 tests passed.
- Registry verifier: 46 modules and 12 workflows classified; 53 App routes, 116 customer UI source files, and 64 evidence references checked; 0 customer-facing Legacy violations.
- Production build: exited 0 with existing repository lint and bundle-size warnings.
- Diff hygiene: `git diff --check` exited 0.

No push or deployment was performed.

## Encoded-path security follow-up

The Critical follow-up identified that React Router decodes percent-encoded pathname segments before matching, while the maturity resolver previously compared the raw pathname. Paths such as `/%71uotes` therefore mounted the Quotes route but resolved no maturity surface.

The resolver now mirrors React Router's supported decoding semantics before applying existing exact matching: each segment is decoded independently, decoded slashes remain encoded within their segment, static segments remain case-insensitive, and dynamic/query/specificity behavior is preserved. Malformed percent encoding throws a dedicated path error that the maturity surface converts into a customer-safe “Page unavailable” state after authorization; it never falls through to route children.

Real MemoryRouter mount-sentinel coverage now includes `/%71uotes`, `/%66inancials`, `/%63ompliance/transport`, `/jobs/%69mport`, and `/%61dmin`. It also covers malformed encoded dynamic paths for both authorised and unauthorised roles, proving guards still execute first and browser-local writers never mount.

Fresh encoded-path follow-up verification:

- Focused resolver/route/security suite: 4 suites and 52 tests passed.
- Full test suite: 206 suites and 947 tests passed.
- Registry verifier: 46 modules and 12 workflows classified; 53 App routes, 116 customer UI source files, and 64 evidence references checked; 0 customer-facing Legacy violations.
- Production build: exited 0 with existing repository lint and bundle-size warnings.
