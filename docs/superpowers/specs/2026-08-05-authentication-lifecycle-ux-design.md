# Authentication Lifecycle UX Design

## Purpose

Correct the Production Beta login action hierarchy and ensure invitation, confirmation, password creation, recovery, and reset remain authentication-only workflows until password establishment succeeds.

## Login layout

- Sign In remains the primary full-width action.
- Forgot password? is a dedicated, centred row immediately after Sign In.
- A divider separates account recovery from registration.
- Create account is a dedicated row below the divider.
- All actions remain in normal document flow with non-negative spacing and no absolute positioning.
- The same structure is used at desktop, tablet, and mobile widths.

## Authentication lifecycle

Invitation and recovery callbacks validate Supabase callback tokens without resolving a Platform or Organisation identity. Invitation and recovery callbacks both present the password-choice screen. Password submission validates the callback session, updates the Supabase password, and only then resolves the identity plane. A successful identity resolution establishes the application session and routes through the existing home resolver. Authentication errors remain distinct from post-authentication identity-assignment errors.

Ordinary platform administrators require no manual database intervention after their Platform identity exists: invite, choose password, sign in, and recover password use the normal authentication lifecycle.

## Failure handling

- Invalid or expired callback tokens show the Supabase authentication error.
- Password validation errors remain on the password-choice screen.
- Identity errors may appear only after the password update has completed successfully.
- Recovery requests retain the existing account-enumeration-safe response.

## Verification

- Component tests assert action order, separation, visible links, and absence of negative/absolute positioning.
- Responsive tests render desktop, tablet, and mobile media-query states.
- API tests prove password update occurs before identity resolution.
- Callback tests prove invitation and recovery callbacks both open password choice without calling identity resolution.
- Deployed acceptance covers recovery request, callback routing, password replacement, Platform routing, Organisation routing, and identity-plane isolation.

