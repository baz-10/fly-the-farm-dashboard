export interface DocumentCandidate {
  id: string;
  chemical: string;
  chemicalId: string; // Reference to intake record
  documentType: 'label' | 'sds';
  candidateUrl: string;
  validationStatus: ValidationStatus;
  validationNotes: string;
  approvalStatus: ApprovalStatus;
  approvalNotes: string;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImportManifest {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  totalDocuments: number;
  approvedDocuments: DocumentCandidate[];
  manifestPath: string;
  importStatus: ImportStatus;
  importedAt?: string;
  importNotes: string;
}

export interface ValidationResult {
  url: string;
  isAccessible: boolean;
  isPdf: boolean;
  contentLength?: number;
  statusCode?: number;
  errorMessage?: string;
  validatedAt: string;
}

export interface ImportProgress {
  manifestId: string;
  totalDocuments: number;
  processedDocuments: number;
  successfulImports: number;
  failedImports: number;
  currentDocument?: string;
  status: ImportProgressStatus;
  errors: ImportError[];
}

export interface ImportError {
  documentId: string;
  chemical: string;
  url: string;
  error: string;
  timestamp: string;
}

export type ValidationStatus =
  | 'pending'
  | 'validating'
  | 'valid'
  | 'invalid'
  | 'error';

export type ApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_review';

export type ImportStatus =
  | 'pending'
  | 'importing'
  | 'completed'
  | 'failed'
  | 'partial';

export type ImportProgressStatus =
  | 'preparing'
  | 'downloading'
  | 'processing'
  | 'completed'
  | 'failed';