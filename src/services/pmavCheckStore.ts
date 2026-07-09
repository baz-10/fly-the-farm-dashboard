import { SavedVegetationCheck, VegetationSummary } from '../types/pmav';
import { sanitizeLotPlan } from './pmavService';
import { getPersistenceMode, PERSISTENCE_KEYS, readSharedCollection, writeSharedCollection } from './persistence';

const STORAGE_KEY = PERSISTENCE_KEYS.pmavChecks;

function loadChecks(): SavedVegetationCheck[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChecks(checks: SavedVegetationCheck[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(checks));
}

function sortChecks(checks: SavedVegetationCheck[]): SavedVegetationCheck[] {
  return checks.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
}

export function getSavedVegetationChecks(): SavedVegetationCheck[] {
  if (getPersistenceMode() === 'remote') return [];
  return sortChecks(loadChecks());
}

export async function loadSavedVegetationChecks(): Promise<SavedVegetationCheck[]> {
  return sortChecks(await readSharedCollection<SavedVegetationCheck>(STORAGE_KEY));
}

export function getLatestVegetationCheckForLotPlan(lotPlan: string): SavedVegetationCheck | undefined {
  const cleanLotPlan = sanitizeLotPlan(lotPlan);
  if (!cleanLotPlan) return undefined;
  return getSavedVegetationChecks().find((check) => sanitizeLotPlan(check.lotPlan) === cleanLotPlan);
}

export function saveVegetationCheck(
  summary: VegetationSummary,
  context: { propertyId?: string; fieldId?: string } = {}
): SavedVegetationCheck {
  const checks = loadChecks();
  const saved: SavedVegetationCheck = {
    ...summary,
    ...context,
    id: `pmav_${Date.now()}`,
  };

  const nextChecks = [
    saved,
    ...checks.filter((check) => check.lotPlan !== saved.lotPlan || check.propertyId !== saved.propertyId),
  ].slice(0, 30);

  saveChecks(nextChecks);
  return saved;
}

export async function saveVegetationCheckAsync(
  summary: VegetationSummary,
  context: { propertyId?: string; fieldId?: string } = {}
): Promise<SavedVegetationCheck> {
  if (getPersistenceMode() === 'local') {
    const saved = saveVegetationCheck(summary, context);
    await writeSharedCollection(STORAGE_KEY, getSavedVegetationChecks());
    return saved;
  }

  const checks = await loadSavedVegetationChecks();
  const saved: SavedVegetationCheck = {
    ...summary,
    ...context,
    id: `pmav_${Date.now()}`,
  };
  const nextChecks = [
    saved,
    ...checks.filter((check) => check.lotPlan !== saved.lotPlan || check.propertyId !== saved.propertyId),
  ].slice(0, 30);
  await writeSharedCollection(STORAGE_KEY, nextChecks);
  return saved;
}
