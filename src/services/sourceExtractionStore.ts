import { SourceExtraction } from "../types/sourceExtraction";

const STORAGE_KEY = "ftf-source-extractions";

function loadAll(): SourceExtraction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(records: SourceExtraction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function saveExtraction(record: SourceExtraction): void {
  const all = loadAll();
  all.push(record);
  saveAll(all);
}

export function getExtractionsForChemical(chemical: string): SourceExtraction[] {
  const key = chemical.toLowerCase().trim();
  return loadAll().filter(
    (r) => r.chemical.toLowerCase().trim() === key
  );
}

export function getLatestExtraction(
  chemical: string,
  sourceDocumentType: "label" | "sds"
): SourceExtraction | null {
  const matches = getExtractionsForChemical(chemical).filter(
    (r) => r.sourceDocumentType === sourceDocumentType
  );
  if (matches.length === 0) return null;
  // Sort by extractedAt descending, return newest
  matches.sort((a, b) => b.extractedAt.localeCompare(a.extractedAt));
  return matches[0];
}

export function getAllExtractions(): SourceExtraction[] {
  return loadAll();
}
