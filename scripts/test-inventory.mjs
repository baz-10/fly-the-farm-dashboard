import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const TEST_FILE_PATTERN = /\.test\.(?:ts|tsx|js|jsx)$/;
const DECLARED_TEST_PATTERN = /\b(?:it|test)(?:\.(?:each|skip|only|todo))?\s*\(/g;

// These checks were introduced after the accepted 52e6ace source baseline.
// Keep them explicit so the historical inventory remains exactly comparable.
const POST_BASELINE_TEST_FILES = new Set([
  'src/__tests__/route-manifest.test.tsx',
  'src/config/environment.build.test.ts',
  'src/config/environment.test.ts',
  'src/__tests__/authenticated-safety-plan-api.test.ts',
  'src/__tests__/safety-plan-authority-api.test.ts',
  'src/App.safetyPlanProvider.test.tsx',
  'src/components/safety-plan/SafetyPlanAuthorityManager.test.tsx',
  'src/components/safety-plan/SafetyPlanApprovalPanel.test.tsx',
  'src/components/safety-plan/SafetyPlanAttachments.test.tsx',
  'src/contexts/__tests__/SafetyPlanContext.test.tsx',
  'src/pages/SafetyPlanRegister.test.tsx',
  'src/pages/SafetyPlanEditor.test.tsx',
  'src/pages/SafetyPlanTemplateEditor.test.tsx',
  'src/services/__tests__/persistence.safetyPlan.test.ts',
  'src/services/__tests__/safetyPlanPrefill.test.ts',
  'src/services/__tests__/safetyPlanApproval.test.ts',
  'src/services/__tests__/safetyPlanAttachments.test.ts',
  'src/services/__tests__/safetyPlanRepository.test.ts',
  'src/services/__tests__/safetyPlanTemplateRepository.test.ts',
  'src/utils/__tests__/safetyPlanPermissions.test.ts',
  'src/utils/__tests__/safetyPlanRules.test.ts',
  'src/utils/__tests__/safetyPlanSourceSync.test.ts',
]);

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findTestFiles(entryPath);
      return TEST_FILE_PATTERN.test(entry.name) ? [entryPath] : [];
    })
  );

  return files.flat();
}

function normalisePath(filePath) {
  return filePath.split(path.sep).join('/');
}

export async function collectTestInventory(rootDirectory) {
  const discoveredFiles = (await findTestFiles(rootDirectory))
    .map(normalisePath)
    .sort();
  const supplementaryFiles = discoveredFiles.filter((file) =>
    POST_BASELINE_TEST_FILES.has(file)
  );
  const files = discoveredFiles.filter((file) => !POST_BASELINE_TEST_FILES.has(file));
  const testsByFile = {};

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    testsByFile[file] = Array.from(source.matchAll(DECLARED_TEST_PATTERN)).length;
  }

  return {
    files,
    declaredTests: Object.values(testsByFile).reduce((total, count) => total + count, 0),
    testsByFile,
    supplementaryFiles,
  };
}
