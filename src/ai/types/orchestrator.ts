export type FinalStatus =
  | "FACTS ONLY"
  | "PLANNING READY"
  | "PROVISIONAL EXECUTION"
  | "CONDITIONAL"
  | "NO-GO";

export type OutputLevel =
  | "facts"
  | "planning"
  | "execution-bands"
  | "numeric-presets";

export type RoutingCategory =
  | "A_KNOWLEDGE_VAULT"
  | "B_CHEMICAL_FACTS"
  | "C_SPRAY_PLANNING"
  | "D_EXECUTION_BANDS"
  | "E_NUMERIC_PRESETS"
  | "F_COMPLIANCE_LEGAL"
  | "G_AGRONOMY"
  | "H_OPERATIONS_FINANCE";

export interface AskFTFWeatherContext {
  windKmh?: number;
  temperatureC?: number;
  rainForecast?: string;
}

export interface AskFTFBoundaryContext {
  waterway?: string;
  susceptibleCrop?: string;
  nativeVegetation?: string;
  dwellings?: string;
  additionalBoundaryNotes?: string;
}

export interface AskFTFContext {
  chemical?: string;
  aircraft?: string;
  jobType?: string;
  target?: string;
  state?: string;
  terrain?: string;
  hectares?: number;
  weather?: AskFTFWeatherContext;
  boundaries?: AskFTFBoundaryContext;
  additionalNotes?: string;
}

export interface AskFTFInput {
  userQuery: string;
  context?: AskFTFContext;
}

export interface RoutingSummary {
  primaryCategory: RoutingCategory;
  secondaryCategory?: RoutingCategory;
  enginesUsed: string[];
  keyRiskFlags: string[];
  outputLevel: OutputLevel;
}

export interface AskFTFResult {
  routingSummary: RoutingSummary;
  verifiedSourceFacts: string[];
  ftfPlanningInterpretation: string[];
  executionOutput: string[];
  challengerFlags: string[];
  manualReviewItems: string[];
  finalStatus: FinalStatus;
}
