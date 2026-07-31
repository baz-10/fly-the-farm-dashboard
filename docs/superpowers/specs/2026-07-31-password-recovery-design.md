# Password Recovery Design

## Goal

Provide self-service password recovery for every Fly the Farm account type without exposing whether an email address is registered or moving authentication secrets into browser configuration.

## User experience

The login page will include a **Forgot password?** link. It opens a public recovery-request page where the user enters an email address. A successful submission always shows the same message: if an account exists, Supabase has sent a recovery email. The response must not disclose whether the address is registered.

The recovery email returns the user to `/reset-password`. The page accepts the recovery session supplied by Supabase, asks for a new password twice, and requires both values to match. Passwords retain the system's existing minimum length of six characters. After a successful update, the page removes sensitive recovery data from the address bar and sends the user to `/login` with a confirmation message.

Invalid, expired, reused, or incomplete recovery links show a clear error and provide actions to request a new email or return to login. Recovery is available to administrators, contractors/operators, and clients.

## Architecture

The existing same-origin `/api/auth` proxy remains the only application-owned authentication interface.

- `request-password-reset` validates the email shape, constructs an approved `/reset-password` redirect, and requests a Supabase recovery email through the anonymous Auth API.
- `update-password` accepts the short-lived recovery access token and new password, then calls the Supabase user endpoint using that recovery token.
- The browser does not receive the Supabase service-role key or a new general-purpose Supabase client configuration.
- Existing login, registration, session-cookie, profile and tenant behaviour remains unchanged.

The reset redirect uses a configured canonical application URL in production. Same-origin localhost is allowed for development and automated tests. The production reset address must also be added to Supabase Authentication's allowed redirect URLs.

## Security and privacy

- Recovery-request responses are intentionally generic for both registered and unregistered addresses.
- Existing same-origin request checks remain active.
- Recovery tokens are used only for the password update and are never written to local storage, application logs, analytics, or persistent application state.
- The reset page removes token material from the URL immediately after capturing it and again after completion or failure.
- The service-role key is never used for user-driven password updates.
- Supabase remains responsible for recovery-link expiry, single-use validation and email throttling.
- Server and client errors use safe public messages and do not reveal upstream credentials or internal responses.

## Components

1. **Authentication API actions**
   Extend `api/auth.js` with request and update actions, focused validation, safe messages and redirect construction.

2. **Authentication context methods**
   Add typed methods for requesting recovery and submitting a replacement password through `/api/auth`.

3. **Forgot-password page**
   A small public page using the existing login visual language, with email entry, loading state, generic success state and a route back to login.

4. **Reset-password page**
   A public page that captures the Supabase recovery session, validates matching passwords, submits the update, handles invalid links and returns the user to login on success.

5. **Login confirmation**
   The login page displays a password-updated confirmation when redirected from a completed reset without retaining sensitive query or fragment data.

## Error handling

- Empty or malformed email: local validation message; no request.
- Unknown email: same success response as a known email.
- Supabase email or network failure: safe retry message without upstream details.
- Missing, expired or invalid recovery token: explain that the link is no longer valid and offer a new recovery request.
- Passwords shorter than six characters or not matching: inline validation; no update request.
- Successful password update: remove recovery data and return to login with confirmation.

## Testing

Automated tests will cover:

- the login-page recovery link and public routes;
- generic recovery-request responses and email normalization;
- correct production and local redirect construction;
- no account-existence disclosure;
- recovery token extraction and prompt URL cleanup;
- password length and confirmation validation;
- successful password update and login confirmation;
- missing, expired and rejected recovery tokens;
- preservation of existing login, registration and authenticated-session behaviour.

The full test suite and production build must pass before the branch is pushed.

## Deployment requirement

Add the deployed reset URL to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs**:

`https://fly-the-farm-dashboard-sable.vercel.app/reset-password`

Preview URLs may be added separately when recovery-email testing is required on a Vercel preview. No database migration is required.
