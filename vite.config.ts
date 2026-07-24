import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { localApiPlugin } from './server/localApiMiddleware';

function normalisePublicBaseUrl(value: string | undefined): string {
  const path = value?.trim().replace(/^\/+|\/+$/g, '');
  return path ? `/${path}/` : '/';
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), '');
  const persistenceMode =
    environment.VITE_PERSISTENCE_MODE ?? environment.REACT_APP_PERSISTENCE_MODE ?? 'local';
  const publicBaseUrl = normalisePublicBaseUrl(
    environment.VITE_PUBLIC_URL ?? environment.PUBLIC_URL
  );

  return {
    plugins: [react(), localApiPlugin()],
    base: publicBaseUrl,
    envPrefix: '__FTF_NO_AUTOMATIC_CLIENT_ENV__',
    define: {
      'process.env.REACT_APP_PERSISTENCE_MODE': JSON.stringify(persistenceMode),
      'process.env.NODE_ENV': JSON.stringify(mode === 'development' ? 'development' : 'production'),
      'process.env.PUBLIC_URL': JSON.stringify(publicBaseUrl),
    },
    build: {
      outDir: 'dist',
      target: 'es2022',
    },
    test: {
      environment: 'jsdom',
    },
  };
});
