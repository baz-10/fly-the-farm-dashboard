# Vite Task 4 Report

## Scope

Configured Vitest and migrated only the utility, service, and hook suites:

- added `vitest.config.ts` with jsdom, globals, the shared setup file, explicit
  test inclusion, and automatic mock clearing/restoration;
- changed `npm test` from the CRA runner to Vitest;
- switched `src/setupTests.ts` to `@testing-library/jest-dom/vitest`;
- added a recursive baseline inventory manifest and its regression test;
- converted Jest globals and mock types in `src/utils/__tests__`,
  `src/services/__tests__`, and `src/hooks/__tests__` to Vitest.

No production behavior or out-of-scope test suite was changed.

## Inventory

The accepted pre-migration baseline remains:

- 56 test files;
- 219 declared `test`/`it` calls in the current baseline files (parameterized
  declarations expand to additional runtime cases).

The manifest separately reports the two Vite environment verification files
added after that accepted baseline:

- `src/config/environment.build.test.ts`
- `src/config/environment.test.ts`

They are not ignored by Vitest and remain part of normal runner discovery.

## TDD Evidence

### RED

Command:

```bash
npx vitest run scripts/test-inventory.test.ts
```

Observed expected failure:

```text
FAIL scripts/test-inventory.test.ts
Failed to resolve import "./test-inventory.mjs"
Test Files 1 failed (1)
```

The test failed because the inventory implementation did not yet exist.

### GREEN

After adding the inventory collector and Vitest configuration:

```text
Test Files 1 passed (1)
Tests 1 passed (1)
```

The migrated suite then passed:

```bash
npx vitest run src/utils src/services src/hooks scripts/test-inventory.test.ts
```

```text
Test Files 32 passed (32)
Tests 133 passed (133)
```

## Verification

The required command passed:

```bash
npx vitest run src/utils src/services src/hooks scripts/test-inventory.test.ts
```

The public script also passed with the same selection:

```bash
npm test -- --run src/utils src/services src/hooks scripts/test-inventory.test.ts
```

```text
Test Files 32 passed (32)
Tests 133 passed (133)
```

The scoped TypeScript check passed:

```bash
npx tsc --noEmit --allowJs --target ES2022 \
  --lib dom,dom.iterable,esnext --module esnext --moduleResolution node \
  --jsx react-jsx --esModuleInterop --allowSyntheticDefaultImports \
  --strict --skipLibCheck --types node,vite/client,vitest/globals \
  src/react-app-env.d.ts src/types/shpjs.d.ts src/setupTests.ts \
  scripts/test-inventory.mjs scripts/test-inventory.test.ts \
  src/utils/__tests__/*.test.ts src/services/__tests__/*.test.ts \
  src/hooks/__tests__/*.test.tsx
```

Production build verification passed:

```bash
npx vite build
```

```text
✓ 12587 modules transformed.
✓ built in 6.37s
```

`git diff --check` also passed.

## Sequencing Note

Repository-wide `npx tsc --noEmit` currently reports only the known Jest
globals in the component, context, page, and API suites assigned to Tasks 5
and 6. This task did not broaden scope by modifying those suites. The scoped
TypeScript command above proves the files migrated in Task 4 compile cleanly.

## Warnings

The production build retains the existing `pdfjs-dist` eval warning and large
bundle chunk warning. Neither was introduced by this test-runner migration.

## Commit

Pending at report creation; populated after commit.
