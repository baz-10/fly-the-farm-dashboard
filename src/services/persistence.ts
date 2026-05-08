export const PERSISTENCE_KEYS = {
  actuals: 'ftf_actuals',
  aircraft: 'ftf_aircraft_data',
  askFtfReports: 'ftf-askftf-reports',
  clients: 'ftf_clients',
  fields: 'ftf_fields',
  jobs: 'ftf_jobs',
  kits: 'ftf_kits',
  missionTemplates: 'ftf_mission_templates',
  missions: 'ftf_missions',
  outcomes: 'ftf_outcomes',
  properties: 'ftf_properties',
  quoteConfig: 'ftf_quote_config',
  quotes: 'ftf_quotes',
  savedChemicals: 'ftf_saved_chemicals',
  session: 'ftf_session',
  users: 'ftf_users',
} as const;

export type PersistenceMode = 'local' | 'remote';

export function getPersistenceMode(): PersistenceMode {
  return process.env.REACT_APP_PERSISTENCE_MODE === 'remote' ? 'remote' : 'local';
}

export function readCollection<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function writeCollection<T>(key: string, data: T[]): void {
  localStorage.setItem(key, JSON.stringify(data));
}

export function readRecordMap<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}

export function writeRecordMap<T>(key: string, data: Record<string, T>): void {
  localStorage.setItem(key, JSON.stringify(data));
}
