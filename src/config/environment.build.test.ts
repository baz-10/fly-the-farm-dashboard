// @vitest-environment node

import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';

describe('Vite client environment allowlist', () => {
  let fixtureDirectory: string | undefined;

  afterEach(async () => {
    if (fixtureDirectory) {
      await rm(fixtureDirectory, { recursive: true, force: true });
    }
  });

  it('does not emit unrecognised CRA or Vite server secrets into browser output', async () => {
    const craSecret = 'cra-service-role-secret-for-regression';
    const viteSecret = 'vite-service-role-secret-for-regression';
    fixtureDirectory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'ftf-vite-secret-scan-'))
    );
    const outputDirectory = path.join(fixtureDirectory, 'dist');
    await writeFile(
      path.join(fixtureDirectory, '.env.production'),
      [
        `REACT_APP_SUPABASE_SERVICE_ROLE_KEY=${craSecret}`,
        `VITE_SUPABASE_SERVICE_ROLE_KEY=${viteSecret}`,
      ].join('\n')
    );
    await writeFile(
      path.join(fixtureDirectory, 'index.html'),
      '<div id="root"></div><script type="module" src="/main.ts"></script>'
    );
    await writeFile(
      path.join(fixtureDirectory, 'main.ts'),
      'document.querySelector("#root")!.textContent = JSON.stringify(import.meta.env);'
    );

    await build({
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      root: fixtureDirectory,
      build: {
        emptyOutDir: true,
        outDir: outputDirectory,
      },
      logLevel: 'silent',
    });

    const outputFiles = await readdir(outputDirectory, { recursive: true });
    const browserOutput = (
      await Promise.all(
        outputFiles
          .filter((file) => /\.(?:css|html|js)$/.test(file))
          .map((file) => readFile(path.join(outputDirectory, file), 'utf8'))
      )
    ).join('\n');

    expect(browserOutput).not.toContain(craSecret);
    expect(browserOutput).not.toContain(viteSecret);
  }, 30_000);
});
