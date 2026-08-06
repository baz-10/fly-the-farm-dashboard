export const ACCEPTANCE_PREFIX = 'SC ACCEPTANCE —';

type EnvironmentSource = Record<string, string | undefined>;

export interface AcceptanceEnvironment {
  baseUrl: string;
  email: string;
  password: string;
  acceptancePrefix: typeof ACCEPTANCE_PREFIX;
}

export function acceptanceEnvironment(source: EnvironmentSource = process.env): AcceptanceEnvironment {
  const baseUrl = source.E2E_BASE_URL?.trim() || 'http://127.0.0.1:3000';
  const email = source.E2E_ORGANISATION_EMAIL?.trim();
  const password = source.E2E_ORGANISATION_PASSWORD;
  if (!email || !password) throw new Error('E2E_ORGANISATION_EMAIL and E2E_ORGANISATION_PASSWORD are required.');
  const parsed = new URL(baseUrl);
  const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (!local && parsed.protocol !== 'https:') throw new Error('Remote browser acceptance requires HTTPS.');
  return { baseUrl: parsed.origin, email, password, acceptancePrefix: ACCEPTANCE_PREFIX };
}
