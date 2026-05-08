import { JobActual } from '../types/financials';
import { PERSISTENCE_KEYS, readCollection, writeCollection } from './persistence';

const ACTUALS_KEY = PERSISTENCE_KEYS.actuals;

function load(): JobActual[] {
  return readCollection<JobActual>(ACTUALS_KEY);
}

function save(actuals: JobActual[]): void {
  writeCollection(ACTUALS_KEY, actuals);
}

export function getActuals(contractorUserId: string): JobActual[] {
  return load().filter((a) => a.contractorUserId === contractorUserId);
}

export function getActualById(id: string): JobActual | undefined {
  return load().find((a) => a.id === id);
}

export function getActualByJobId(jobId: string): JobActual | undefined {
  return load().find((a) => a.jobId === jobId);
}

export function getActualByQuoteId(quoteId: string): JobActual | undefined {
  return load().find((a) => a.quoteId === quoteId);
}

export function saveActual(
  data: Omit<JobActual, 'id' | 'createdAt' | 'updatedAt'>,
): JobActual {
  const all = load();
  const now = new Date().toISOString();
  const actual: JobActual = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  all.push(actual);
  save(all);
  return actual;
}

export function updateActual(
  id: string,
  updates: Partial<JobActual>,
): JobActual | undefined {
  const all = load();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  save(all);
  return all[idx];
}

export function deleteActual(id: string): void {
  save(load().filter((a) => a.id !== id));
}

export function getFinancialsSummary(contractorUserId: string) {
  const actuals = getActuals(contractorUserId).filter((a) => a.status === 'finalised');
  const totalRevenue = actuals.reduce((s, a) => s + a.revenue, 0);
  const totalCosts = actuals.reduce((s, a) => s + a.totalCost, 0);
  const avgMargin = actuals.length > 0
    ? actuals.reduce((s, a) => s + a.grossMarginPercent, 0) / actuals.length
    : 0;
  return {
    count: actuals.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalCosts: Math.round(totalCosts * 100) / 100,
    totalProfit: Math.round((totalRevenue - totalCosts) * 100) / 100,
    avgMargin: Math.round(avgMargin * 10) / 10,
  };
}
