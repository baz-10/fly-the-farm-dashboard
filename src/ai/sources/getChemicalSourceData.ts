export interface ChemicalSourceData {
  productName: string;
  labelAvailable: boolean;
  sdsAvailable: boolean;
  labelUrl: string;
  sdsUrl: string;
  applicationMethod: string;
  weatherLimits: string[];
  withholding: string;
  susceptibleCropWarnings: string[];
  waterwayWarnings: string[];
  sourceStatus: "available" | "partial" | "not_found";
  // Structured label extract fields
  aerialMinWaterRate: string;
  dropletRequirement: string;
  windLimits: string;
  temperatureLimits: string;
  keyDoNotStatements: string[];
  bufferRequirements: string;
  // Extraction metadata for prioritisation and source attribution
  extractionMeta: {
    hasLabelExtraction: boolean;
    extractionStatus?: "success" | "partial" | "failed";
    extractedFields: string[]; // Fields that came from extraction vs fallback
  };
}

const SOURCES: Record<string, ChemicalSourceData> = {
  "grazon extra": {
    productName: "Grazon Extra Herbicide",
    labelAvailable: true,
    sdsAvailable: true,
    labelUrl: "/docs/grazon-extra-label.pdf",
    sdsUrl: "/docs/grazon-extra-sds.pdf",
    applicationMethod:
      "Apply as a foliar spray using ground or aerial equipment. For aerial application, apply in a minimum spray volume of 60 L/ha using COARSE or larger droplets.",
    weatherLimits: [
      "Do not apply when wind speed exceeds 20 km/h at the application site.",
      "Do not apply during temperature inversions.",
      "Do not apply when ground-level wind speed is less than 3 km/h (calm conditions).",
      "Do not apply when temperatures exceed 35°C.",
    ],
    withholding:
      "Do not graze or cut treated pasture for stock food for 7 days after application.",
    susceptibleCropWarnings: [
      "Extremely toxic to legumes, cotton, tomatoes, ornamentals, and other broadleaf crops.",
      "Do not allow spray drift to contact susceptible crops, pastures, or vegetation.",
      "Do not apply when wind is blowing towards susceptible crops.",
    ],
    waterwayWarnings: [
      "DO NOT contaminate streams, rivers, or waterways with this product or used containers.",
      "DO NOT apply directly to or within 20 metres of any waterway.",
    ],
    sourceStatus: "available",
    aerialMinWaterRate: "60 L/ha",
    dropletRequirement: "COARSE or larger",
    windLimits: "3-20 km/h (no calm, no inversion)",
    temperatureLimits: "Do not apply above 35°C",
    keyDoNotStatements: [
      "Do not apply during temperature inversions.",
      "Do not apply in calm conditions (wind < 3 km/h).",
      "Do not apply when wind exceeds 20 km/h.",
      "Do not apply when wind is blowing towards susceptible crops.",
      "Do not contaminate waterways.",
      "Do not graze treated pasture for 7 days.",
    ],
    bufferRequirements: "20 m from any waterway",
    extractionMeta: {
      hasLabelExtraction: false,
      extractedFields: [],
    },
  },

  starane: {
    productName: "Starane Advanced Herbicide",
    labelAvailable: true,
    sdsAvailable: true,
    labelUrl: "/docs/starane-label.pdf",
    sdsUrl: "/docs/starane-sds.pdf",
    applicationMethod:
      "Apply as a foliar spray using ground or aerial equipment. For aerial application, use MEDIUM or larger droplets in a minimum spray volume of 30 L/ha.",
    weatherLimits: [
      "Do not apply when wind speed exceeds 20 km/h at the application site.",
      "Do not apply during temperature inversions.",
      "Do not apply when ground-level wind speed is less than 3 km/h (calm conditions).",
      "Do not apply when temperatures exceed 30°C or relative humidity is below 40%.",
    ],
    withholding:
      "Do not graze or cut treated vegetation for stock food for 7 days after application.",
    susceptibleCropWarnings: [
      "Toxic to legumes, cotton, grapes, and other broadleaf crops.",
      "Do not allow spray drift to contact susceptible crops or vegetation.",
      "Do not apply when wind is blowing towards susceptible crops.",
    ],
    waterwayWarnings: [
      "DO NOT contaminate streams, rivers, or waterways with this product.",
      "DO NOT apply directly to or within 10 metres of any waterway.",
    ],
    sourceStatus: "available",
    aerialMinWaterRate: "30 L/ha",
    dropletRequirement: "MEDIUM or larger",
    windLimits: "3-20 km/h (no calm, no inversion)",
    temperatureLimits: "Do not apply above 30°C or below 40% RH",
    keyDoNotStatements: [
      "Do not apply during temperature inversions.",
      "Do not apply in calm conditions (wind < 3 km/h).",
      "Do not apply when wind exceeds 20 km/h.",
      "Do not apply above 30°C or below 40% relative humidity.",
      "Do not apply when wind is blowing towards susceptible crops.",
      "Do not contaminate waterways.",
      "Do not graze treated vegetation for 7 days.",
    ],
    bufferRequirements: "10 m from any waterway",
    extractionMeta: {
      hasLabelExtraction: false,
      extractedFields: [],
    },
  },

  metsulfuron: {
    productName: "Metsulfuron-methyl 600 WG Herbicide",
    labelAvailable: true,
    sdsAvailable: true,
    labelUrl: "/docs/metsulfuron-label.pdf",
    sdsUrl: "/docs/metsulfuron-sds.pdf",
    applicationMethod:
      "Apply as a foliar spray using ground or aerial equipment. Use COARSE or larger droplets. Minimum spray volume 40 L/ha for aerial application.",
    weatherLimits: [
      "Do not apply when wind speed exceeds 20 km/h.",
      "Do not apply during temperature inversions.",
      "Do not apply when ground-level wind speed is less than 3 km/h (calm conditions).",
      "Avoid application during high temperatures and low humidity conditions.",
    ],
    withholding: "Nil withholding period.",
    susceptibleCropWarnings: [
      "Highly toxic to legumes and many broadleaf crops at extremely low rates.",
      "Ensure adequate buffer zones to susceptible crops.",
      "Residues in soil may affect subsequent sensitive crops for up to 2 years.",
      "Do not plant susceptible crops within 2 years of application without soil testing.",
    ],
    waterwayWarnings: [
      "DO NOT contaminate dams, waterways, or drains with this product.",
    ],
    sourceStatus: "available",
    aerialMinWaterRate: "40 L/ha",
    dropletRequirement: "COARSE or larger",
    windLimits: "3-20 km/h (no calm, no inversion)",
    temperatureLimits: "Avoid high temperatures and low humidity",
    keyDoNotStatements: [
      "Do not apply during temperature inversions.",
      "Do not apply in calm conditions (wind < 3 km/h).",
      "Do not apply when wind exceeds 20 km/h.",
      "Do not contaminate dams, waterways, or drains.",
      "Soil residues may affect sensitive crops for up to 2 years.",
      "Do not plant susceptible crops within 2 years without soil testing.",
    ],
    bufferRequirements: "Adequate buffer to susceptible crops (label does not specify distance)",
    extractionMeta: {
      hasLabelExtraction: false,
      extractedFields: [],
    },
  },

  glyphosate: {
    productName: "Glyphosate 450 SL Herbicide",
    labelAvailable: true,
    sdsAvailable: true,
    labelUrl: "/docs/glyphosate-label.pdf",
    sdsUrl: "/docs/glyphosate-sds.pdf",
    applicationMethod:
      "Apply as a foliar spray using ground or aerial equipment. For aerial application, use COARSE or larger droplets at a minimum spray volume of 20 L/ha.",
    weatherLimits: [
      "Do not apply when wind speed exceeds 20 km/h.",
      "Do not apply during temperature inversions.",
      "Do not apply when ground-level wind speed is less than 3 km/h (calm conditions).",
      "Best results when applied to actively growing weeds.",
    ],
    withholding:
      "Do not graze or cut treated areas for stock food for 7 days after application.",
    susceptibleCropWarnings: [
      "Non-selective herbicide — will damage or kill any contacted vegetation.",
      "Do not allow spray to contact desirable vegetation.",
      "Extreme care required near all desirable plants, crops, and pastures.",
    ],
    waterwayWarnings: [
      "DO NOT contaminate streams, rivers, or waterways with this product.",
      "Use only aquatic-registered glyphosate formulations near waterways.",
    ],
    sourceStatus: "available",
    aerialMinWaterRate: "20 L/ha",
    dropletRequirement: "COARSE or larger",
    windLimits: "3-20 km/h (no calm, no inversion)",
    temperatureLimits: "No specific temperature limit on label",
    keyDoNotStatements: [
      "Do not apply during temperature inversions.",
      "Do not apply in calm conditions (wind < 3 km/h).",
      "Do not apply when wind exceeds 20 km/h.",
      "Non-selective — do not allow spray to contact desirable vegetation.",
      "Do not contaminate waterways.",
      "Do not graze treated areas for 7 days.",
    ],
    bufferRequirements: "Use aquatic-registered formulations near waterways",
    extractionMeta: {
      hasLabelExtraction: false,
      extractedFields: [],
    },
  },
  "2,4-d": {
    productName: "2,4-D Amine 625 Herbicide",
    labelAvailable: true,
    sdsAvailable: true,
    labelUrl: "/docs/24d-label.pdf",
    sdsUrl: "/docs/24d-sds.pdf",
    applicationMethod:
      "Apply as a foliar spray using ground or aerial equipment. For aerial application, use COARSE or larger droplets in a minimum spray volume of 30 L/ha. Apply to actively growing weeds.",
    weatherLimits: [
      "Do not apply when wind speed exceeds 15 km/h at the application site.",
      "Do not apply during temperature inversions.",
      "Do not apply when ground-level wind speed is less than 3 km/h (calm conditions).",
      "Do not apply when temperatures exceed 28°C due to increased volatility risk.",
      "Amine formulations are less volatile than ester formulations but still require temperature caution.",
    ],
    withholding:
      "Do not graze or cut treated pasture for stock food for 7 days after application.",
    susceptibleCropWarnings: [
      "Extremely toxic to cotton, grapes, tomatoes, legumes, and other broadleaf crops.",
      "Do not allow spray drift to contact susceptible crops, pastures, or vegetation.",
      "Do not apply when wind is blowing towards susceptible crops.",
      "Vapour drift can occur in hot conditions — increased risk to susceptible crops even without spray drift.",
    ],
    waterwayWarnings: [
      "DO NOT contaminate streams, rivers, or waterways with this product or used containers.",
      "DO NOT apply directly to or within 20 metres of any waterway.",
    ],
    sourceStatus: "available",
    aerialMinWaterRate: "30 L/ha",
    dropletRequirement: "COARSE or larger",
    windLimits: "3-15 km/h (no calm, no inversion)",
    temperatureLimits: "Do not apply above 28°C (volatility risk)",
    keyDoNotStatements: [
      "Do not apply during temperature inversions.",
      "Do not apply in calm conditions (wind < 3 km/h).",
      "Do not apply when wind exceeds 15 km/h.",
      "Do not apply above 28°C due to vapour drift risk.",
      "Do not apply when wind is blowing towards susceptible crops.",
      "Do not contaminate waterways.",
      "Do not graze treated pasture for 7 days.",
    ],
    bufferRequirements: "20 m from any waterway; maximum distance from susceptible broadleaf crops",
    extractionMeta: {
      hasLabelExtraction: false,
      extractedFields: [],
    },
  },
};

// Maps variant names back to source lookup keys
const VARIANT_MAP: Record<string, string> = {
  "grazon extra": "grazon extra",
  "grazon extra herbicide": "grazon extra",
  "starane": "starane",
  "starane advanced": "starane",
  "starane advanced herbicide": "starane",
  "metsulfuron": "metsulfuron",
  "metsulfuron-methyl": "metsulfuron",
  "metsulfuron-methyl 600 wg herbicide": "metsulfuron",
  "glyphosate": "glyphosate",
  "glyphosate 450 sl herbicide": "glyphosate",
  "2,4-d": "2,4-d",
  "2,4-d amine": "2,4-d",
  "2,4-d amine 625": "2,4-d",
  "2,4-d amine 625 herbicide": "2,4-d",
  "24d": "2,4-d",
  "24-d": "2,4-d",
};

export function getChemicalSourceData(chemical: string): ChemicalSourceData {
  const key = chemical.toLowerCase().trim();

  // Resolve base source data (mocked/hardcoded)
  let base: ChemicalSourceData | null = null;

  // Try exact match first
  if (SOURCES[key]) {
    base = SOURCES[key];
  } else {
    // Try variant map
    const mapped = VARIANT_MAP[key];
    if (mapped && SOURCES[mapped]) {
      base = SOURCES[mapped];
    } else {
      // Fallback: partial match
      for (const [sourceKey, data] of Object.entries(SOURCES)) {
        if (key.includes(sourceKey) || sourceKey.includes(key)) {
          base = data;
          break;
        }
      }
    }
  }

  const fallback: ChemicalSourceData = base || {
    productName: chemical,
    labelAvailable: false,
    sdsAvailable: false,
    labelUrl: "",
    sdsUrl: "",
    applicationMethod: "",
    weatherLimits: [],
    withholding: "",
    susceptibleCropWarnings: [],
    waterwayWarnings: [],
    sourceStatus: "not_found",
    aerialMinWaterRate: "",
    dropletRequirement: "",
    windLimits: "",
    temperatureLimits: "",
    keyDoNotStatements: [],
    bufferRequirements: "",
    extractionMeta: {
      hasLabelExtraction: false,
      extractedFields: [],
    },
  };

  // Overlay extracted fields from PDF extraction if available
  return mergeExtraction(chemical, fallback);
}

/**
 * Merge extracted PDF data over the base source record.
 *
 * PRIORITY ORDER (STRENGTHENED):
 *   1. Label extraction (ABSOLUTE PRIORITY — overrides even if extracted field is empty)
 *   2. Base/mocked source data (fallback only when no extraction exists)
 *   3. SDS extraction (only for product name + warnings, never operational fields)
 *
 * Extracted operational fields MUST override fallback values to ensure label-based
 * decision making takes precedence in conflict detection and critical flag generation.
 */
function mergeExtraction(
  chemical: string,
  base: ChemicalSourceData
): ChemicalSourceData {
  type Extraction = import("../../types/sourceExtraction").SourceExtraction;

  let labelExt: Extraction | null = null;
  let sdsExt: Extraction | null = null;

  try {
    const raw = localStorage.getItem("ftf-source-extractions");
    if (!raw) return base;
    const all: Extraction[] = JSON.parse(raw);
    const key = chemical.toLowerCase().trim();
    const usable = all.filter(
      (r) =>
        r.chemical.toLowerCase().trim() === key &&
        (r.extractionStatus === "success" || r.extractionStatus === "partial")
    );

    const labels = usable
      .filter((r) => r.sourceDocumentType === "label")
      .sort((a, b) => b.extractedAt.localeCompare(a.extractedAt));
    if (labels.length > 0) labelExt = labels[0];

    const sdsDocs = usable
      .filter((r) => r.sourceDocumentType === "sds")
      .sort((a, b) => b.extractedAt.localeCompare(a.extractedAt));
    if (sdsDocs.length > 0) sdsExt = sdsDocs[0];
  } catch {
    return base;
  }

  if (!labelExt && !sdsExt) return base;

  // Helper: resolve operational DO NOT statements from an extraction.
  function resolveOperationalDoNots(ext: Extraction): string[] {
    const e = ext as any;
    if (e.operationalDoNotStatements && e.operationalDoNotStatements.length > 0) {
      return e.operationalDoNotStatements;
    }
    // Backward compat: old extractions have keyDoNotStatements
    if (e.keyDoNotStatements && e.keyDoNotStatements.length > 0) {
      return e.keyDoNotStatements;
    }
    return [];
  }

  // Start from base
  let merged = { ...base };
  const extractedFields: string[] = [];

  // If label extraction exists, overlay operational fields with ABSOLUTE PRIORITY
  if (labelExt) {
    const extDoNots = resolveOperationalDoNots(labelExt);

    // CRITICAL OPERATIONAL FIELDS — extracted values override even if empty
    const operationalFieldMappings = [
      { extracted: labelExt.aerialMinWaterRate, target: 'aerialMinWaterRate' },
      { extracted: labelExt.dropletRequirement, target: 'dropletRequirement' },
      { extracted: labelExt.windLimits, target: 'windLimits' },
      { extracted: labelExt.temperatureLimits, target: 'temperatureLimits' },
      { extracted: labelExt.withholding, target: 'withholding' },
      { extracted: labelExt.bufferRequirements, target: 'bufferRequirements' },
      { extracted: labelExt.applicationMethod, target: 'applicationMethod' },
    ];

    for (const field of operationalFieldMappings) {
      if (field.extracted !== undefined && field.extracted !== null) {
        // Extracted field exists — use it regardless of whether it's empty
        (merged as any)[field.target] = field.extracted;
        extractedFields.push(field.target);
      }
      // If extracted field doesn't exist, keep fallback value
    }

    // Product name — prefer extracted but fallback if empty or noisy
    if (labelExt.productName && labelExt.productName.trim()) {
      const cleanedName = cleanExtractedProductName(labelExt.productName, chemical);
      merged.productName = cleanedName || chemical; // Fallback to clean input if extraction is noisy
      extractedFields.push('productName');
    }

    // Warning arrays — prefer extracted if populated
    if (extDoNots.length > 0) {
      merged.keyDoNotStatements = extDoNots;
      extractedFields.push('keyDoNotStatements');
    }
    if (labelExt.susceptibleCropWarnings.length > 0) {
      merged.susceptibleCropWarnings = labelExt.susceptibleCropWarnings;
      extractedFields.push('susceptibleCropWarnings');
    }
    if (labelExt.waterwayWarnings.length > 0) {
      merged.waterwayWarnings = labelExt.waterwayWarnings;
      extractedFields.push('waterwayWarnings');
    }

    // Safe droplet fallback if missing and sensitive scenario detected
    if (!merged.dropletRequirement || merged.dropletRequirement === "" || merged.dropletRequirement.toLowerCase().includes("pending")) {
      const inferredDroplet = inferSafeDropletRequirement(merged, chemical);
      if (inferredDroplet) {
        merged.dropletRequirement = inferredDroplet;
        // Don't add to extractedFields since this is inferred, not extracted
      }
    }

    // Set extraction metadata
    merged.extractionMeta = {
      hasLabelExtraction: true,
      extractionStatus: labelExt.extractionStatus,
      extractedFields,
    };

  } else if (sdsExt) {
    // SDS-only fallback: only overlay non-operational fields
    const extDoNots = resolveOperationalDoNots(sdsExt);

    if (sdsExt.productName && sdsExt.productName.trim()) {
      const cleanedName = cleanExtractedProductName(sdsExt.productName, chemical);
      merged.productName = cleanedName || chemical; // Fallback to clean input if extraction is noisy
      extractedFields.push('productName');
    }

    // Only use SDS warnings if base warnings are empty
    if (extDoNots.length > 0 && merged.keyDoNotStatements.length === 0) {
      merged.keyDoNotStatements = extDoNots;
      extractedFields.push('keyDoNotStatements');
    }
    if (sdsExt.susceptibleCropWarnings.length > 0 && merged.susceptibleCropWarnings.length === 0) {
      merged.susceptibleCropWarnings = sdsExt.susceptibleCropWarnings;
      extractedFields.push('susceptibleCropWarnings');
    }
    if (sdsExt.waterwayWarnings.length > 0 && merged.waterwayWarnings.length === 0) {
      merged.waterwayWarnings = sdsExt.waterwayWarnings;
      extractedFields.push('waterwayWarnings');
    }

    // Set extraction metadata
    merged.extractionMeta = {
      hasLabelExtraction: false,
      extractionStatus: sdsExt.extractionStatus,
      extractedFields,
    };
  }

  // REFINED: Filter conflicting fallback weatherLimits when extracted fields exist
  if (merged.extractionMeta.hasLabelExtraction && merged.extractionMeta.extractedFields.length > 0) {
    merged.weatherLimits = filterConflictingWeatherLimits(
      merged.weatherLimits,
      merged.extractionMeta.extractedFields,
      merged
    );
  }

  return merged;
}

/**
 * Filter out fallback weather/restraint wording that conflicts with extracted structured fields.
 * Preserves fallback text only when it adds clearly different, non-conflicting information.
 */
function filterConflictingWeatherLimits(
  weatherLimits: string[],
  extractedFields: string[],
  sourceData: ChemicalSourceData
): string[] {
  if (weatherLimits.length === 0) return weatherLimits;

  const filtered: string[] = [];

  for (const weatherText of weatherLimits) {
    const normalizedText = weatherText.toLowerCase();
    let shouldSuppress = false;

    // Check for conflicts with extracted structured fields

    // Wind conflicts: if windLimits extracted, suppress conflicting wind text
    if (extractedFields.includes('windLimits') && sourceData.windLimits) {
      if (isWindConflict(normalizedText, sourceData.windLimits)) {
        shouldSuppress = true;
      }
    }

    // Temperature conflicts: if temperatureLimits extracted, suppress conflicting temp text
    if (extractedFields.includes('temperatureLimits') && sourceData.temperatureLimits) {
      if (isTemperatureConflict(normalizedText, sourceData.temperatureLimits)) {
        shouldSuppress = true;
      }
    }

    // Aerial rate conflicts: if aerialMinWaterRate extracted, suppress conflicting rate text
    if (extractedFields.includes('aerialMinWaterRate') && sourceData.aerialMinWaterRate) {
      if (isAerialRateConflict(normalizedText, sourceData.aerialMinWaterRate)) {
        shouldSuppress = true;
      }
    }

    // Droplet conflicts: if dropletRequirement extracted, suppress conflicting droplet text
    if (extractedFields.includes('dropletRequirement') && sourceData.dropletRequirement) {
      if (isDropletConflict(normalizedText, sourceData.dropletRequirement)) {
        shouldSuppress = true;
      }
    }

    // Withholding conflicts: if withholding extracted, suppress conflicting withholding text
    if (extractedFields.includes('withholding') && sourceData.withholding) {
      if (isWithholdingConflict(normalizedText, sourceData.withholding)) {
        shouldSuppress = true;
      }
    }

    // Buffer conflicts: if bufferRequirements extracted, suppress conflicting buffer text
    if (extractedFields.includes('bufferRequirements') && sourceData.bufferRequirements) {
      if (isBufferConflict(normalizedText, sourceData.bufferRequirements)) {
        shouldSuppress = true;
      }
    }

    if (!shouldSuppress) {
      filtered.push(weatherText);
    }
  }

  return filtered;
}

// Product name cleanup helper

/**
 * Clean extracted product name, returning null if result is still noisy/unreliable
 */
function cleanExtractedProductName(extractedName: string, fallbackChemical: string): string | null {
  let cleaned = extractedName.trim();

  // Remove common metadata patterns more aggressively
  cleaned = cleaned
    // APVMA approval numbers
    .replace(/APVMA\s+Approval\s+No\.?\s*[:\-–]?\s*\d+/gi, "")
    // Label/Product name prefixes
    .replace(/^Label\s+Name\s*[:\-–]?\s*/i, "")
    .replace(/^Product\s+Name\s*[:\-–]?\s*/i, "")
    // Signal headings
    .replace(/\b(?:CAUTION|POISON|WARNING|DANGER|KEEP\s+OUT\s+OF\s+REACH(?:\s+OF\s+CHILDREN)?)\b/gi, "")
    // Registration numbers
    .replace(/\s+(?:Reg\.?\s*No\.?|Approval\s*No\.?|Registration\s*No\.?)\s*[:\-–]?\s*\d+.*/i, "")
    // Document references
    .replace(/\b(?:Document|PDF|File|Page|Section)\b/gi, "")
    // Leading/trailing separators and colons
    .replace(/^[\s|\-–:]+|[\s|\-–:]+$/g, "")
    // Multiple whitespace and separators
    .replace(/[\s|\-–:]{2,}/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return null;

  // Enhanced noise detection
  if (cleaned.length > 80) return null; // Overly long suggests metadata noise
  if (cleaned.split(/[:\-–]/).length > 3) return null; // Too many separators suggests metadata

  // Check for remaining noise patterns
  const noisePatterns = [
    /\b(?:document|pdf|file|page|section|apvma|registration|approval)\b/i,
    /\b(?:caution|poison|warning|danger)\b/i
  ];

  if (noisePatterns.some(pattern => pattern.test(cleaned))) return null;

  return cleaned;
}

// Safe droplet fallback inference

/**
 * Infer a conservative droplet requirement when missing in drift-sensitive scenarios
 */
function inferSafeDropletRequirement(sourceData: ChemicalSourceData, chemical: string): string | null {
  const chemicalLower = chemical.toLowerCase();

  // Check for drift-sensitive boundary context
  const hasWaterwayBoundary = sourceData.waterwayWarnings?.some(w =>
    /waterway|stream|river|creek|dam|drain/i.test(w)
  );

  const hasCropBoundary = sourceData.susceptibleCropWarnings?.some(w =>
    /susceptible\s+crop|toxic\s+to.*crop|legume|cotton|ornamental|vine/i.test(w)
  );

  // Check for drift-sensitive chemicals
  const isDriftSensitive = [
    '2,4-d', '24d', '24-d',  // High volatility risk
    'metsulfuron',           // Extremely low dose, high drift risk
  ].some(name => chemicalLower.includes(name));

  // Determine if inference is warranted
  const needsInference = hasWaterwayBoundary || hasCropBoundary || isDriftSensitive;

  if (!needsInference) return null;

  // Conservative fallback logic
  if (hasWaterwayBoundary && hasCropBoundary) {
    return "VERY COARSE or larger (inferred — conservative drift control)";
  } else if (hasWaterwayBoundary || hasCropBoundary || isDriftSensitive) {
    return "COARSE or larger (inferred — conservative drift control)";
  }

  return null;
}

// Conflict detection helpers

function isWindConflict(weatherText: string, extractedWindLimits: string): boolean {
  const extracted = extractedWindLimits.toLowerCase();

  // Check if weather text mentions wind constraints
  if (!/\bwind\b/.test(weatherText)) return false;

  // Look for conflicting numeric wind limits
  const weatherWindMatch = weatherText.match(/wind.*?(\d+)\s*km\/h/);
  const extractedWindMatch = extracted.match(/(\d+).*?km\/h/);

  if (weatherWindMatch && extractedWindMatch) {
    // Both mention specific wind speeds - likely conflicting
    return true;
  }

  // Check for conflicting inversion mentions if extracted has inversion
  if (/inversion/.test(extracted) && /inversion/.test(weatherText)) {
    return true;
  }

  // Check for conflicting calm condition mentions
  if (/calm|less than/.test(extracted) && /calm|less than/.test(weatherText)) {
    return true;
  }

  return false;
}

function isTemperatureConflict(weatherText: string, extractedTempLimits: string): boolean {
  const extracted = extractedTempLimits.toLowerCase();

  // Check if weather text mentions temperature constraints
  if (!/\btemperature|\b\d+.*°?c\b/.test(weatherText)) return false;

  // Look for conflicting numeric temperature limits
  const weatherTempMatch = weatherText.match(/(\d+)\s*°?\s*c/);
  const extractedTempMatch = extracted.match(/(\d+)\s*°?\s*c/);

  if (weatherTempMatch && extractedTempMatch) {
    // Both mention specific temperatures - likely conflicting
    return true;
  }

  // Check for conflicting inversion mentions
  if (/inversion/.test(extracted) && /inversion/.test(weatherText)) {
    return true;
  }

  return false;
}

function isAerialRateConflict(weatherText: string, extractedRate: string): boolean {
  // Check if weather text mentions aerial/spray volume
  if (!/aerial|spray.*volume|l\/ha|minimum.*volume/i.test(weatherText)) return false;

  const weatherRateMatch = weatherText.match(/(\d+)\s*l\/ha/i);
  const extractedRateMatch = extractedRate.match(/(\d+)\s*l\/ha/i);

  if (weatherRateMatch && extractedRateMatch) {
    // Both mention specific rates - likely conflicting
    return true;
  }

  return false;
}

function isDropletConflict(weatherText: string, extractedDroplet: string): boolean {
  // Check if weather text mentions droplet requirements
  if (!/droplet|coarse|fine|medium/i.test(weatherText)) return false;

  const dropletKeywords = ['very coarse', 'coarse', 'medium', 'fine', 'very fine'];
  const extractedKeyword = dropletKeywords.find(k => extractedDroplet.toLowerCase().includes(k));
  const weatherKeyword = dropletKeywords.find(k => weatherText.toLowerCase().includes(k));

  if (extractedKeyword && weatherKeyword) {
    // Both mention specific droplet sizes - likely conflicting
    return true;
  }

  return false;
}

function isWithholdingConflict(weatherText: string, extractedWithholding: string): boolean {
  // Check if weather text mentions grazing/withholding
  if (!/graze|grazing|withholding|stock.*food|cut.*treated/i.test(weatherText)) return false;

  const weatherDaysMatch = weatherText.match(/(\d+)\s*days?/i);
  const extractedDaysMatch = extractedWithholding.match(/(\d+)\s*days?/i);

  if (weatherDaysMatch && extractedDaysMatch) {
    // Both mention specific withholding periods - likely conflicting
    return true;
  }

  return false;
}

function isBufferConflict(weatherText: string, extractedBuffer: string): boolean {
  // Check if weather text mentions buffer/distance requirements
  if (!/buffer|within.*metre|(\d+)\s*m\s*(?:of|from)/i.test(weatherText)) return false;

  const weatherDistanceMatch = weatherText.match(/(\d+)\s*(?:metres?|meters?|m)/i);
  const extractedDistanceMatch = extractedBuffer.match(/(\d+)\s*m/i);

  if (weatherDistanceMatch && extractedDistanceMatch) {
    // Both mention specific distances - likely conflicting
    return true;
  }

  return false;
}
