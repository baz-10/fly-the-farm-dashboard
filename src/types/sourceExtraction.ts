export interface SourceExtraction {
  id: string;
  chemical: string;
  sourceDocumentType: "label" | "sds";
  sourceUrl: string;
  extractedAt: string;
  extractionStatus: "success" | "partial" | "failed";
  productName: string;
  applicationMethod: string;
  aerialMinWaterRate: string;
  dropletRequirement: string;
  windLimits: string;
  temperatureLimits: string;
  withholding: string;
  operationalDoNotStatements: string[];
  generalDoNotStatements: string[];
  susceptibleCropWarnings: string[];
  waterwayWarnings: string[];
  bufferRequirements: string;
  rawExtractedTextPreview: string;
  confidenceNotes: string[];
}
