export interface ClientEnvironment {
  persistenceMode: 'local' | 'remote';
  isDevelopment: boolean;
  publicBaseUrl: string;
}

export function readClientEnvironment(source: Record<string, unknown>): ClientEnvironment {
  const mode = source.VITE_PERSISTENCE_MODE ?? source.REACT_APP_PERSISTENCE_MODE;
  return {
    persistenceMode: mode === 'remote' ? 'remote' : 'local',
    isDevelopment: source.MODE === 'development',
    publicBaseUrl: typeof source.BASE_URL === 'string' ? source.BASE_URL : '/',
  };
}

export const clientEnvironment = readClientEnvironment(import.meta.env);

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
