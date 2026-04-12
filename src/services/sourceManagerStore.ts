import { getChemicalSourceData } from '../ai/sources/getChemicalSourceData';

export interface SourceStatusRecord {
  chemical: string;
  labelAvailable: boolean;
  sdsAvailable: boolean;
  labelUrl: string;
  sdsUrl: string;
  sourceStatus: 'available' | 'partial' | 'not_found';
  lastCheckedAt: string;
  notes: string;
}

export interface SourceFlags {
  stale: boolean;
  missingLabel: boolean;
  missingSds: boolean;
  conflict: boolean;
  healthy: boolean;
  needsAttention: boolean;
}

export interface SourceRecordWithFlags extends SourceStatusRecord {
  flags: SourceFlags;
}

const STORAGE_KEY = 'ftf-source-manager';
const STALE_DAYS = 7;

const DEFAULT_CHEMICALS = [
  'Grazon Extra',
  'Starane',
  'Metsulfuron',
  'Glyphosate',
  '2,4-D',
];

// ─── Name normalisation ──────────────────────────

function normalizeChemicalName(name: string): string {
  return name.toLowerCase().trim().replace(/\s{2,}/g, ' ');
}

// ─── Canonical name mapping ─────────────────────

const CANONICAL_MAP: Record<string, string> = {
  'grazon extra': 'Grazon Extra',
  'grazon extra herbicide': 'Grazon Extra',
  'starane': 'Starane',
  'starane advanced': 'Starane',
  'starane advanced herbicide': 'Starane',
  'metsulfuron': 'Metsulfuron',
  'metsulfuron-methyl': 'Metsulfuron',
  'metsulfuron-methyl 600 wg herbicide': 'Metsulfuron',
  'glyphosate': 'Glyphosate',
  'glyphosate 450 sl herbicide': 'Glyphosate',
  '2,4-d': '2,4-D',
  '2,4-d amine': '2,4-D',
  '2,4-d amine 625': '2,4-D',
  '2,4-d amine 625 herbicide': '2,4-D',
  '24d': '2,4-D',
  '24-d': '2,4-D',
};

export function canonicalChemicalName(name: string): string {
  const norm = normalizeChemicalName(name);
  return CANONICAL_MAP[norm] ?? name.trim();
}

// ─── Deduplication ───────────────────────────────

function dedupeRecords(
  records: Record<string, SourceStatusRecord>
): Record<string, SourceStatusRecord> {
  // Group all entries by their canonical chemical name
  const grouped = new Map<string, { key: string; record: SourceStatusRecord }[]>();

  for (const [key, record] of Object.entries(records)) {
    const canonical = canonicalChemicalName(record.chemical);
    const canonicalKey = normalizeChemicalName(canonical);
    const list = grouped.get(canonicalKey) || [];
    list.push({ key, record });
    grouped.set(canonicalKey, list);
  }

  const clean: Record<string, SourceStatusRecord> = {};

  grouped.forEach((entries, canonicalKey) => {
    if (entries.length === 1) {
      // Rewrite chemical display name to canonical form
      const canonical = canonicalChemicalName(entries[0].record.chemical);
      clean[canonicalKey] = { ...entries[0].record, chemical: canonical };
      return;
    }

    // Multiple entries for same chemical — pick the best one
    entries.sort((a: { key: string; record: SourceStatusRecord }, b: { key: string; record: SourceStatusRecord }) => {
      // Prefer newest lastCheckedAt
      const tA = a.record.lastCheckedAt ? new Date(a.record.lastCheckedAt).getTime() : 0;
      const tB = b.record.lastCheckedAt ? new Date(b.record.lastCheckedAt).getTime() : 0;
      if (tA !== tB) return tB - tA;

      // Tiebreak: prefer the one with URLs
      const urlsA = (a.record.labelUrl ? 1 : 0) + (a.record.sdsUrl ? 1 : 0);
      const urlsB = (b.record.labelUrl ? 1 : 0) + (b.record.sdsUrl ? 1 : 0);
      return urlsB - urlsA;
    });

    const winner = entries[0];
    const canonical = canonicalChemicalName(winner.record.chemical);
    clean[canonicalKey] = { ...winner.record, chemical: canonical };
  });

  return clean;
}

// ─── localStorage I/O ────────────────────────────

function loadRecords(): Record<string, SourceStatusRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveRecords(records: Record<string, SourceStatusRecord>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeRecords(records)));
}

// ─── Flags ───────────────────────────────────────

export function deriveFlags(record: SourceStatusRecord): SourceFlags {
  const stale = isStale(record.lastCheckedAt);
  const missingLabel = !record.labelAvailable;
  const missingSds = !record.sdsAvailable;
  const conflict =
    record.sourceStatus === 'partial' ||
    record.notes.toLowerCase().includes('conflict') ||
    record.notes.toLowerCase().includes('mismatch');
  const needsAttention = stale || missingLabel || missingSds || conflict;
  const healthy = !needsAttention;

  return { stale, missingLabel, missingSds, conflict, healthy, needsAttention };
}

function isStale(lastCheckedAt: string): boolean {
  if (!lastCheckedAt) return true;
  const checked = new Date(lastCheckedAt).getTime();
  if (isNaN(checked)) return true;
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  return checked < cutoff;
}

function withFlags(record: SourceStatusRecord): SourceRecordWithFlags {
  return { ...record, flags: deriveFlags(record) };
}

// ─── Public API ──────────────────────────────────

export function getTrackedChemicals(): SourceRecordWithFlags[] {
  let records = loadRecords();

  // Migration: canonicalize + dedupe any existing dirty data
  const raw = { ...records };
  records = dedupeRecords(records);

  // Check if migration changed anything
  const rawKeys = Object.keys(raw).sort().join(',');
  const cleanKeys = Object.keys(records).sort().join(',');
  if (rawKeys !== cleanKeys) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }

  // Seed defaults if missing (use canonical names)
  let dirty = false;
  for (const name of DEFAULT_CHEMICALS) {
    const canonical = canonicalChemicalName(name);
    const key = normalizeChemicalName(canonical);
    if (!records[key]) {
      records[key] = {
        chemical: canonical,
        labelAvailable: false,
        sdsAvailable: false,
        labelUrl: '',
        sdsUrl: '',
        sourceStatus: 'not_found',
        lastCheckedAt: '',
        notes: 'Not yet checked',
      };
      dirty = true;
    }
  }
  if (dirty) saveRecords(records);

  return Object.values(records).map(withFlags);
}

export function getSourceStatusForChemical(name: string): SourceRecordWithFlags | null {
  const records = dedupeRecords(loadRecords());
  const canonical = canonicalChemicalName(name);
  const record = records[normalizeChemicalName(canonical)];
  return record ? withFlags(record) : null;
}

export function refreshChemical(name: string): SourceRecordWithFlags {
  const source = getChemicalSourceData(name);
  const now = new Date().toISOString();

  let notes = '';
  if (source.sourceStatus === 'not_found') {
    notes = 'Product not found in source data';
  } else if (source.sourceStatus === 'partial') {
    notes = 'Partial data available - some fields missing';
  } else {
    const parts: string[] = [];
    if (source.labelAvailable) parts.push('Label');
    if (source.sdsAvailable) parts.push('SDS');
    notes = parts.length > 0 ? `${parts.join(' and ')} loaded` : 'Source connected';
  }

  // Always use canonical name for display and storage key
  const canonical = canonicalChemicalName(
    source.sourceStatus !== 'not_found' ? source.productName : name
  );
  const key = normalizeChemicalName(canonical);

  const record: SourceStatusRecord = {
    chemical: canonical,
    labelAvailable: source.labelAvailable,
    sdsAvailable: source.sdsAvailable,
    labelUrl: source.labelUrl,
    sdsUrl: source.sdsUrl,
    sourceStatus: source.sourceStatus,
    lastCheckedAt: now,
    notes,
  };

  // Load, dedupe, upsert under canonical key, save
  const records = dedupeRecords(loadRecords());

  // Remove any stale keys that map to the same canonical name
  for (const existingKey of Object.keys(records)) {
    if (existingKey !== key) {
      const existingCanonical = canonicalChemicalName(records[existingKey].chemical);
      if (normalizeChemicalName(existingCanonical) === key) {
        delete records[existingKey];
      }
    }
  }

  records[key] = record;
  saveRecords(records);

  return withFlags(record);
}

export function upsertSourceRecord(record: SourceStatusRecord): SourceRecordWithFlags {
  const records = dedupeRecords(loadRecords());
  const canonical = canonicalChemicalName(record.chemical);
  const key = normalizeChemicalName(canonical);

  // Remove stale keys that map to the same canonical name
  for (const existingKey of Object.keys(records)) {
    if (existingKey !== key) {
      const existingCanonical = canonicalChemicalName(records[existingKey].chemical);
      if (normalizeChemicalName(existingCanonical) === key) {
        delete records[existingKey];
      }
    }
  }

  records[key] = { ...record, chemical: canonical };
  saveRecords(records);
  return withFlags(records[key]);
}

export function refreshAllChemicals(): SourceRecordWithFlags[] {
  // Dedupe first so we iterate a clean list
  const records = dedupeRecords(loadRecords());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));

  // Collect unique normalised names to refresh
  const seen = new Set<string>();
  const names: string[] = [];

  for (const record of Object.values(records)) {
    const norm = normalizeChemicalName(record.chemical);
    if (!seen.has(norm)) {
      seen.add(norm);
      names.push(record.chemical);
    }
  }

  return names.map((name) => refreshChemical(name));
}
