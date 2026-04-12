import {
  ChemicalIntakeRecord,
  SourceSearchStatus,
  IntakeStatus,
} from '../types/chemicalIntake';
import {
  canonicalChemicalName,
  buildChemicalDocFilenames,
} from '../utils/chemicalNaming';
import {
  upsertSourceRecord,
  SourceStatusRecord,
} from './sourceManagerStore';
import { generateUrlSuggestions } from '../utils/chemicalSourceSuggestions';

const STORAGE_KEY = 'ftf-chemical-intake';

// ─── localStorage I/O ────────────────────────────

function loadRecords(): ChemicalIntakeRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecords(records: ChemicalIntakeRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

function generateId(): string {
  return `intake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Public API ──────────────────────────────────

export interface CreateResult {
  record: ChemicalIntakeRecord;
  alreadyExisted: boolean;
}

export function createIntakeRecord(chemicalNameRaw: string): CreateResult {
  const records = loadRecords();
  const canonical = canonicalChemicalName(chemicalNameRaw);
  const canonicalLower = canonical.toLowerCase();

  // Check for existing record with same canonical name
  const existing = records.find(
    (r) => r.chemicalNameCanonical.toLowerCase() === canonicalLower
  );
  if (existing) {
    return { record: existing, alreadyExisted: true };
  }

  const docs = buildChemicalDocFilenames(canonical);
  const now = new Date().toISOString();

  const record: ChemicalIntakeRecord = {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    chemicalNameRaw: chemicalNameRaw.trim(),
    chemicalNameCanonical: canonical,
    proposedLabelFilename: docs.labelFilename,
    proposedSdsFilename: docs.sdsFilename,
    proposedLabelPath: docs.labelPath,
    proposedSdsPath: docs.sdsPath,
    sourceSearchStatus: 'needs_search',
    intakeStatus: 'draft',
    notes: '',
    labelUrlCandidate: '',
    sdsUrlCandidate: '',
    adminReviewRequired: true,
    readyForSourceManager: false,
    readyForDocSync: false,
    proposedSourceStatus: 'not_found',
    ingestionNotes: '',
    syncCommandPreview: 'node scripts/syncChemicalDocs.js <source-folder>',
    expectedLabelFilename: docs.labelFilename,
    expectedSdsFilename: docs.sdsFilename,
    expectedLabelPath: docs.labelPath,
    expectedSdsPath: docs.sdsPath,
    labelUrlSuggestions: [],
    sdsUrlSuggestions: [],
    suggestionStatus: 'none',
    labelUrlApprovalStatus: 'pending',
    sdsUrlApprovalStatus: 'pending',
  };

  records.push(record);
  saveRecords(records);

  return { record, alreadyExisted: false };
}

export function getAllIntakeRecords(): ChemicalIntakeRecord[] {
  return loadRecords();
}

export function getIntakeRecordById(id: string): ChemicalIntakeRecord | null {
  return loadRecords().find((r) => r.id === id) ?? null;
}

export function updateIntakeRecord(
  id: string,
  updates: Partial<
    Pick<
      ChemicalIntakeRecord,
      | 'notes'
      | 'labelUrlCandidate'
      | 'sdsUrlCandidate'
      | 'sourceSearchStatus'
      | 'intakeStatus'
      | 'adminReviewRequired'
      | 'readyForSourceManager'
      | 'readyForDocSync'
      | 'proposedSourceStatus'
      | 'ingestionNotes'
      | 'labelUrlSuggestions'
      | 'sdsUrlSuggestions'
      | 'suggestionStatus'
      | 'labelUrlApprovalStatus'
      | 'sdsUrlApprovalStatus'
      | 'labelUrlApprovedAt'
      | 'sdsUrlApprovedAt'
      | 'labelUrlApprovedBy'
      | 'sdsUrlApprovedBy'
    >
  >
): ChemicalIntakeRecord | null {
  const records = loadRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;

  records[index] = {
    ...records[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveRecords(records);
  return records[index];
}

export function deleteIntakeRecord(id: string): boolean {
  const records = loadRecords();
  const filtered = records.filter((r) => r.id !== id);
  if (filtered.length === records.length) return false;
  saveRecords(filtered);
  return true;
}

// ─── Validation ──────────────────────────────────

export function canMarkReadyForSourceManager(record: ChemicalIntakeRecord): boolean {
  return !!(
    record.chemicalNameCanonical &&
    record.proposedLabelFilename &&
    record.proposedSdsFilename
  );
}

export function canMarkReadyForDocSync(record: ChemicalIntakeRecord): boolean {
  return !!(record.labelUrlCandidate || record.sdsUrlCandidate);
}

// ─── Suggestion generation ──────────────────────

export function generateSuggestionsForRecord(id: string): ChemicalIntakeRecord | null {
  const records = loadRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const intake = records[index];
  const { labelSuggestions, sdsSuggestions } = generateUrlSuggestions(intake.chemicalNameCanonical);

  records[index] = {
    ...intake,
    labelUrlSuggestions: labelSuggestions,
    sdsUrlSuggestions: sdsSuggestions,
    suggestionStatus: 'generated',
    updatedAt: new Date().toISOString(),
  };

  saveRecords(records);
  return records[index];
}

// ─── Push to Source Manager ──────────────────────

export function canMarkIngestionComplete(record: ChemicalIntakeRecord): boolean {
  return (
    record.intakeStatus === 'approved' &&
    record.readyForSourceManager &&
    record.readyForDocSync
  );
}

export function markIngestionComplete(id: string): ChemicalIntakeRecord | null {
  const records = loadRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const intake = records[index];
  const timestamp = new Date().toISOString();
  const note = `Ingestion completed on ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const existingNotes = intake.notes ? intake.notes + '\n' : '';

  records[index] = {
    ...intake,
    intakeStatus: 'completed',
    sourceSearchStatus: 'ingested',
    notes: existingNotes + note,
    updatedAt: timestamp,
  };

  saveRecords(records);
  return records[index];
}

export function buildSyncChecklist(record: ChemicalIntakeRecord): string {
  const lines = [
    `FLY THE FARM — Sync Checklist`,
    `${'─'.repeat(40)}`,
    `Chemical (raw):     ${record.chemicalNameRaw}`,
    `Canonical name:     ${record.chemicalNameCanonical}`,
    ``,
    `Expected filenames:`,
    `  Label: ${record.expectedLabelFilename}`,
    `  SDS:   ${record.expectedSdsFilename}`,
    ``,
    `Expected paths:`,
    `  Label: ${record.expectedLabelPath}`,
    `  SDS:   ${record.expectedSdsPath}`,
    ``,
    `Candidate URLs:`,
    `  Label: ${record.labelUrlCandidate || '(none)'} (${record.labelUrlApprovalStatus})`,
    `  SDS:   ${record.sdsUrlCandidate || '(none)'} (${record.sdsUrlApprovalStatus})`,
    ``,
    `Readiness:`,
    `  Source Manager: ${record.readyForSourceManager ? 'Ready' : 'Not ready'}`,
    `  Doc Sync:       ${record.readyForDocSync ? 'Ready' : 'Not ready'}`,
    `  Intake status:  ${record.intakeStatus}`,
    ``,
    `Sync command:`,
    `  ${record.syncCommandPreview}`,
  ];
  return lines.join('\n');
}

// ─── Document Approval Functions ─────────────────

export function approveLabelUrl(id: string, approvedBy: string = 'admin'): ChemicalIntakeRecord | null {
  return updateIntakeRecord(id, {
    labelUrlApprovalStatus: 'approved',
    labelUrlApprovedAt: new Date().toISOString(),
    labelUrlApprovedBy: approvedBy,
  });
}

export function rejectLabelUrl(id: string): ChemicalIntakeRecord | null {
  return updateIntakeRecord(id, {
    labelUrlApprovalStatus: 'rejected',
    labelUrlApprovedAt: new Date().toISOString(),
    labelUrlApprovedBy: 'admin',
  });
}

export function approveSdsUrl(id: string, approvedBy: string = 'admin'): ChemicalIntakeRecord | null {
  return updateIntakeRecord(id, {
    sdsUrlApprovalStatus: 'approved',
    sdsUrlApprovedAt: new Date().toISOString(),
    sdsUrlApprovedBy: approvedBy,
  });
}

export function rejectSdsUrl(id: string): ChemicalIntakeRecord | null {
  return updateIntakeRecord(id, {
    sdsUrlApprovalStatus: 'rejected',
    sdsUrlApprovedAt: new Date().toISOString(),
    sdsUrlApprovedBy: 'admin',
  });
}

export function pushToSourceManager(id: string): ChemicalIntakeRecord | null {
  const records = loadRecords();
  const index = records.findIndex((r) => r.id === id);
  if (index === -1) return null;

  const intake = records[index];

  const hasLabel = !!intake.labelUrlCandidate;
  const hasSds = !!intake.sdsUrlCandidate;

  let sourceStatus: SourceStatusRecord['sourceStatus'] = 'not_found';
  if (hasLabel && hasSds) sourceStatus = 'available';
  else if (hasLabel || hasSds) sourceStatus = 'partial';

  const sourceRecord: SourceStatusRecord = {
    chemical: intake.chemicalNameCanonical,
    labelAvailable: hasLabel,
    sdsAvailable: hasSds,
    labelUrl: hasLabel ? intake.proposedLabelPath : '',
    sdsUrl: hasSds ? intake.proposedSdsPath : '',
    sourceStatus,
    lastCheckedAt: new Date().toISOString(),
    notes: `Pushed from Chemical Intake${intake.ingestionNotes ? ': ' + intake.ingestionNotes : ''}`,
  };

  upsertSourceRecord(sourceRecord);

  // Update intake record
  const timestamp = new Date().toISOString();
  const pushNote = `Pushed to Source Manager on ${new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  const existingNotes = intake.notes ? intake.notes + '\n' : '';

  records[index] = {
    ...intake,
    sourceSearchStatus: 'ready_for_ingest',
    intakeStatus: 'completed',
    readyForSourceManager: true,
    notes: existingNotes + pushNote,
    updatedAt: timestamp,
  };

  saveRecords(records);
  return records[index];
}
