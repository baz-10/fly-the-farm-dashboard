import { InvokeInput } from "../types/invoke";

export interface ClientReport {
  jobOverview: string[];
  quickStatusSummary: string[];
  applicationSummary: string[];
  labelRequirements: string[];
  siteRisks: string[];
  riskManagementPlan: string[];
  applicationSettings: string[];
  complianceNotes: string[];
  finalRecommendation: string[];
}

export interface OperatorBriefing {
  missionStatus: {
    status: "GO" | "CONDITIONAL" | "NO-GO";
    reason: string;
  };
  criticalBlockers: OperatorIssue[];
  keyCautions: OperatorIssue[];
  operatorRequirements: {
    waterRate: string;
    dropletClass: string;
    windLimits: string;
    temperatureLimits: string;
    withholding: string;
    cropSensitivity: string;
    waterwayProtection: string;
    bufferStatus: string;
  };
  legalComplianceActions: string[];
  priorityConstraints: string[];
  fullLabelConstraints: string[];
  cleanProductName: string;
}

export interface OperatorIssue {
  title: string;
  why: string;
  whatsMissing: string;
  actionToResolve: string;
}

// Status symbols — restrained use only
const OK = "\u2705";     // ✅
const WARN = "\u26A0\uFE0F"; // ⚠️
const BLOCK = "\u26D4";  // ⛔

export function generateClientReport(
  input: InvokeInput,
  chainResult: any
): ClientReport {
  const report: ClientReport = {
    jobOverview: [],
    quickStatusSummary: [],
    applicationSummary: [],
    labelRequirements: [],
    siteRisks: [],
    riskManagementPlan: [],
    applicationSettings: [],
    complianceNotes: [],
    finalRecommendation: [],
  };

  const v1 = chainResult?.v1;
  const v2 = chainResult?.v2;
  const v3 = chainResult?.v3;
  const v4 = chainResult?.v4;
  const challenger = chainResult?.challenger;

  const hasVerifiedLabel =
    v1?.extractedFields &&
    v1.extractedFields.applicationMethod &&
    !isInternalLanguage(v1.extractedFields.applicationMethod);

  const isProvisional =
    v3?.executionReadiness === "PROVISIONAL EXECUTION" ||
    v4?.numericPresetReadiness === "PROVISIONAL";

  const conflicts = detectLabelPresetConflicts(v1, v4);

  const hasBoundaries = !!(input.boundaries && input.boundaries.trim());

  const allManualReview = collectManualReview(v1, v2, v3, v4, challenger);

  const hasHighRisk =
    challenger?.flags?.some(
      (f: string) => f.toLowerCase().includes("high risk")
    ) ?? false;

  // --- Job Overview ---
  if (input.chemical) {
    report.jobOverview.push(`Product: ${input.chemical}`);
  }
  if (input.aircraft) {
    report.jobOverview.push(`Aircraft: ${input.aircraft}`);
  }
  if (input.target) {
    report.jobOverview.push(`Target: ${input.target}`);
  }
  if (input.terrain) {
    report.jobOverview.push(`Terrain: ${input.terrain}`);
  }
  if (input.state) {
    report.jobOverview.push(`State: ${input.state}`);
  }
  if (input.boundaries) {
    report.jobOverview.push(
      `Site boundaries: ${formatBoundaryNatural(input.boundaries)}`
    );
  }
  if (report.jobOverview.length === 0) {
    report.jobOverview.push("No job details provided.");
  }

  // --- Quick Status Summary ---
  report.quickStatusSummary.push(
    input.chemical
      ? `${OK} Product identified: ${input.chemical}`
      : `${WARN} Product not specified`
  );

  report.quickStatusSummary.push(
    input.aircraft
      ? `${OK} Aircraft identified: ${input.aircraft}`
      : `${WARN} Aircraft not specified`
  );

  report.quickStatusSummary.push(
    hasVerifiedLabel
      ? `${OK} Label source data available`
      : `${WARN} Label source data not available \u2014 manual label review required`
  );

  if (hasBoundaries && input.boundaries) {
    report.quickStatusSummary.push(
      `${WARN} Boundary-sensitive site \u2014 ${formatBoundaryNatural(input.boundaries)}`
    );
  } else {
    report.quickStatusSummary.push(
      `${OK} No sensitive boundaries identified`
    );
  }

  if (conflicts.waterRate) {
    report.quickStatusSummary.push(
      `${BLOCK} Water rate conflict \u2014 label minimum exceeds current preset range`
    );
  } else if (isProvisional && v4?.numericPreset) {
    report.quickStatusSummary.push(
      `${WARN} Application settings are provisional`
    );
  } else if (v4?.numericPreset) {
    report.quickStatusSummary.push(
      `${OK} Application settings generated`
    );
  }

  if (allManualReview.length > 0) {
    report.quickStatusSummary.push(
      `${WARN} ${allManualReview.length} item${allManualReview.length === 1 ? "" : "s"} requiring verification`
    );
  } else {
    report.quickStatusSummary.push(
      `${OK} No outstanding verification items`
    );
  }

  if (hasHighRisk) {
    report.quickStatusSummary.push(
      `${BLOCK} Elevated risk factors identified by challenger review`
    );
  }

  // --- Application Summary ---
  const appSentence = buildApplicationSentence(input);
  if (appSentence) {
    report.applicationSummary.push(appSentence);
  }

  if (v1?.extractedFields?.applicationMethod) {
    const method = v1.extractedFields.applicationMethod;
    if (!isInternalLanguage(method)) {
      report.applicationSummary.push(`Label application method: ${method}`);
    }
  }

  if (report.applicationSummary.length === 0) {
    report.applicationSummary.push(
      "Application details require further confirmation before deployment."
    );
  }

  // --- Label Requirements ---
  if (hasVerifiedLabel) {
    report.labelRequirements.push("--- Quick Label Check ---");
    report.labelRequirements.push(
      `Product: ${v1.extractedFields.productName}`
    );
    report.labelRequirements.push(
      `Application method wording: ${v1.extractedFields.applicationMethod}`
    );

    // STRENGTHENED: Prioritize extracted label data over fallback values
    const sf = v1.sourceFields || v1.extractedFields;
    const hasExtraction = sf?.extractionMeta?.hasLabelExtraction;
    const isPartialExtraction = sf?.extractionMeta?.extractionStatus === "partial";
    const extractedFields = sf?.extractionMeta?.extractedFields || [];

    if (sf) {
      if (sf.aerialMinWaterRate) {
        const source = extractedFields.includes('aerialMinWaterRate') ?
          " (extracted from label document)" : "";
        const confidence = isPartialExtraction ? " [pending verification]" : "";
        report.labelRequirements.push(
          `Aerial minimum water rate: ${sf.aerialMinWaterRate}${source}${confidence}`
        );
      }
      if (sf.dropletRequirement) {
        const source = extractedFields.includes('dropletRequirement') ?
          " (extracted from label document)" : "";
        const confidence = isPartialExtraction ? " [pending verification]" : "";
        report.labelRequirements.push(
          `Droplet size requirement: ${sf.dropletRequirement}${source}${confidence}`
        );
      }
      if (sf.windLimits) {
        const source = extractedFields.includes('windLimits') ?
          " (extracted from label document)" : "";
        const confidence = isPartialExtraction ? " [pending verification]" : "";
        report.labelRequirements.push(
          `Wind limits: ${sf.windLimits}${source}${confidence}`
        );
      }
      if (sf.temperatureLimits) {
        const source = extractedFields.includes('temperatureLimits') ?
          " (extracted from label document)" : "";
        const confidence = isPartialExtraction ? " [pending verification]" : "";
        report.labelRequirements.push(
          `Temperature limits: ${sf.temperatureLimits}${source}${confidence}`
        );
      }
      if (sf.bufferRequirements) {
        const source = extractedFields.includes('bufferRequirements') ?
          " (extracted from label document)" : "";
        const confidence = isPartialExtraction ? " [pending verification]" : "";
        report.labelRequirements.push(
          `Buffer requirements: ${sf.bufferRequirements}${source}${confidence}`
        );
      }
      if (sf.withholding) {
        const source = extractedFields.includes('withholding') ?
          " (extracted from label document)" : "";
        const confidence = isPartialExtraction ? " [pending verification]" : "";
        report.labelRequirements.push(
          `Withholding: ${sf.withholding}${source}${confidence}`
        );
      }
    }

    // REFINED: Show weather/restraint wording only when it doesn't conflict with extracted structured fields
    if (v1.extractedFields.weatherLimits?.length > 0) {
      const hasExtractedStructuredFields = extractedFields.length > 0;

      for (const limit of v1.extractedFields.weatherLimits) {
        if (!isInternalLanguage(limit)) {
          // If we have extracted structured fields, filter out conflicting weather text
          if (hasExtractedStructuredFields && isWeatherTextRedundant(limit, sf, extractedFields)) {
            // Skip this weather limit as it conflicts with extracted structured data
            continue;
          }

          report.labelRequirements.push(
            `Weather / restraint wording: ${limit}`
          );
        }
      }
    }
    // Withholding now handled above in strengthened source fields section
  } else {
    report.labelRequirements.push(
      "Label verification pending \u2014 product label must be reviewed before application."
    );
  }

  // --- Site Risks ---
  // Use a dedup set to prevent the same concept appearing twice
  const siteRisksSeen = new Set<string>();
  const addSiteRisk = (text: string) => {
    const key = text.toLowerCase().replace(/^label:\s*/i, "").trim();
    if (!siteRisksSeen.has(key)) {
      siteRisksSeen.add(key);
      report.siteRisks.push(text);
    }
  };

  // Source-backed label warnings first (they are the authoritative source)
  const sf = v1?.sourceFields;
  if (sf && hasBoundaries) {
    const boundaryLower = (input.boundaries || "").toLowerCase();
    const hasWaterwayBoundary = /water|creek|river|dam|stream/.test(boundaryLower);
    const hasCropBoundary = /crop|vineyard|cotton|legume|garden|orchard/.test(boundaryLower);

    if (sf.waterwayWarnings?.length > 0 && hasWaterwayBoundary) {
      for (const ww of sf.waterwayWarnings) {
        addSiteRisk(`Label: ${ww}`);
      }
    }
    if (sf.susceptibleCropWarnings?.length > 0 && hasCropBoundary) {
      for (const cw of sf.susceptibleCropWarnings) {
        addSiteRisk(`Label: ${cw}`);
      }
    }
  }

  // v2 risk assessment — only add if not already covered by label warnings
  if (v2?.riskAssessment?.length > 0) {
    for (const risk of v2.riskAssessment) {
      const lower = risk.toLowerCase();
      if (lower.includes("no major")) continue;

      if (lower.includes("waterway")) {
        // Only add generic waterway line if no label waterway warnings were added
        if (!siteRisksSeen.has("do not contaminate streams, rivers, or waterways with this product or used containers.") &&
            !siteRisksSeen.has("do not contaminate streams, rivers, or waterways with this product.")) {
          addSiteRisk(
            "Waterway proximity increases environmental risk. Conservative drift protection is required."
          );
        }
      } else if (lower.includes("crop sensitivity") || lower.includes("crop")) {
        if (!Array.from(siteRisksSeen).some(k => k.includes("susceptible crop") || k.includes("toxic to legumes"))) {
          addSiteRisk(
            "Adjacent susceptible crop increases off-target damage risk. Strict boundary discipline is required."
          );
        }
      } else {
        addSiteRisk(risk.replace(/^HIGH\s*/i, "").trim());
      }
    }
  }

  // v1 boundary warnings — skip items already covered
  if (v1?.extractedFields?.boundaryWarnings?.length > 0) {
    for (const warning of v1.extractedFields.boundaryWarnings) {
      const lower = warning.toLowerCase();
      if (lower.includes("no boundary") || lower.startsWith("boundary context provided")) continue;
      addSiteRisk(warning);
    }
  }
  if (report.siteRisks.length === 0) {
    report.siteRisks.push(
      "No elevated site risks identified based on information provided."
    );
  }

  // --- Risk Management Plan ---
  if (v3?.executionNotes?.length > 0) {
    for (const note of v3.executionNotes) {
      if (!note.toLowerCase().includes("aircraft context provided")) {
        report.riskManagementPlan.push(note);
      }
    }
  }
  if (v2?.planningNotes?.length > 0) {
    for (const note of v2.planningNotes) {
      if (
        !note.toLowerCase().includes("context:") &&
        !note.toLowerCase().includes("input received")
      ) {
        report.riskManagementPlan.push(note);
      }
    }
  }
  if (challenger?.recommendations?.length > 0) {
    for (const rec of challenger.recommendations) {
      const cleaned = rec
        .replace(
          /use source-backed constraints as the controlling layer over presets/i,
          "Always defer to product label requirements over operational guidance"
        )
        .replace(
          /do not proceed until unresolved manual review items are checked/i,
          "All outstanding review items must be resolved before commencing application"
        )
        .replace(
          /treat waterway and crop boundaries as high-consequence edges/i,
          "Waterway and crop boundaries must be treated as high-consequence zones with maximum protection"
        );
      report.riskManagementPlan.push(cleaned);
    }
  }
  if (report.riskManagementPlan.length === 0) {
    report.riskManagementPlan.push(
      "Standard risk management protocols apply. No elevated mitigations required."
    );
  }

  // --- Application Settings ---
  const settingPrefix = isProvisional ? "Provisional " : "";

  if (v4?.numericPreset) {
    const p = v4.numericPreset;
    if (p.aircraft) {
      report.applicationSettings.push(`Aircraft: ${p.aircraft}`);
    }
    if (p.waterRate) {
      if (conflicts.waterRate) {
        report.applicationSettings.push(
          `Water rate: Not finalised \u2014 source-backed label minimum conflicts with current preset range`
        );
      } else {
        report.applicationSettings.push(
          `${settingPrefix}water rate: ${p.waterRate}`
        );
      }
    }
    if (p.speed) {
      report.applicationSettings.push(`${settingPrefix}speed: ${p.speed}`);
    }
    if (p.height) {
      report.applicationSettings.push(`${settingPrefix}height: ${p.height}`);
    }
    if (p.dropletClass) {
      report.applicationSettings.push(`Droplet class: ${p.dropletClass}`);
    }
    if (p.boundaryMode) {
      report.applicationSettings.push(
        `Boundary protection: ${p.boundaryMode}`
      );
    }
  }

  if (conflicts.waterRate) {
    report.applicationSettings.push(
      "Aerial water rate must be resolved against label requirements before execution."
    );
  }

  if (v4?.presetModifiers?.length > 0) {
    for (const mod of v4.presetModifiers) {
      report.applicationSettings.push(mod);
    }
  }
  if (v3?.executionBands?.length > 0 && !v4?.numericPreset) {
    for (const band of v3.executionBands) {
      report.applicationSettings.push(band);
    }
  }
  if (report.applicationSettings.length === 0) {
    report.applicationSettings.push(
      "Application settings require aircraft selection and site assessment before generation."
    );
  }

  // --- Compliance Notes (with selective symbols) ---
  // Only action-oriented items requiring confirmation — no repeats of site risks
  const complianceItems = new Set<string>();

  for (const item of allManualReview) {
    const lower = item.toLowerCase();

    if (
      lower.includes("not yet connected") ||
      lower.includes("pending verification") ||
      lower.includes("source data") ||
      lower.includes("verified source")
    ) {
      const sourceFields = v1?.sourceFields || v1?.extractedFields;
      const hasSuccessfulExtraction = sourceFields?.extractionMeta?.hasLabelExtraction &&
        sourceFields?.extractionMeta?.extractionStatus === "success";
      const isPartialExtraction = sourceFields?.extractionMeta?.extractionStatus === "partial";

      if (hasSuccessfulExtraction) {
        // Skip label review warning for successful extractions
        continue;
      } else if (isPartialExtraction) {
        complianceItems.add(
          `${WARN} Extracted label data is partial and key items still require verification.`
        );
      } else {
        complianceItems.add(
          `${WARN} Product label review is still required before final application.`
        );
      }
      continue;
    }

    if (lower.includes("uav") || lower.includes("drone permission")) {
      complianceItems.add(
        `${WARN} UAV/drone permissions must be confirmed before spraying.`
      );
      continue;
    }

    if (lower.includes("boundary")) {
      complianceItems.add(
        `${WARN} Boundary protection requirements must be confirmed before final execution.`
      );
      continue;
    }

    if (lower.includes("aircraft not provided")) {
      complianceItems.add(
        `${BLOCK} Aircraft type must be specified before application settings can be finalised.`
      );
      continue;
    }

    complianceItems.add(`${WARN} ${item}`);
  }

  if (conflicts.waterRate) {
    complianceItems.add(
      `${BLOCK} Water rate conflict between label minimum and FTF preset range must be resolved before application.`
    );
  }

  // Waterway + missing buffer = blocker
  if (hasBoundaries && input.boundaries) {
    const boundaryLower = input.boundaries.toLowerCase();
    const hasWaterwayBoundary = /water|creek|river|dam|stream|drain/i.test(boundaryLower);

    if (hasWaterwayBoundary) {
      const sourceFields = v1?.sourceFields || v1?.extractedFields;
      const bufferMissing = !sourceFields?.bufferRequirements ||
        sourceFields.bufferRequirements === "" ||
        sourceFields.bufferRequirements.toLowerCase().includes("pending") ||
        sourceFields.bufferRequirements.toLowerCase().includes("not found") ||
        sourceFields.bufferRequirements.toLowerCase().includes("does not specify");

      if (bufferMissing) {
        complianceItems.add(
          `${BLOCK} Buffer requirements not verified for waterway boundary.`
        );
      }
    }
  }

  // Source-backed key compliance items
  const sfCompliance = v1?.sourceFields;
  if (sfCompliance?.keyDoNotStatements?.length > 0) {
    complianceItems.add("--- Key Label Constraints ---");
    for (const stmt of sfCompliance.keyDoNotStatements) {
      complianceItems.add(`${WARN} ${stmt}`);
    }
  }

  if (complianceItems.size > 0) {
    report.complianceNotes = Array.from(complianceItems);
  } else {
    report.complianceNotes.push(`${OK} No outstanding compliance items.`);
  }

  // --- Final Recommendation (max 4 lines, concise, no repeated detail) ---
  const hasUnresolved = allManualReview.length > 0;
  const hasConflicts = Object.values(conflicts).some(Boolean);

  if (hasHighRisk && hasConflicts) {
    // Merge elevated risk + conflict into one line
    report.finalRecommendation.push(
      `${BLOCK} Label and operational conflicts must be resolved before application can proceed.`
    );
  } else if (hasHighRisk) {
    report.finalRecommendation.push(
      `${BLOCK} Elevated risk factors identified. Proceed only after all compliance and boundary protections are confirmed.`
    );
  } else if (hasConflicts) {
    report.finalRecommendation.push(
      `${BLOCK} Label requirements conflict with preset values. These must be resolved before application.`
    );
  }

  if (isProvisional && hasUnresolved) {
    // Merge provisional + unresolved into one line
    report.finalRecommendation.push(
      `${WARN} Settings are provisional and verification items are outstanding. Confirm all on site before application.`
    );
  } else if (isProvisional) {
    report.finalRecommendation.push(
      `${WARN} Application settings are provisional. Final settings must be confirmed on site.`
    );
  } else if (hasUnresolved) {
    report.finalRecommendation.push(
      `${WARN} Outstanding verification items must be resolved before application.`
    );
  }

  if (!hasHighRisk && !isProvisional && !hasUnresolved && !hasConflicts) {
    report.finalRecommendation.push(
      `${OK} Cleared for application based on the information provided.`
    );
  }

  report.finalRecommendation.push(
    "Always read and follow the product label. This report is operational guidance only."
  );

  return report;
}

// ─── Wind constraint violation detection ─────────────────────

/**
 * Detect if scenario wind is below extracted label minimum and should create a blocker
 */
function detectWindConstraintViolation(
  extractedWindLimits: string | undefined,
  scenarioWind: number | string | undefined
): { isViolation: boolean; labelMin: number | null; scenarioValue: number | null } {
  if (!extractedWindLimits) return { isViolation: false, labelMin: null, scenarioValue: null };

  // Extract minimum wind from label limits (e.g., "3-20 km/h", "3 km/h minimum", etc.)
  const windLimitLower = extractedWindLimits.toLowerCase();
  let labelMin: number | null = null;

  // Try to extract numeric minimum from various patterns
  const minPatterns = [
    /(\d+)\s*[–\-]\s*\d+\s*km\/h/,     // "3-20 km/h"
    /minimum\s+(\d+)\s*km\/h/,          // "minimum 3 km/h"
    /above\s+(\d+)\s*km\/h/,            // "above 3 km/h"
    /greater\s+than\s+(\d+)\s*km\/h/,   // "greater than 3 km/h"
  ];

  for (const pattern of minPatterns) {
    const match = windLimitLower.match(pattern);
    if (match) {
      labelMin = parseInt(match[1], 10);
      break;
    }
  }

  if (labelMin === null) return { isViolation: false, labelMin: null, scenarioValue: null };

  // Determine scenario wind value
  let scenarioValue: number | null = null;

  if (typeof scenarioWind === "number") {
    scenarioValue = scenarioWind;
  } else if (typeof scenarioWind === "string") {
    const scenarioLower = scenarioWind.toLowerCase();

    // Check for calm conditions
    if (/calm|still/i.test(scenarioLower)) {
      scenarioValue = 0;
    }

    // Extract numeric wind from scenario text
    if (scenarioValue === null) {
      const windMatch = scenarioLower.match(/(\d+)(?:\s*[–\-]\s*\d+)?\s*km\/h/);
      if (windMatch) {
        scenarioValue = parseInt(windMatch[1], 10);
      }
    }

    // Check for "below X" patterns
    if (scenarioValue === null) {
      const belowMatch = scenarioLower.match(/below\s+(\d+)/);
      if (belowMatch) {
        scenarioValue = parseInt(belowMatch[1], 10) - 1; // Conservative - assume 1 km/h below
      }
    }
  }

  // Check violation
  const isViolation = scenarioValue !== null && labelMin !== null && scenarioValue < labelMin;

  return { isViolation, labelMin, scenarioValue };
}

// ─── Enhanced product name cleanup ───────────────────────────

/**
 * Get the cleanest possible display name for operator output
 * Priority: cleaned extracted > cleaned canonical > cleaned input
 */
function getTrustedDisplayName(
  extractedName?: string,
  canonicalSourceName?: string,
  inputChemical?: string
): string {
  const fallback = inputChemical || "Unknown Product";

  // Try cleaned extracted name first
  if (extractedName && extractedName.trim()) {
    const cleaned = deepCleanProductName(extractedName);
    if (cleaned && !isNoisyProductName(cleaned)) {
      return cleaned;
    }
  }

  // Try cleaned canonical source name
  if (canonicalSourceName && canonicalSourceName.trim()) {
    const cleaned = deepCleanProductName(canonicalSourceName);
    if (cleaned && !isNoisyProductName(cleaned)) {
      return cleaned;
    }
  }

  // Try cleaned input chemical
  if (inputChemical && inputChemical.trim()) {
    const cleaned = deepCleanProductName(inputChemical);
    if (cleaned && !isNoisyProductName(cleaned)) {
      return cleaned;
    }
  }

  // Final fallback
  return fallback;
}

/**
 * Aggressive product name cleaning for operator display
 */
function deepCleanProductName(raw: string): string {
  let cleaned = raw.trim();

  // Remove metadata patterns more aggressively
  cleaned = cleaned
    // APVMA approval numbers
    .replace(/APVMA\s+Approval\s+No\.?\s*[:\-–]?\s*\d+/gi, "")
    // Label Name prefix
    .replace(/^Label\s+Name\s*[:\-–]?\s*/i, "")
    .replace(/^Product\s+Name\s*[:\-–]?\s*/i, "")
    // Signal headings
    .replace(/\b(?:CAUTION|POISON|WARNING|DANGER|KEEP\s+OUT\s+OF\s+REACH(?:\s+OF\s+CHILDREN)?)\b/gi, "")
    // Registration/approval numbers
    .replace(/\s+(?:Reg\.?\s*No\.?|Approval\s*No\.?|Registration\s*No\.?)\s*[:\-–]?\s*\d+.*/i, "")
    // Document references
    .replace(/\b(?:Document|PDF|File|Page|Section)\b/gi, "")
    // Leading/trailing separators and colons
    .replace(/^[\s|\-–:]+|[\s|\-–:]+$/g, "")
    // Multiple whitespace and separators
    .replace(/[\s|\-–:]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

/**
 * Check if a product name still contains noisy metadata
 */
function isNoisyProductName(name: string): boolean {
  if (!name || name.length === 0) return true;
  if (name.length > 80) return true; // Too long suggests metadata

  const lowerName = name.toLowerCase();

  // Check for metadata patterns
  const noisePatterns = [
    /\bapvma\b/,
    /\blabel\s+name\b/,
    /\bproduct\s+name\b/,
    /\bdocument\b/,
    /\bpdf\b/,
    /\bfile\b/,
    /\bpage\b/,
    /\bsection\b/,
    /\bregistration\b/,
    /\bapproval\b/,
    /\bcaution\b/,
    /\bpoison\b/,
    /\bwarning\b/,
    /\bdanger\b/,
  ];

  return noisePatterns.some(pattern => pattern.test(lowerName));
}

export function generateOperatorBriefing(
  input: InvokeInput,
  chainResult: any
): OperatorBriefing {
  const v1 = chainResult?.v1;
  const v2 = chainResult?.v2;
  const v3 = chainResult?.v3;
  const v4 = chainResult?.v4;
  const challenger = chainResult?.challenger;

  const hasVerifiedLabel =
    v1?.extractedFields &&
    v1.extractedFields.applicationMethod &&
    !isInternalLanguage(v1.extractedFields.applicationMethod);

  const isProvisional =
    v3?.executionReadiness === "PROVISIONAL EXECUTION" ||
    v4?.numericPresetReadiness === "PROVISIONAL";

  const conflicts = detectLabelPresetConflicts(v1, v4);
  const hasBoundaries = !!(input.boundaries && input.boundaries.trim());
  const allManualReview = collectManualReview(v1, v2, v3, v4, challenger);

  const hasHighRisk =
    challenger?.flags?.some(
      (f: string) => f.toLowerCase().includes("high risk")
    ) ?? false;

  // Declare sf first (used throughout the function)
  const sf = v1?.sourceFields || v1?.extractedFields;

  // Wind constraint violation detection (will be used later in blockers)
  const windViolation = detectWindConstraintViolation(
    sf?.windLimits,
    input.weather?.windKmh || input.question
  );

  // --- Mission Status ---
  // PART G: Tighter mission status with specific reasons
  let missionStatus: "GO" | "CONDITIONAL" | "NO-GO" = "GO";
  let missionReason = "All systems ready for application";

  // Check if we'll have any hard blockers
  const willHaveHardBlockers = hasHighRisk || conflicts.waterRate || windViolation.isViolation ||
    (!input.aircraft) ||
    (hasBoundaries && input.boundaries &&
     /water|creek|river|dam|stream|drain/i.test(input.boundaries.toLowerCase()) &&
     (!sf?.bufferRequirements || sf.bufferRequirements === "" ||
      sf.bufferRequirements.toLowerCase().includes("pending")));

  if (willHaveHardBlockers) {
    missionStatus = "NO-GO";

    // Specific reasons based on actual blockers
    if (windViolation.isViolation && conflicts.waterRate) {
      missionReason = "Wind and water rate constraints are not currently compliant for safe application.";
    } else if (windViolation.isViolation) {
      missionReason = "Wind speed is below label minimum - wait for stable wind within approved range.";
    } else if (conflicts.waterRate) {
      missionReason = "Water rate conflicts with label requirements.";
    } else if (hasBoundaries && /water|creek|river|dam|stream|drain/i.test((input.boundaries || "").toLowerCase())) {
      missionReason = "Critical boundary constraints remain unresolved.";
    } else if (!input.aircraft) {
      missionReason = "Aircraft selection required before application settings can be generated.";
    } else if (hasHighRisk) {
      missionReason = "Elevated risk factors require resolution.";
    } else {
      missionReason = "Critical compliance requirements are not met.";
    }
  } else if (isProvisional || allManualReview.length > 0 || !hasVerifiedLabel) {
    missionStatus = "CONDITIONAL";
    if (!hasVerifiedLabel) {
      missionReason = "Label verification required before final execution";
    } else if (allManualReview.length > 0) {
      missionReason = `${allManualReview.length} item(s) require verification before execution`;
    } else {
      missionReason = "Settings are provisional - confirm on site before application";
    }
  }

  // --- Critical Blockers ---
  const criticalBlockers: OperatorIssue[] = [];

  // PART A: Wind below label minimum = hard blocker
  if (windViolation.isViolation) {
    criticalBlockers.push({
      title: "Wind below label minimum",
      why: "Wind speeds below the label minimum increase inversion and drift risk.",
      whatsMissing: "Stable wind within the label-approved operating range.",
      actionToResolve: "Delay spraying until wind is consistently within the extracted label range and inversion risk has cleared."
    });
  }

  if (conflicts.waterRate) {
    criticalBlockers.push({
      title: "Water Rate Conflict",
      why: "Label minimum water rate exceeds aircraft preset range",
      whatsMissing: "Compatible water rate setting that meets both label requirements and aircraft capabilities",
      actionToResolve: "Review aircraft specifications or consider alternative product with lower water rate requirements"
    });
  }

  // PART D: Enhanced waterway buffer blocker with actionable wording
  if (hasBoundaries && input.boundaries) {
    const boundaryLower = input.boundaries.toLowerCase();
    const hasWaterwayBoundary = /water|creek|river|dam|stream|drain/i.test(boundaryLower);

    if (hasWaterwayBoundary) {
      const sourceFields = v1?.sourceFields || v1?.extractedFields;
      const bufferMissing = !sourceFields?.bufferRequirements ||
        sourceFields.bufferRequirements === "" ||
        sourceFields.bufferRequirements.toLowerCase().includes("pending") ||
        sourceFields.bufferRequirements.toLowerCase().includes("not found") ||
        sourceFields.bufferRequirements.toLowerCase().includes("does not specify");

      if (bufferMissing) {
        criticalBlockers.push({
          title: "Missing waterway buffer requirements",
          why: "A creek/waterway boundary is present and no verified setback/buffer distance has been confirmed from the label or approved source.",
          whatsMissing: "Confirmed minimum aerial exclusion zone / setback for this boundary.",
          actionToResolve: "Review the label and approved source documents for any buffer/setback requirement. If no exact verified buffer is available before spraying, establish and document a conservative no-spray exclusion zone for the creek boundary. Do not fly spray lines where drift could enter the waterway."
        });
      }
    }
  }

  if (!input.aircraft) {
    criticalBlockers.push({
      title: "Aircraft Not Specified",
      why: "Application settings cannot be calculated without aircraft type",
      whatsMissing: "Aircraft selection",
      actionToResolve: "Select aircraft type to generate appropriate application settings"
    });
  }

  // --- Key Cautions ---
  const keyCautions: OperatorIssue[] = [];

  // PART C: Specific verification messages instead of generic label review
  const extractionMeta = sf?.extractionMeta;
  const hasLabelExtraction = extractionMeta?.hasLabelExtraction;
  const extractionStatus = extractionMeta?.extractionStatus;

  if (!hasVerifiedLabel || extractionStatus === "partial") {
    if (hasLabelExtraction && extractionStatus === "success") {
      // Success extraction - only warn about truly missing fields
      const missingFields: string[] = [];
      if (!sf?.bufferRequirements) missingFields.push("aerial buffer/setback requirements");
      if (!sf?.applicationMethod) missingFields.push("aerial application method wording");
      if (!sf?.windLimits) missingFields.push("wind limit specifications");
      if (!sf?.temperatureLimits) missingFields.push("temperature limit specifications");

      if (missingFields.length > 0) {
        keyCautions.push({
          title: "Specific Field Verification Required",
          why: "Label extraction was successful but some specific fields still need verification",
          whatsMissing: missingFields.join(", "),
          actionToResolve: `Review product label for the specific missing fields: ${missingFields.join(", ")}`
        });
      }
    } else if (hasLabelExtraction && extractionStatus === "partial") {
      keyCautions.push({
        title: "Partial Label Extraction",
        why: "Extracted label data is partial and unresolved items still require manual verification",
        whatsMissing: "Complete verification of partially extracted label requirements",
        actionToResolve: "Review product label for any fields marked as pending or unverified in the extraction results"
      });
    } else {
      keyCautions.push({
        title: "Label Review Required",
        why: "Product label data not available in source system",
        whatsMissing: "Manual verification of all label requirements",
        actionToResolve: "Review product label before application and verify all weather limits, buffer zones, and withholding periods"
      });
    }
  }

  if (isProvisional) {
    keyCautions.push({
      title: "Provisional Settings",
      why: "Application settings are estimated based on available information",
      whatsMissing: "Final on-site verification of settings",
      actionToResolve: "Verify settings on-site and adjust based on actual conditions before application"
    });
  }

  if (hasBoundaries && input.boundaries) {
    const boundaryLower = input.boundaries.toLowerCase();
    const hasCropBoundary = /crop|vineyard|cotton|legume|garden|orchard/.test(boundaryLower);

    if (hasCropBoundary) {
      keyCautions.push({
        title: "Susceptible Crop Boundary",
        why: "Adjacent susceptible crops require drift protection",
        whatsMissing: "Drift management plan confirmation",
        actionToResolve: "Confirm wind direction, use appropriate droplet size, and maintain adequate buffer distance"
      });
    }
  }

  // UAV permissions
  if (allManualReview.some(item => /uav|drone/i.test(item))) {
    keyCautions.push({
      title: "UAV Permissions",
      why: "Drone operations require regulatory compliance",
      whatsMissing: "Current operating permissions verification",
      actionToResolve: "Confirm ReOC, pilot certification, and airspace approval before operation"
    });
  }

  // --- Operator Requirements Summary ---
  const operatorRequirements = {
    waterRate: sf?.aerialMinWaterRate || v4?.numericPreset?.waterRate || "Review label for minimum requirements",
    dropletClass: sf?.dropletRequirement || v4?.numericPreset?.dropletClass || "Review label for size requirements",
    windLimits: sf?.windLimits || "3-20 km/h (typical range - verify on label)",
    temperatureLimits: sf?.temperatureLimits || "Review label for maximum temperature",
    withholding: sf?.withholding || "Review label for grazing restrictions",
    cropSensitivity: sf?.susceptibleCropWarnings?.length > 0 ?
      `${sf.susceptibleCropWarnings.length} warning(s) on label - avoid drift to susceptible crops` :
      "Review label for crop sensitivity warnings",
    waterwayProtection: sf?.waterwayWarnings?.length > 0 ?
      "Do not contaminate waterways - specific restrictions on label" :
      "Standard waterway contamination prevention applies",
    bufferStatus: sf?.bufferRequirements || "Review label for specific buffer requirements"
  };

  // --- Legal / Compliance Actions Required ---
  // PART E: Job-specific operator actions based on actual scenario context
  const legalComplianceActions: string[] = [];

  // Priority actions based on blockers and job context
  if (windViolation.isViolation) {
    legalComplianceActions.push("Delay operation until wind is consistently within label limits");
  }

  if (hasBoundaries && input.boundaries) {
    const boundaryLower = input.boundaries.toLowerCase();
    const hasWaterwayBoundary = /water|creek|river|dam|stream|drain/i.test(boundaryLower);
    const hasCropBoundary = /crop|vineyard|cotton|legume|garden|orchard/.test(boundaryLower);

    // Specific actions for this job's boundary context
    if (hasCropBoundary) {
      legalComplianceActions.push("Confirm wind direction is away from susceptible crop boundary before spraying");
    }

    if (hasWaterwayBoundary) {
      legalComplianceActions.push("Establish and mark a no-spray buffer/exclusion zone along the creek boundary");
    }

    if (hasCropBoundary && hasWaterwayBoundary) {
      legalComplianceActions.push("Use conservative droplet class and slower boundary passes near sensitive edges");
    }

    if (hasBoundaries) {
      legalComplianceActions.push("Conduct on-site wind check immediately before launch");
    }
  }

  // Check if this is a drift-sensitive chemical
  const chemicalLower = (input.chemical || "").toLowerCase();
  const isDriftSensitive = /2,4-d|24d|24-d|metsulfuron/.test(chemicalLower);

  if (isDriftSensitive && hasBoundaries) {
    legalComplianceActions.push("Extra drift precautions required due to drift-sensitive chemical near boundaries");
  }

  // UAV specific
  if (allManualReview.some(item => /uav|drone/i.test(item))) {
    legalComplianceActions.push("Confirm UAV permissions before operation");
  }

  // Generic compliance (lower priority)
  if (!windViolation.isViolation) {
    legalComplianceActions.push("Verify wind speed is within label limits at application time");
  }

  legalComplianceActions.push("Confirm withholding period requirements before livestock access");

  // Only add generic label review if no specific extraction exists
  if (!hasLabelExtraction) {
    legalComplianceActions.push("Read and understand product label before application");
  }

  // --- Priority Operational Constraints ---
  // PART F: Keep only highest-value 5-8 operator constraints
  const priorityConstraints: string[] = [];

  // Priority order: wind > inversion > rainfall > waterway > crop drift > stress > withholding
  const highValueKeywords = [
    { patterns: [/wind.*exceed|wind.*above|wind.*km\/h/i], category: "wind" },
    { patterns: [/inversion|temperature.*inversion/i], category: "inversion" },
    { patterns: [/rain|rainfall|wet|before.*rain/i], category: "rainfall" },
    { patterns: [/waterway|stream|river|contaminate.*water/i], category: "waterway" },
    { patterns: [/drift.*crop|susceptible.*crop|blowing.*toward/i], category: "crop_drift" },
    { patterns: [/stress|stressed.*crop/i], category: "crop_stress" },
    { patterns: [/graze|grazing|withholding/i], category: "withholding" },
  ];

  const foundCategories = new Set<string>();
  const sourceStatements = sf?.keyDoNotStatements || [];

  // First pass: get one statement from each high-value category
  for (const statement of sourceStatements) {
    if (priorityConstraints.length >= 8) break;

    for (const { patterns, category } of highValueKeywords) {
      if (foundCategories.has(category)) continue;

      if (patterns.some(pattern => pattern.test(statement))) {
        priorityConstraints.push(statement);
        foundCategories.add(category);
        break;
      }
    }
  }

  // Second pass: fill remaining slots with other important statements
  for (const statement of sourceStatements) {
    if (priorityConstraints.length >= 6) break;
    if (!priorityConstraints.includes(statement)) {
      priorityConstraints.push(statement);
    }
  }

  // Critical Label Extract fallback if no keyDoNotStatements
  if (priorityConstraints.length === 0 && v1?.criticalLabelExtract) {
    for (const item of v1.criticalLabelExtract) {
      if (!item.includes("Aerial min. water rate:") &&
          !item.includes("Droplet size:") &&
          !item.includes("Wind limits:") &&
          !item.includes("Temperature limits:") &&
          !item.includes("Buffer requirements:") &&
          !item.includes("Withholding:") &&
          !item.startsWith("---")) {
        priorityConstraints.push(item);
        if (priorityConstraints.length >= 6) break;
      }
    }
  }

  // Final fallback for empty cases
  if (priorityConstraints.length === 0) {
    priorityConstraints.push(
      "Do not apply during calm conditions or wind speeds exceeding label limits",
      "Do not apply during temperature inversions",
      "Do not contaminate waterways",
      "Follow minimum water rates and droplet requirements on label"
    );
  }

  // --- Full Label Constraints ---
  const fullLabelConstraints: string[] = [];

  // Gather all extracted statements for the detailed section
  if (sf?.keyDoNotStatements) {
    fullLabelConstraints.push(...sf.keyDoNotStatements);
  }
  if (sf?.susceptibleCropWarnings) {
    fullLabelConstraints.push(...sf.susceptibleCropWarnings);
  }
  if (sf?.waterwayWarnings) {
    fullLabelConstraints.push(...sf.waterwayWarnings);
  }
  if (v1?.extractedFields?.weatherLimits) {
    fullLabelConstraints.push(...v1.extractedFields.weatherLimits.filter((w: string) => !isInternalLanguage(w)));
  }

  // PART B: Apply enhanced product name cleanup
  const cleanDisplayName = getTrustedDisplayName(
    sf?.productName,
    v1?.sourceFields?.productName || v1?.extractedFields?.productName,
    input.chemical
  );

  return {
    missionStatus: {
      status: missionStatus,
      reason: missionReason
    },
    criticalBlockers,
    keyCautions,
    operatorRequirements,
    legalComplianceActions,
    priorityConstraints,
    fullLabelConstraints,
    // Add cleaned product name for use in UI
    cleanProductName: cleanDisplayName
  };
}

// ─── Collect manual review items ─────────────────

function collectManualReview(...engines: any[]): string[] {
  const items: string[] = [];
  for (const engine of engines) {
    if (engine?.manualReview?.length > 0) {
      for (const item of engine.manualReview) {
        if (!items.includes(item)) {
          items.push(item);
        }
      }
    }
  }
  // Also include v1 notFound
  const v1 = engines[0];
  if (v1?.notFound?.length > 0) {
    for (const item of v1.notFound) {
      if (!items.includes(item)) {
        items.push(item);
      }
    }
  }
  return items;
}

// ─── Conflict detection ──────────────────────────

interface PresetConflicts {
  waterRate: boolean;
}

function detectLabelPresetConflicts(v1: any, v4: any): PresetConflicts {
  const conflicts: PresetConflicts = { waterRate: false };

  if (!v4?.numericPreset?.waterRate) {
    return conflicts;
  }

  // STRENGTHENED: Use extracted aerialMinWaterRate as primary source for conflict detection
  let labelMinWater = 0;
  const sourceFields = v1?.sourceFields || v1?.extractedFields;

  // Priority 1: Use extracted aerialMinWaterRate field (direct from label extraction)
  if (sourceFields?.aerialMinWaterRate) {
    const waterRateMatch = sourceFields.aerialMinWaterRate.match(/(\d+)\s*L\/ha/i);
    if (waterRateMatch) {
      labelMinWater = parseInt(waterRateMatch[1], 10);
    }
  }

  // Priority 2: Fallback to applicationMethod parsing (legacy approach)
  if (labelMinWater === 0 && sourceFields?.applicationMethod) {
    const method = sourceFields.applicationMethod;
    if (!isInternalLanguage(method)) {
      const labelMinMatch = method.match(
        /minimum\s+(?:spray\s+)?volume\s+of\s+(\d+)\s*L\/ha/i
      );
      if (labelMinMatch) {
        labelMinWater = parseInt(labelMinMatch[1], 10);
      }
    }
  }

  if (labelMinWater === 0) return conflicts;

  const presetRate = v4.numericPreset.waterRate as string;
  const rangeMatch = presetRate.match(/(\d+)\s*[–\-]\s*(\d+)\s*L\/ha/i);
  const singleMatch = presetRate.match(/(\d+)\s*L\/ha/i);

  let presetUpper = 0;
  if (rangeMatch) {
    presetUpper = parseInt(rangeMatch[2], 10);
  } else if (singleMatch) {
    presetUpper = parseInt(singleMatch[1], 10);
  }

  if (presetUpper > 0 && presetUpper < labelMinWater) {
    conflicts.waterRate = true;
  }

  return conflicts;
}

// ─── Weather text redundancy filter ──────────────────────

/**
 * Check if weather/restraint text is redundant with extracted structured fields.
 * Returns true if the weather text conflicts with or duplicates extracted data.
 */
function isWeatherTextRedundant(
  weatherText: string,
  sourceFields: any,
  extractedFields: string[]
): boolean {
  const normalizedText = weatherText.toLowerCase();

  // Wind redundancy: if windLimits extracted, check for wind conflicts
  if (extractedFields.includes('windLimits') && sourceFields.windLimits) {
    if (/\bwind\b/.test(normalizedText)) {
      const weatherWindMatch = normalizedText.match(/wind.*?(\d+)\s*km\/h/);
      const extractedWindMatch = sourceFields.windLimits.toLowerCase().match(/(\d+).*?km\/h/);

      if (weatherWindMatch && extractedWindMatch) {
        const weatherSpeed = parseInt(weatherWindMatch[1], 10);
        const extractedSpeed = parseInt(extractedWindMatch[1], 10);

        // If wind speeds are close or conflicting, consider redundant
        if (Math.abs(weatherSpeed - extractedSpeed) <= 5) {
          return true;
        }
      }

      // Check for inversion conflicts
      if (/inversion/.test(normalizedText) && /inversion/.test(sourceFields.windLimits.toLowerCase())) {
        return true;
      }

      // Check for calm condition conflicts
      if (/calm|less than/.test(normalizedText) && /calm|less than/.test(sourceFields.windLimits.toLowerCase())) {
        return true;
      }
    }
  }

  // Temperature redundancy: if temperatureLimits extracted, check for temp conflicts
  if (extractedFields.includes('temperatureLimits') && sourceFields.temperatureLimits) {
    if (/\btemperature|\b\d+.*°?c\b/.test(normalizedText)) {
      const weatherTempMatch = normalizedText.match(/(\d+)\s*°?\s*c/);
      const extractedTempMatch = sourceFields.temperatureLimits.toLowerCase().match(/(\d+)\s*°?\s*c/);

      if (weatherTempMatch && extractedTempMatch) {
        const weatherTemp = parseInt(weatherTempMatch[1], 10);
        const extractedTemp = parseInt(extractedTempMatch[1], 10);

        // If temperatures are close or conflicting, consider redundant
        if (Math.abs(weatherTemp - extractedTemp) <= 3) {
          return true;
        }
      }

      // Check for inversion conflicts
      if (/inversion/.test(normalizedText) && /inversion/.test(sourceFields.temperatureLimits.toLowerCase())) {
        return true;
      }
    }
  }

  // Aerial rate redundancy: if aerialMinWaterRate extracted, check for rate conflicts
  if (extractedFields.includes('aerialMinWaterRate') && sourceFields.aerialMinWaterRate) {
    if (/aerial|spray.*volume|l\/ha|minimum.*volume/i.test(normalizedText)) {
      const weatherRateMatch = normalizedText.match(/(\d+)\s*l\/ha/i);
      const extractedRateMatch = sourceFields.aerialMinWaterRate.toLowerCase().match(/(\d+)\s*l\/ha/i);

      if (weatherRateMatch && extractedRateMatch) {
        const weatherRate = parseInt(weatherRateMatch[1], 10);
        const extractedRate = parseInt(extractedRateMatch[1], 10);

        // If rates are close or identical, consider redundant
        if (Math.abs(weatherRate - extractedRate) <= 5) {
          return true;
        }
      }
    }
  }

  // Droplet redundancy: if dropletRequirement extracted, check for droplet conflicts
  if (extractedFields.includes('dropletRequirement') && sourceFields.dropletRequirement) {
    if (/droplet|coarse|fine|medium/i.test(normalizedText)) {
      const dropletKeywords = ['very coarse', 'coarse', 'medium', 'fine', 'very fine'];
      const extractedKeyword = dropletKeywords.find(k => sourceFields.dropletRequirement.toLowerCase().includes(k));
      const weatherKeyword = dropletKeywords.find(k => normalizedText.includes(k));

      if (extractedKeyword && weatherKeyword && extractedKeyword === weatherKeyword) {
        return true;
      }
    }
  }

  // Withholding redundancy: if withholding extracted, check for grazing conflicts
  if (extractedFields.includes('withholding') && sourceFields.withholding) {
    if (/graze|grazing|withholding|stock.*food|cut.*treated/i.test(normalizedText)) {
      const weatherDaysMatch = normalizedText.match(/(\d+)\s*days?/i);
      const extractedDaysMatch = sourceFields.withholding.toLowerCase().match(/(\d+)\s*days?/i);

      if (weatherDaysMatch && extractedDaysMatch) {
        const weatherDays = parseInt(weatherDaysMatch[1], 10);
        const extractedDays = parseInt(extractedDaysMatch[1], 10);

        // If withholding periods are identical, consider redundant
        if (weatherDays === extractedDays) {
          return true;
        }
      }
    }
  }

  // Buffer redundancy: if bufferRequirements extracted, check for buffer conflicts
  if (extractedFields.includes('bufferRequirements') && sourceFields.bufferRequirements) {
    if (/buffer|within.*metre|(\d+)\s*m\s*(?:of|from)/i.test(normalizedText)) {
      const weatherDistanceMatch = normalizedText.match(/(\d+)\s*(?:metres?|meters?|m)/i);
      const extractedDistanceMatch = sourceFields.bufferRequirements.toLowerCase().match(/(\d+)\s*m/i);

      if (weatherDistanceMatch && extractedDistanceMatch) {
        const weatherDistance = parseInt(weatherDistanceMatch[1], 10);
        const extractedDistance = parseInt(extractedDistanceMatch[1], 10);

        // If buffer distances are close or identical, consider redundant
        if (Math.abs(weatherDistance - extractedDistance) <= 5) {
          return true;
        }
      }
    }
  }

  return false;
}

// ─── Internal language filter ────────────────────

function isInternalLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("not yet connected") ||
    lower.includes("manual review required") ||
    lower.includes("pending verification") ||
    lower.includes("vault documents")
  );
}

// ─── Application sentence builder ────────────────

function buildApplicationSentence(input: InvokeInput): string | null {
  if (!input.aircraft && !input.target && !input.terrain) {
    return null;
  }

  const parts: string[] = [];

  if (input.aircraft) {
    parts.push(`${input.aircraft} drone application`);
  } else {
    parts.push("Aerial application");
  }

  if (input.target) {
    parts.push(`targeting ${input.target}`);
  }

  if (input.chemical) {
    parts.push(`using ${input.chemical}`);
  }

  if (input.terrain) {
    const terrainText = formatTerrainPhrase(input.terrain);
    parts.push(`across ${terrainText}`);
  }

  if (input.boundaries) {
    parts.push(formatBoundaryNatural(input.boundaries));
  }

  return parts.join(", ") + ".";
}

function formatTerrainPhrase(terrain: string): string {
  const segments = terrain
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return terrain;
  }

  const primary = segments[0];
  const rest = segments.slice(1);

  return `${primary} with ${rest.join(" and ")}`;
}

// ─── Boundary formatting ─────────────────────────

/**
 * Produce natural-sounding boundary phrasing.
 *   "susceptible crop, creek"  →  "with a susceptible crop boundary and a creek nearby"
 *   "waterway"                 →  "near a waterway"
 *   "crop, vineyard, dam"      →  "with crop and vineyard boundaries and a dam nearby"
 */
function formatBoundaryNatural(boundaries: string): string {
  const segments = boundaries
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (segments.length === 0) return boundaries;

  const hasSusceptibleCrop = segments.some((s) => s.includes("susceptible crop"));

  // Categorise into boundary-type vs proximity-type
  const boundaryTypes: string[] = [];  // crop, vineyard, etc.
  const proximityTypes: string[] = []; // creek, waterway, dam, etc.

  const PROXIMITY_KEYWORDS = ["creek", "river", "waterway", "dam", "stream", "lake"];

  for (const seg of segments) {
    if (seg === "crop" && hasSusceptibleCrop) continue; // skip bare "crop" if "susceptible crop" present
    if (PROXIMITY_KEYWORDS.some((k) => seg.includes(k))) {
      proximityTypes.push(seg);
    } else {
      boundaryTypes.push(seg);
    }
  }

  const parts: string[] = [];
  if (boundaryTypes.length === 1) {
    parts.push(`with a ${boundaryTypes[0]} boundary`);
  } else if (boundaryTypes.length > 1) {
    parts.push(`with ${joinNatural(boundaryTypes)} boundaries`);
  }

  if (proximityTypes.length === 1) {
    parts.push(
      boundaryTypes.length > 0
        ? `a nearby ${proximityTypes[0]}`
        : `near a ${proximityTypes[0]}`
    );
  } else if (proximityTypes.length > 1) {
    parts.push(
      boundaryTypes.length > 0
        ? `nearby ${joinNatural(proximityTypes)}`
        : `near ${joinNatural(proximityTypes)}`
    );
  }

  if (parts.length === 0) return boundaries;
  return parts.join(" and ");
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(", ")}, and ${last}`;
}
