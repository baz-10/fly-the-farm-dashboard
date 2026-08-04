# Authentication Lifecycle UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an unobstructed responsive login action layout and an authentication-first password creation/recovery lifecycle.

**Architecture:** Keep the React authentication pages and versioned `/api/auth` contract. Separate callback-token validation/password update from identity resolution, then establish the application session only after password update succeeds.

**Tech Stack:** React, TypeScript, Material UI, Jest, Testing Library, Vercel serverless API, Supabase Auth.

## Global Constraints

- No manual database intervention for ordinary platform-administrator onboarding.
- No identity-plane resolution before password creation or replacement succeeds.
- No negative spacing or absolute positioning for login actions.
- Preserve account-enumeration-safe recovery responses.

---

### Task 1: Responsive authentication actions

**Files:**
- Modify: `src/pages/Login.tsx`
- Test: `src/pages/Login.test.tsx`

**Interfaces:**
- Consumes: React Router links and existing `useAuth().login`.
- Produces: ordered `Sign In`, `Forgot password?`, divider, and `Create account` actions.

- [ ] Write a failing test asserting action order, separate containers, and non-negative normal-flow styles at mobile, tablet, and desktop widths.
- [ ] Run `CI=true npm test -- --runInBand --watchAll=false src/pages/Login.test.tsx` and confirm RED.
- [ ] Replace the negative-margin typography with explicit normal-flow action rows and a divider.
- [ ] Re-run the focused test and confirm GREEN.
- [ ] Commit with `IMP-PLT-004`.

### Task 2: Authentication-first callback lifecycle

**Files:**
- Modify: `src/pages/AuthCallback.tsx`
- Modify: `src/pages/ResetPassword.tsx`
- Modify: `api/auth.js`
- Test: `src/pages/AuthLifecycle.test.tsx`
- Test: `src/__tests__/authenticated-auth-api.test.ts`

**Interfaces:**
- Consumes: Supabase callback tokens and existing `resetPassword(password, accessToken, refreshToken, expiresIn)` client call.
- Produces: invitation/recovery password choice and post-update identity resolution.

- [ ] Add failing callback tests proving `invite` and `recovery` render password choice without `completeSession`.
- [ ] Add a failing API ordering test proving password update precedes identity lookup and that authentication errors are returned unchanged.
- [ ] Run the focused tests and confirm RED.
- [ ] Route invite/recovery callbacks to `ResetPassword` and change server reset ordering to validate token, update password, then resolve identity.
- [ ] Make the success action return to Sign In or the resolved workspace without premature identity messaging.
- [ ] Re-run focused tests and confirm GREEN.
- [ ] Commit with `IMP-PLT-005`.

### Task 3: Release verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes: committed authentication correction.
- Produces: deployed Production Beta evidence.

- [ ] Run the complete test suite, production build, secret scan, and worktree checks.
- [ ] Push `codex/production-beta` without force.
- [ ] Deploy to Spray Command Production Beta and confirm READY.
- [ ] Verify login layout at desktop, tablet, and mobile sizes.
- [ ] Verify recovery request and callback behavior without exposing tokens.
- [ ] Verify Platform and Organisation routing and confirm no platform tenant linkage was created.

