export interface ClientEnvironment {
  persistenceMode: 'local' | 'remote';
  isDevelopment: boolean;
  publicBaseUrl: string;
}

export function readClientEnvironment(source: Record<string, unknown>): ClientEnvironment {
  return {
    persistenceMode: source.REACT_APP_PERSISTENCE_MODE === 'remote' ? 'remote' : 'local',
    isDevelopment: source.NODE_ENV === 'development',
    publicBaseUrl: typeof source.PUBLIC_URL === 'string' ? source.PUBLIC_URL : '/',
  };
}

export const clientEnvironment = readClientEnvironment({
  REACT_APP_PERSISTENCE_MODE: process.env.REACT_APP_PERSISTENCE_MODE,
  NODE_ENV: process.env.NODE_ENV,
  PUBLIC_URL: process.env.PUBLIC_URL,
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
