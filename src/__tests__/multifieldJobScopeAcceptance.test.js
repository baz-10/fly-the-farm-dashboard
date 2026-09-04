const fs = require('fs');
const path = require('path');

const acceptanceSpec = () => fs.readFileSync(path.resolve(
  __dirname,
  '../../e2e/acceptance/client-to-mission.spec.ts',
), 'utf8');

test('keeps responsive field selection and resumed Mission locators on their matching record labels', () => {
  const source = acceptanceSpec();

  expect(source).toMatch(/setViewportSize\(\{ width: 390,[\s\S]*checkbox', \{ name: label \}\)\.check\(\)[\s\S]*setViewportSize\(\{ width: 768,[\s\S]*Add fields from another Property[\s\S]*setViewportSize\(\{ width: 1280,[\s\S]*checkbox', \{ name: secondaryLabel \}\)\.check\(\)/);
  expect(source).toMatch(/openMissionCreationWorkspace\(page\);[\s\S]*combobox', \{ name: 'Client' \}\)\.click\(\);\s*await page\.getByRole\('option', \{ name: label \}\)\.click\(\);[\s\S]*combobox', \{ name: 'Property' \}\)\.click\(\);\s*await page\.getByRole\('option', \{ name: label \}\)\.click\(\);[\s\S]*combobox', \{ name: 'Field' \}\)\.click\(\);\s*await page\.getByRole\('option', \{ name: label \}\)\.click\(\);/);
});
