export interface ClientEnvironment {
  persistenceMode: 'local' | 'remote';
  isDevelopment: boolean;
  publicBaseUrl: string;
}

export function readClientEnvironment(source: Record<string, unknown>): ClientEnvironment {
  return {
    persistenceMode: source.VITE_PERSISTENCE_MODE === 'remote' ? 'remote' : 'local',
    isDevelopment: source.MODE === 'development',
    publicBaseUrl: typeof source.BASE_URL === 'string' ? source.BASE_URL : '/',
  };
}

export const clientEnvironment = readClientEnvironment({
  VITE_PERSISTENCE_MODE: import.meta.env.VITE_PERSISTENCE_MODE,
  MODE: import.meta.env.MODE,
  BASE_URL: import.meta.env.BASE_URL,
});

export function getPersistenceModeFromEnvironment(): ClientEnvironment['persistenceMode'] {
  return clientEnvironment.persistenceMode;
}

export function isDevelopmentEnvironment(): boolean {
  return clientEnvironment.isDevelopment;
}

export function getPublicAssetUrl(path: string): string {
  const baseUrl = clientEnvironment.publicBaseUrl.endsWith('/')
    ? clientEnvironment.publicBaseUrl
    : `${clientEnvironment.publicBaseUrl}/`;
  return `${baseUrl}${path.replace(/^\/+/, '')}`;
}
