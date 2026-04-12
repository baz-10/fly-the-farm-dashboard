export type SourceSearchStatus =
  | 'not_started'
  | 'needs_search'
  | 'candidate_found'
  | 'candidate_review_required'
  | 'ready_for_ingest'
  | 'ingested';

export type IntakeStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'completed';

export interface ChemicalIntakeRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  chemicalNameRaw: string;
  chemicalNameCanonical: string;
  proposedLabelFilename: string;
  proposedSdsFilename: string;
  proposedLabelPath: string;
  proposedSdsPath: string;
  sourceSearchStatus: SourceSearchStatus;
  intakeStatus: IntakeStatus;
  notes: string;
  labelUrlCandidate: string;
  sdsUrlCandidate: string;
  adminReviewRequired: boolean;
  readyForSourceManager: boolean;
  readyForDocSync: boolean;
  proposedSourceStatus: string;
  ingestionNotes: string;
  syncCommandPreview: string;
  expectedLabelFilename: string;
  expectedSdsFilename: string;
  expectedLabelPath: string;
  expectedSdsPath: string;
  labelUrlSuggestions: string[];
  sdsUrlSuggestions: string[];
  suggestionStatus: 'none' | 'generated' | 'reviewed';
  labelUrlApprovalStatus: 'pending' | 'approved' | 'rejected';
  sdsUrlApprovalStatus: 'pending' | 'approved' | 'rejected';
  labelUrlApprovedAt?: string;
  sdsUrlApprovedAt?: string;
  labelUrlApprovedBy?: string;
  sdsUrlApprovedBy?: string;
}
