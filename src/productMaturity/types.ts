export type ProductMaturity =
  | 'COMMERCIALLY_READY'
  | 'OPERATIONALLY_READY'
  | 'BETA'
  | 'COMING_SOON';

export type ProductPriority = 'P0' | 'P1' | 'P2' | 'P3';

export interface ProductMaturityEntry {
  moduleCode: string;
  workflowCode: string | null;
  customerName: string;
  maturity: ProductMaturity;
  owner: string;
  priority: ProductPriority;
  promotionBlockers: string[];
  evidence: string[];
  requiredAutomatedTests: string[];
  requiredManualAcceptance: string[];
  requiredOperationalEvidence: string[];
  targetPromotionMilestone: string;
  reviewDate: string;
  changelogReference: string;
}
