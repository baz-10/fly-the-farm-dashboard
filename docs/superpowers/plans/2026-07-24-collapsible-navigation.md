# Collapsible Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long flat navigation list with role-aware, accessible, remembered navigation groups while keeping daily operations and the active route easy to reach.

**Architecture:** Define navigation data separately from rendering, use a small local preference service keyed by authenticated user ID, and render grouped navigation through a focused accordion component. `Layout` remains responsible for desktop/mobile shells and routing.

**Tech Stack:** React 19, TypeScript 4.9, Material UI 7, React Router 6 (restored to React Router 7 in the Vite/Vitest migration), Jest, React Testing Library.

## Global Constraints

- Daily operations is expanded for a new user.
- Multiple groups can remain expanded.
- The active route's group always opens.
- Expansion state is remembered per user and persistence failure cannot block navigation.
- Role filtering happens before group rendering; empty groups are hidden.
- Compact desktop navigation uses collapsible icon headings, retains tooltips, and keeps the active route's group open.
- Touch, keyboard and screen-reader behavior must be tested.

---

## File structure

- Create `src/navigation/navigationConfig.tsx`: group/item definitions, role filtering and active-route helpers.
- Create `src/services/navigationPreferenceStore.ts`: safe per-user expansion-state persistence.
- Create `src/components/navigation/GroupedNavigation.tsx`: expanded accordion and compact rail rendering.
- Create tests beside each new unit.
- Modify `src/components/Layout.tsx`: consume the grouped component and remove flat navigation data/rendering.

### Task 1: Navigation configuration

**Files:**
- Create: `src/navigation/navigationConfig.tsx`
- Test: `src/navigation/__tests__/navigationConfig.test.tsx`

**Interfaces:**
- Produces: `NavigationGroup`, `NavigationItem`, `NAVIGATION_GROUPS`, `getVisibleNavigationGroups(role)`, `isRouteActive(pathname, path)`, and `getActiveGroupId(pathname, groups)`.

- [ ] **Step 1: Write the failing configuration tests**

```tsx
import { getActiveGroupId, getVisibleNavigationGroups } from '../navigationConfig';

test('orders daily operations first and hides empty unauthorised groups', () => {
  const groups = getVisibleNavigationGroups('client');
  expect(groups[0].id).toBe('daily');
  expect(groups.flatMap(group => group.items).every(item => item.roles.includes('client'))).toBe(true);
  expect(groups.every(group => group.items.length > 0)).toBe(true);
});

test('finds the group for nested active routes', () => {
  expect(getActiveGroupId('/missions/mission-1', getVisibleNavigationGroups('admin'))).toBe('daily');
});
```

- [ ] **Step 2: Run the test and verify the missing-module failure**

Run: `npm test -- --watchAll=false src/navigation/__tests__/navigationConfig.test.tsx`

Expected: FAIL because `navigationConfig` does not exist.

- [ ] **Step 3: Implement the typed configuration**

```tsx
export type NavigationGroupId = 'daily' | 'resources' | 'safety' | 'commercial' | 'support';

export interface NavigationItem {
  label: string;
  shortLabel: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  items: NavigationItem[];
}

export function getVisibleNavigationGroups(role?: UserRole): NavigationGroup[] {
  return NAVIGATION_GROUPS
    .map(group => ({ ...group, items: group.items.filter(item => !role || item.roles.includes(role)) }))
    .filter(group => group.items.length > 0);
}

export function getActiveGroupId(pathname: string, groups: NavigationGroup[]): NavigationGroupId | undefined {
  return groups.find(group => group.items.some(item => isRouteActive(pathname, item.path)))?.id;
}
```

Populate the five groups and exact item order from the approved design.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --watchAll=false src/navigation/__tests__/navigationConfig.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/navigation
git commit -m "feat: define grouped dashboard navigation"
```

### Task 2: Per-user expansion preferences

**Files:**
- Create: `src/services/navigationPreferenceStore.ts`
- Test: `src/services/__tests__/navigationPreferenceStore.test.ts`

**Interfaces:**
- Consumes: `NavigationGroupId`.
- Produces: `readNavigationExpansion(userId): NavigationGroupId[]` and `writeNavigationExpansion(userId, groupIds): void`.

- [ ] **Step 1: Write failure-tolerant storage tests**

```ts
test('keeps preferences separate by user', () => {
  writeNavigationExpansion('user-a', ['daily', 'safety']);
  expect(readNavigationExpansion('user-a')).toEqual(['daily', 'safety']);
  expect(readNavigationExpansion('user-b')).toEqual([]);
});

test('returns an empty preference when storage is malformed', () => {
  localStorage.setItem('ftf_navigation_groups:user-a', '{bad');
  expect(readNavigationExpansion('user-a')).toEqual([]);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- --watchAll=false src/services/__tests__/navigationPreferenceStore.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement safe storage**

```ts
const prefix = 'ftf_navigation_groups';

export function readNavigationExpansion(userId: string): NavigationGroupId[] {
  try {
    const value = JSON.parse(localStorage.getItem(`${prefix}:${userId}`) || '[]');
    return Array.isArray(value) ? value.filter(isNavigationGroupId) : [];
  } catch {
    return [];
  }
}

export function writeNavigationExpansion(userId: string, groupIds: NavigationGroupId[]): void {
  try {
    localStorage.setItem(`${prefix}:${userId}`, JSON.stringify([...new Set(groupIds)]));
  } catch {
    // Preferences are non-critical; navigation remains usable.
  }
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --watchAll=false src/services/__tests__/navigationPreferenceStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/navigationPreferenceStore.ts src/services/__tests__/navigationPreferenceStore.test.ts
git commit -m "feat: remember navigation groups per user"
```

### Task 3: Accessible grouped navigation component

**Files:**
- Create: `src/components/navigation/GroupedNavigation.tsx`
- Test: `src/components/navigation/__tests__/GroupedNavigation.test.tsx`

**Interfaces:**
- Consumes: `{ expanded: boolean; pathname: string; role?: UserRole; userId: string; onNavigate(path: string): void }`.
- Produces: accessible collapsible grouped navigation for drawer and compact rail.

- [ ] **Step 1: Write interaction and accessibility tests**

```tsx
test('opens daily and active groups and permits multiple open groups', async () => {
  render(<GroupedNavigation expanded pathname="/maintenance" role="contractor" userId="u1" onNavigate={jest.fn()} />);
  expect(screen.getByRole('button', { name: /daily operations/i })).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByRole('button', { name: /operational resources/i })).toHaveAttribute('aria-expanded', 'true');
  await userEvent.click(screen.getByRole('button', { name: /safety and compliance/i }));
  expect(screen.getByRole('link', { name: /compliance/i })).toBeVisible();
  expect(screen.getByRole('link', { name: /maintenance/i })).toBeVisible();
});

test('calls onNavigate from a keyboard-operable item', async () => {
  const onNavigate = jest.fn();
  render(<GroupedNavigation expanded pathname="/" role="admin" userId="u1" onNavigate={onNavigate} />);
  await userEvent.click(screen.getByRole('link', { name: 'Missions' }));
  expect(onNavigate).toHaveBeenCalledWith('/missions');
});

test('compact groups hide child tiles until expanded', async () => {
  render(<GroupedNavigation expanded={false} pathname="/" role="admin" userId="u1" onNavigate={jest.fn()} />);
  expect(screen.queryByRole('link', { name: /maintenance/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /operational resources/i }));
  expect(screen.getByRole('link', { name: /maintenance/i })).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -- --watchAll=false src/components/navigation/__tests__/GroupedNavigation.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement group state and rendering**

Use a `Set<NavigationGroupId>` initialised from stored preferences plus `daily` plus the active group. Render headings as `ListItemButton` elements with `aria-expanded` and `aria-controls`; render their child list inside MUI `Collapse unmountOnExit`. On route change, add the active group without closing others. In compact mode, show icon-only group headings with accessible labels and tooltips; collapsed groups remove their child tiles, while Daily operations and the active group remain open.

- [ ] **Step 4: Run component tests**

Run: `npm test -- --watchAll=false src/components/navigation/__tests__/GroupedNavigation.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/navigation
git commit -m "feat: add accessible collapsible navigation"
```

### Task 4: Integrate with Layout and verify release

**Files:**
- Modify: `src/components/Layout.tsx`
- Create: `src/components/__tests__/Layout.navigation.test.tsx`

**Interfaces:**
- Consumes: `GroupedNavigation`.
- Produces: grouped navigation in mobile drawer and compact desktop rail.

- [ ] **Step 1: Add a Layout regression test**

Mock `useAuth` with an admin, render `Layout` inside a memory router, open the mobile menu, and assert the five headings appear, Daily operations is expanded, and clicking Weather navigates to `/weather`.

- [ ] **Step 2: Run the regression test and verify the old flat layout fails**

Run: `npm test -- --watchAll=false src/components/__tests__/Layout.navigation.test.tsx`

Expected: FAIL because group headings are absent.

- [ ] **Step 3: Replace flat navigation code**

Remove `NAV_ITEMS`, `isRouteActive`, and `navList` from `Layout.tsx`. Render:

```tsx
<GroupedNavigation
  expanded={expanded}
  pathname={location.pathname}
  role={user?.role}
  userId={user?.id || 'anonymous'}
  onNavigate={navigateAndClose}
/>
```

Keep search, account, logout, drawer behavior, logo and main content unchanged.

- [ ] **Step 4: Run release verification**

Run:

```bash
npm test -- --watchAll=false src/navigation src/services/__tests__/navigationPreferenceStore.test.ts src/components/navigation src/components/__tests__/Layout.navigation.test.tsx
npm test -- --watchAll=false
npm run build
```

Expected: all tests PASS and production build completes.

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout.tsx src/components/__tests__/Layout.navigation.test.tsx
git commit -m "feat: enable grouped dashboard navigation"
```
