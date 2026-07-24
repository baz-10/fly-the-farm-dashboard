import { describe, expect, it } from 'vitest';
import {
  clientEnvironment,
  getPersistenceModeFromEnvironment,
  getPublicAssetUrl,
  isDevelopmentEnvironment,
  readClientEnvironment,
} from './environment';

describe('readClientEnvironment', () => {
  it('reads only the exact browser environment keys supported by CRA', () => {
    expect(readClientEnvironment({
      REACT_APP_PERSISTENCE_MODE: 'remote',
      NODE_ENV: 'development',
      PUBLIC_URL: '/dashboard',
    })).toEqual({ persistenceMode: 'remote', isDevelopment: true, publicBaseUrl: '/dashboard' });
  });

  it('never exposes unrecognised server secrets', () => {
    expect(JSON.stringify(readClientEnvironment({
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      NODE_ENV: 'production',
      PUBLIC_URL: '/',
    }))).not.toContain('secret');
  });
});

describe('client environment accessors', () => {
  it('reads persistence and development values from the filtered client environment', () => {
    const originalEnvironment = { ...clientEnvironment };
    Object.assign(clientEnvironment, { persistenceMode: 'remote', isDevelopment: true });

    try {
      expect(getPersistenceModeFromEnvironment()).toBe('remote');
      expect(isDevelopmentEnvironment()).toBe(true);
    } finally {
      Object.assign(clientEnvironment, originalEnvironment);
    }
  });

  it('joins public assets to the Vite base URL without duplicate separators', () => {
    const originalBaseUrl = clientEnvironment.publicBaseUrl;
    clientEnvironment.publicBaseUrl = '/dashboard';

    try {
      expect(getPublicAssetUrl('/pdf.worker.min.js')).toBe('/dashboard/pdf.worker.min.js');
    } finally {
      clientEnvironment.publicBaseUrl = originalBaseUrl;
    }
  });
});
