# Password Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, self-service Supabase password recovery for every account type.

**Architecture:** Extend the existing same-origin `/api/auth` proxy with recovery-email and recovery-token password-update actions. Add two public React routes that reuse the login styling, keep recovery tokens only in memory, and return a completed reset to the existing login flow.

**Tech Stack:** React 19, TypeScript, React Router 7, Material UI 7, Vercel Node functions, Supabase Auth REST API, Vitest and Testing Library.

## Global Constraints

- Recovery is available to administrators, contractors/operators and clients.
- Recovery-request responses must not disclose whether an email address exists.
- The existing six-character password minimum remains unchanged.
- Recovery tokens must not enter local storage, application logs, analytics or persistent application state.
- The Supabase service-role key must not authorize user-driven password updates.
- Existing login, registration, profile, tenant and session-cookie behaviour must remain unchanged.
- The production reset redirect is `https://fly-the-farm-dashboard-sable.vercel.app/reset-password`.
- No database migration and no new browser-side Supabase dependency.

---

### Task 1: Authentication recovery API

**Files:**
- Modify: `api/auth.js`
- Modify: `src/__tests__/authenticated-auth-api.test.ts`

**Interfaces:**
- Consumes: existing `supabaseRequest(path, options)` with `keyType: 'anon'` and optional `accessToken`.
- Produces: `POST /api/auth` action `request-password-reset` with `{ email: string }` and action `update-password` with `{ accessToken: string, password: string }`.

- [ ] **Step 1: Write failing recovery-request API tests**

Add tests proving that the email is normalized, Supabase receives `POST /auth/v1/recover?redirect_to=...`, the request uses the anonymous key, the API returns `{ ok: true }`, and malformed email returns `400`. Add a second request using a different email with the same public success shape to make the non-enumerating contract explicit.

```ts
expect(url).toContain('/auth/v1/recover?redirect_to=');
expect(JSON.parse(String(options.body))).toEqual({ email: 'pilot@example.com' });
expect(res.body).toEqual({ ok: true });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- --run src/__tests__/authenticated-auth-api.test.ts`

Expected: FAIL because `request-password-reset` is an unsupported action.

- [ ] **Step 3: Implement the recovery-email action**

Add `getRecoveryRedirect(req)` using `APP_URL` when configured and otherwise the validated request origin/host. Strip trailing slashes and append `/reset-password`. Call:

```js
await supabaseRequest(
  `auth/v1/recover?redirect_to=${encodeURIComponent(getRecoveryRedirect(req))}`,
  {
    method: 'POST',
    keyType: 'anon',
    body: JSON.stringify({ email }),
    publicMessage: 'Password recovery email could not be sent.',
  }
);
```

Return `{ ok: true }`. Validate the normalized email before contacting Supabase. Do not log the email or alter session cookies.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- --run src/__tests__/authenticated-auth-api.test.ts`

Expected: all authentication API tests pass.

- [ ] **Step 5: Write failing password-update API tests**

Add tests proving that passwords shorter than six characters and missing tokens return `400`, while a valid request sends `PUT /auth/v1/user` with `{ password }`, the anon API key and `Authorization: Bearer recovery-token`.

```ts
expect(options.method).toBe('PUT');
expect(options.headers.Authorization).toBe('Bearer recovery-token');
expect(options.headers.apikey).toBe('anon-key');
```

- [ ] **Step 6: Run the focused tests and verify RED**

Run: `npm test -- --run src/__tests__/authenticated-auth-api.test.ts`

Expected: FAIL because `update-password` is unsupported.

- [ ] **Step 7: Implement the recovery-token password update**

Call `supabaseRequest('auth/v1/user', { method: 'PUT', keyType: 'anon', accessToken, body: JSON.stringify({ password }) })`. Return `{ ok: true }`. Use a safe public error message for expired or rejected tokens and never include the token in logs.

- [ ] **Step 8: Run focused tests and commit**

Run: `npm test -- --run src/__tests__/authenticated-auth-api.test.ts`

Expected: PASS.

Commit: `feat: add password recovery auth API`

---

### Task 2: Recovery token parsing

**Files:**
- Create: `src/utils/passwordRecovery.ts`
- Create: `src/utils/__tests__/passwordRecovery.test.ts`

**Interfaces:**
- Produces: `parseRecoveryFragment(hash: string): { accessToken: string | null; isRecovery: boolean; error: string | null }`.
- Produces: `clearRecoveryUrl(): void` that retains the pathname and ordinary query string but removes the URL fragment.

- [ ] **Step 1: Write failing utility tests**

Cover a valid `#access_token=token&type=recovery` fragment, a non-recovery fragment, a Supabase error fragment, percent-decoding, and URL cleanup.

```ts
expect(parseRecoveryFragment('#access_token=abc&type=recovery')).toEqual({
  accessToken: 'abc',
  isRecovery: true,
  error: null,
});
```

- [ ] **Step 2: Run utility tests and verify RED**

Run: `npm test -- --run src/utils/__tests__/passwordRecovery.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal parser and cleanup**

Use `URLSearchParams` after removing the leading `#`. Treat `type=recovery` plus a non-empty `access_token` as valid. Surface `error_description` or a generic invalid-link message without returning any other fragment data. Implement cleanup with `window.history.replaceState({}, document.title, window.location.pathname + window.location.search)`.

- [ ] **Step 4: Run utility tests and commit**

Run: `npm test -- --run src/utils/__tests__/passwordRecovery.test.ts`

Expected: PASS.

Commit: `feat: parse password recovery links`

---

### Task 3: Authentication context recovery methods

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Create: `src/contexts/__tests__/AuthContext.passwordRecovery.test.tsx`

**Interfaces:**
- Produces: `requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }>`.
- Produces: `updatePassword(accessToken: string, password: string): Promise<{ success: boolean; error?: string }>`.

- [ ] **Step 1: Write failing provider tests**

Render a small test consumer in remote mode, call each method, and assert the exact `/api/auth` JSON action. Verify safe errors are returned when fetch rejects or responds with an error.

- [ ] **Step 2: Run provider tests and verify RED**

Run: `npm test -- --run src/contexts/__tests__/AuthContext.passwordRecovery.test.tsx`

Expected: FAIL because the context methods do not exist.

- [ ] **Step 3: Add typed context methods**

Reuse `requestRemoteAuth` and return the existing `LoginResult` shape. Recovery methods must not mutate `user`, local storage or session state.

- [ ] **Step 4: Run provider tests and commit**

Run: `npm test -- --run src/contexts/__tests__/AuthContext.passwordRecovery.test.tsx`

Expected: PASS.

Commit: `feat: expose password recovery actions`

---

### Task 4: Forgot-password page and login entry point

**Files:**
- Create: `src/pages/ForgotPassword.tsx`
- Create: `src/pages/ForgotPassword.test.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `useAuth().requestPasswordReset(email)`.
- Produces: public route `/forgot-password` and a login-page link with accessible name `Forgot password?`.

- [ ] **Step 1: Write failing UI and route tests**

Test the login link, public route, email validation, disabled loading state and generic success copy. Mock only the Auth context network boundary.

```tsx
expect(await screen.findByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
expect(await screen.findByText(/if an account exists/i)).toBeVisible();
```

- [ ] **Step 2: Run focused UI tests and verify RED**

Run: `npm test -- --run src/pages/ForgotPassword.test.tsx src/App.test.tsx`

Expected: FAIL because the route, page and login link do not exist.

- [ ] **Step 3: Implement the request page and public route**

Reuse the login page's centered card and branding. Provide one email input, **Send recovery email**, generic success state, retry action and **Back to sign in** link. Add `<Route path="/forgot-password" element={<ForgotPassword />} />` outside the protected layout.

- [ ] **Step 4: Run focused UI tests and commit**

Run: `npm test -- --run src/pages/ForgotPassword.test.tsx src/App.test.tsx`

Expected: PASS.

Commit: `feat: add forgot password page`

---

### Task 5: Reset-password page and completion flow

**Files:**
- Create: `src/pages/ResetPassword.tsx`
- Create: `src/pages/ResetPassword.test.tsx`
- Modify: `src/pages/Login.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `parseRecoveryFragment(window.location.hash)`, `clearRecoveryUrl()` and `useAuth().updatePassword(accessToken, password)`.
- Produces: public route `/reset-password`; navigation state `{ passwordReset: true }` for login confirmation.

- [ ] **Step 1: Write failing reset-page tests**

Test immediate fragment cleanup, missing/expired-link messaging, six-character minimum, mismatched confirmation, successful update action, and navigation to login with a visible success alert.

```tsx
expect(mockUpdatePassword).toHaveBeenCalledWith('recovery-token', 'newpass');
expect(await screen.findByText('Your password has been updated. Sign in with your new password.')).toBeVisible();
```

- [ ] **Step 2: Run focused reset tests and verify RED**

Run: `npm test -- --run src/pages/ResetPassword.test.tsx`

Expected: FAIL because the reset page and route do not exist.

- [ ] **Step 3: Implement the reset page and login confirmation**

Capture the parsed token once into component state, clear the fragment immediately, then render two password fields and **Update password**. On success call `navigate('/login', { replace: true, state: { passwordReset: true } })`. Read that state in `Login.tsx` and show the confirmation alert; no token or password enters router state.

- [ ] **Step 4: Run focused reset tests and commit**

Run: `npm test -- --run src/pages/ResetPassword.test.tsx src/App.test.tsx`

Expected: PASS.

Commit: `feat: add secure password reset page`

---

### Task 6: Configuration, regression verification and publishing

**Files:**
- Modify: `.env.example`
- Modify: `README.md` or the existing deployment documentation that owns Supabase setup.

**Interfaces:**
- Produces: documented `APP_URL=https://fly-the-farm-dashboard-sable.vercel.app` and Supabase redirect allow-list instruction.

- [ ] **Step 1: Document deployment configuration**

Add `APP_URL` to `.env.example` without secrets. Document the required Supabase redirect URL:

```text
https://fly-the-farm-dashboard-sable.vercel.app/reset-password
```

- [ ] **Step 2: Run all verification**

Run: `npm test -- --run`

Expected: every test file passes.

Run: `npm run build`

Expected: TypeScript and Vite production build succeed.

Run: `git diff --check`

Expected: no output.

- [ ] **Step 3: Review the complete diff**

Confirm only password recovery, tests, configuration documentation, the design and this plan are included. Confirm no secrets, recovery tokens or user passwords appear in the diff.

- [ ] **Step 4: Commit remaining documentation**

Commit: `docs: configure password recovery redirect`

- [ ] **Step 5: Push and open a draft pull request**

Push `codex/password-reset` to `origin`, then open a draft PR against `main` summarizing the recovery flow, security choices, tests and the required Supabase dashboard redirect setting.
