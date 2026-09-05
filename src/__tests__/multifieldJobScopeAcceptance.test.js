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

test('proves every operational create command before exact-ID persistence verification', () => {
  const source = acceptanceSpec();

  for (const [variable, resource, label] of [
    ['client', 'clients', 'label'],
    ['property', 'properties', 'label'],
    ['field', 'fields', 'label'],
    ['secondaryProperty', 'properties', 'secondaryLabel'],
    ['secondaryField', 'fields', 'secondaryLabel'],
    ['job', 'jobs', 'label'],
    ['mission', 'missions', 'label'],
  ]) {
    const command = source.indexOf(`const ${variable}CreateResponse = await runSingleAuthoritativeCommand`);
    const created = source.indexOf(`const created${variable[0].toUpperCase()}${variable.slice(1)} = validateCreatedOperationalRecordResponse`, command);
    const retainedForCleanup = source.indexOf(`records.${variable} = created${variable[0].toUpperCase()}${variable.slice(1)};`, created);
    const exactRead = source.indexOf(`\`/api/v1/${resource}?id=\${encodeURIComponent(created${variable[0].toUpperCase()}${variable.slice(1)}.id)}\``, created);
    const persisted = source.indexOf(`records.${variable} = validatePersistedOperationalRecordResponse`, exactRead);

    expect(command).toBeGreaterThan(-1);
    expect(created).toBeGreaterThan(command);
    expect(retainedForCleanup).toBeGreaterThan(created);
    expect(exactRead).toBeGreaterThan(retainedForCleanup);
    expect(persisted).toBeGreaterThan(exactRead);
    expect(source.slice(created, persisted)).toContain(`, ${label},`);
  }

  expect(source).not.toContain('findAcceptanceRecord(');
});
