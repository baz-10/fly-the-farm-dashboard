import {
  DocumentCandidate,
  ImportManifest,
  ValidationResult,
  ApprovalStatus,
  ValidationStatus,
  ImportStatus,
} from '../types/documentSourcing';
import { ChemicalIntakeRecord } from '../types/chemicalIntake';
import { validatePdfUrl, detectDocumentType } from '../utils/urlValidator';
import { getAllIntakeRecords } from './chemicalIntakeStore';

const CANDIDATES_STORAGE_KEY = 'ftf-document-candidates';
const MANIFESTS_STORAGE_KEY = 'ftf-import-manifests';

// ─── localStorage I/O ────────────────────────────

function loadCandidates(): DocumentCandidate[] {
  try {
    const raw = localStorage.getItem(CANDIDATES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCandidates(candidates: DocumentCandidate[]): void {
  localStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(candidates));
}

function loadManifests(): ImportManifest[] {
  try {
    const raw = localStorage.getItem(MANIFESTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveManifests(manifests: ImportManifest[]): void {
  localStorage.setItem(MANIFESTS_STORAGE_KEY, JSON.stringify(manifests));
}

function generateId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Document Candidate Management ───────────────

export function generateDocumentCandidatesFromIntake(): DocumentCandidate[] {
  const intakeRecords = getAllIntakeRecords();
  const existingCandidates = loadCandidates();
  const newCandidates: DocumentCandidate[] = [];
  const now = new Date().toISOString();

  for (const record of intakeRecords) {
    // Check for label candidate
    if (record.labelUrlCandidate && record.labelUrlCandidate.trim()) {
      const existingLabel = existingCandidates.find(
        c => c.chemicalId === record.id && c.documentType === 'label'
      );

      if (!existingLabel || existingLabel.candidateUrl !== record.labelUrlCandidate) {
        newCandidates.push({
          id: generateId(),
          chemical: record.chemicalNameCanonical,
          chemicalId: record.id,
          documentType: 'label',
          candidateUrl: record.labelUrlCandidate,
          validationStatus: 'pending',
          validationNotes: '',
          approvalStatus: 'pending',
          approvalNotes: '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Check for SDS candidate
    if (record.sdsUrlCandidate && record.sdsUrlCandidate.trim()) {
      const existingSds = existingCandidates.find(
        c => c.chemicalId === record.id && c.documentType === 'sds'
      );

      if (!existingSds || existingSds.candidateUrl !== record.sdsUrlCandidate) {
        newCandidates.push({
          id: generateId(),
          chemical: record.chemicalNameCanonical,
          chemicalId: record.id,
          documentType: 'sds',
          candidateUrl: record.sdsUrlCandidate,
          validationStatus: 'pending',
          validationNotes: '',
          approvalStatus: 'pending',
          approvalNotes: '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  return newCandidates;
}

export function getAllDocumentCandidates(): DocumentCandidate[] {
  return loadCandidates();
}

export function updateDocumentCandidate(candidateId: string, updates: Partial<DocumentCandidate>): DocumentCandidate | null {
  const candidates = loadCandidates();
  const index = candidates.findIndex(c => c.id === candidateId);

  if (index === -1) return null;

  candidates[index] = {
    ...candidates[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveCandidates(candidates);
  return candidates[index];
}

export function deleteDocumentCandidate(candidateId: string): boolean {
  const candidates = loadCandidates();
  const filteredCandidates = candidates.filter(c => c.id !== candidateId);

  if (filteredCandidates.length === candidates.length) return false;

  saveCandidates(filteredCandidates);
  return true;
}

// ─── Validation Functions ────────────────────────

export async function validateDocumentCandidate(candidateId: string): Promise<ValidationResult> {
  const candidates = loadCandidates();
  const candidate = candidates.find(c => c.id === candidateId);

  if (!candidate) {
    throw new Error('Document candidate not found');
  }

  // Update status to validating
  updateDocumentCandidate(candidateId, {
    validationStatus: 'validating',
    validationNotes: 'Validation in progress...',
  });

  try {
    const result = await validatePdfUrl(candidate.candidateUrl);

    // Update candidate with validation results
    const status: ValidationStatus = result.isAccessible && result.isPdf ? 'valid' : 'invalid';
    const notes = result.errorMessage ||
      `Validated: ${result.isAccessible ? 'Accessible' : 'Not accessible'}, ${result.isPdf ? 'PDF' : 'Not PDF'}`;

    updateDocumentCandidate(candidateId, {
      validationStatus: status,
      validationNotes: notes,
    });

    return result;
  } catch (error) {
    updateDocumentCandidate(candidateId, {
      validationStatus: 'error',
      validationNotes: error instanceof Error ? error.message : 'Unknown validation error',
    });
    throw error;
  }
}

export async function validateAllCandidates(
  onProgress?: (completed: number, total: number) => void
): Promise<ValidationResult[]> {
  const candidates = loadCandidates();
  const results: ValidationResult[] = [];

  for (let i = 0; i < candidates.length; i++) {
    try {
      const result = await validateDocumentCandidate(candidates[i].id);
      results.push(result);
    } catch (error) {
      // Error already handled in validateDocumentCandidate
      results.push({
        url: candidates[i].candidateUrl,
        isAccessible: false,
        isPdf: false,
        validatedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    if (onProgress) {
      onProgress(i + 1, candidates.length);
    }

    // Add delay to avoid overwhelming servers
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}

// ─── Approval Functions ──────────────────────────

export function approveDocumentCandidate(
  candidateId: string,
  approvalNotes: string = ''
): DocumentCandidate | null {
  return updateDocumentCandidate(candidateId, {
    approvalStatus: 'approved',
    approvalNotes,
    approvedAt: new Date().toISOString(),
    approvedBy: 'admin', // In real app, this would come from auth context
  });
}

export function rejectDocumentCandidate(
  candidateId: string,
  rejectionNotes: string = ''
): DocumentCandidate | null {
  return updateDocumentCandidate(candidateId, {
    approvalStatus: 'rejected',
    approvalNotes: rejectionNotes,
  });
}

export function bulkApproveValidCandidates(): number {
  const candidates = loadCandidates();
  let approvedCount = 0;

  for (const candidate of candidates) {
    if (candidate.validationStatus === 'valid' && candidate.approvalStatus === 'pending') {
      updateDocumentCandidate(candidate.id, {
        approvalStatus: 'approved',
        approvalNotes: 'Bulk approved - validation passed',
        approvedAt: new Date().toISOString(),
        approvedBy: 'admin',
      });
      approvedCount++;
    }
  }

  return approvedCount;
}

// ─── Import Manifest Functions ───────────────────

export function generateImportManifest(name: string, description: string = ''): ImportManifest {
  const candidates = loadCandidates();
  const approvedCandidates = candidates.filter(c => c.approvalStatus === 'approved');

  const manifest: ImportManifest = {
    id: generateId(),
    name,
    description,
    createdAt: new Date().toISOString(),
    totalDocuments: approvedCandidates.length,
    approvedDocuments: approvedCandidates,
    manifestPath: `public/manifests/import-manifest-${Date.now()}.json`,
    importStatus: 'pending',
    importNotes: '',
  };

  const manifests = loadManifests();
  manifests.push(manifest);
  saveManifests(manifests);

  return manifest;
}

export function getAllImportManifests(): ImportManifest[] {
  return loadManifests();
}

export function getImportManifest(manifestId: string): ImportManifest | null {
  const manifests = loadManifests();
  return manifests.find(m => m.id === manifestId) || null;
}

export function updateImportManifest(manifestId: string, updates: Partial<ImportManifest>): ImportManifest | null {
  const manifests = loadManifests();
  const index = manifests.findIndex(m => m.id === manifestId);

  if (index === -1) return null;

  manifests[index] = { ...manifests[index], ...updates };
  saveManifests(manifests);
  return manifests[index];
}

export function exportManifestAsJson(manifestId: string): string {
  const manifest = getImportManifest(manifestId);
  if (!manifest) throw new Error('Manifest not found');

  return JSON.stringify(manifest, null, 2);
}

// ─── Statistics Functions ────────────────────────

export interface SourcingStats {
  totalCandidates: number;
  pendingValidation: number;
  validCandidates: number;
  invalidCandidates: number;
  approvedCandidates: number;
  rejectedCandidates: number;
  readyForImport: number;
}

export function getSourcingStats(): SourcingStats {
  const candidates = loadCandidates();

  return {
    totalCandidates: candidates.length,
    pendingValidation: candidates.filter(c => c.validationStatus === 'pending').length,
    validCandidates: candidates.filter(c => c.validationStatus === 'valid').length,
    invalidCandidates: candidates.filter(c => c.validationStatus === 'invalid').length,
    approvedCandidates: candidates.filter(c => c.approvalStatus === 'approved').length,
    rejectedCandidates: candidates.filter(c => c.approvalStatus === 'rejected').length,
    readyForImport: candidates.filter(c =>
      c.validationStatus === 'valid' && c.approvalStatus === 'approved'
    ).length,
  };
}