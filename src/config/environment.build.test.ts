// @vitest-environment node

import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'vite';

describe('Vite client environment allowlist', () => {
  const originalPublicUrl = process.env.VITE_PUBLIC_URL;
  let fixtureDirectory: string | undefined;

  afterEach(async () => {
    if (originalPublicUrl === undefined) {
      delete process.env.VITE_PUBLIC_URL;
    } else {
      process.env.VITE_PUBLIC_URL = originalPublicUrl;
    }

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

  it('normalises a non-root public URL across public and generated assets', async () => {
    process.env.VITE_PUBLIC_URL = '/dashboard';
    fixtureDirectory = await realpath(
      await mkdtemp(path.join(tmpdir(), 'ftf-vite-base-path-'))
    );
    const outputDirectory = path.join(fixtureDirectory, 'dist');
    await writeFile(
      path.join(fixtureDirectory, 'index.html'),
      [
        '<link rel="icon" href="%BASE_URL%favicon.ico">',
        '<link rel="apple-touch-icon" href="%BASE_URL%logo192.png">',
        '<link rel="manifest" href="%BASE_URL%manifest.json">',
        '<div id="root"></div>',
        '<script type="module" src="/main.ts"></script>',
      ].join('')
    );
    await writeFile(
      path.join(fixtureDirectory, 'main.ts'),
      [
        "import './style.css';",
        'document.body.dataset.publicBase = import.meta.env.BASE_URL;',
      ].join('\n')
    );
    await writeFile(path.join(fixtureDirectory, 'style.css'), 'body { color: #123456; }');

    await build({
      configFile: path.resolve(process.cwd(), 'vite.config.ts'),
      root: fixtureDirectory,
      build: {
        emptyOutDir: true,
        outDir: outputDirectory,
      },
      logLevel: 'silent',
    });

    const html = await readFile(path.join(outputDirectory, 'index.html'), 'utf8');
    expect(html).toContain('href="/dashboard/favicon.ico"');
    expect(html).toContain('href="/dashboard/logo192.png"');
    expect(html).toContain('href="/dashboard/manifest.json"');
    expect(html).toMatch(/src="\/dashboard\/assets\/[^"]+\.js"/);
    expect(html).toMatch(/href="\/dashboard\/assets\/[^"]+\.css"/);

    const outputFiles = await readdir(path.join(outputDirectory, 'assets'));
    const javaScript = (
      await Promise.all(
        outputFiles
          .filter((file) => file.endsWith('.js'))
          .map((file) => readFile(path.join(outputDirectory, 'assets', file), 'utf8'))
      )
    ).join('\n');
    expect(javaScript).toContain('dataset.publicBase="/dashboard/"');
  }, 30_000);
});
