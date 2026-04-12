import { InvokeInput } from "../types/invoke";
import { getChemicalSourceData } from "../sources/getChemicalSourceData";

/**
 * Clean product name for operator display, falling back to canonical input if extracted name is noisy
 */
function cleanDisplayProductName(extractedName: string, fallbackChemical: string): string {
  let cleaned = extractedName.trim();

  // Remove common metadata patterns
  cleaned = cleaned
    // APVMA approval numbers
    .replace(/APVMA\s+Approval\s+No\.?\s*[:\-–]?\s*\d+/gi, "")
    // Label Name prefix
    .replace(/^Label\s+Name\s*[:\-–]?\s*/i, "")
    // Signal headings
    .replace(/\b(?:CAUTION|POISON|WARNING|DANGER|KEEP\s+OUT\s+OF\s+REACH(?:\s+OF\s+CHILDREN)?)\b/gi, "")
    // Registration numbers
    .replace(/\s+(?:Reg\.?\s*No\.?|Approval\s*No\.?)\s*[:\-–]?\s*\d+.*/i, "")
    // Leading/trailing separators
    .replace(/^[\s|\-–]+|[\s|\-–]+$/g, "")
    // Multiple whitespace
    .replace(/\s{2,}/g, " ")
    .trim();

  // If result is empty, too long, or contains document metadata, use fallback
  if (!cleaned ||
      cleaned.length > 100 ||
      cleaned.split(/[:\-–]/).length > 3 ||
      /\b(?:document|pdf|file|page|section)\b/i.test(cleaned)) {
    return fallbackChemical;
  }

  return cleaned;
}

/**
 * Prioritize the most important 8-12 DO NOT statements for operator display,
 * avoiding duplication with label warnings
 */
function prioritizeDoNotStatements(
  allStatements: string[],
  cropWarnings: string[],
  waterwayWarnings: string[]
): string[] {
  if (allStatements.length === 0) return [];

  // Create a set of label warning keywords to avoid duplication
  const labelWarningKeywords = new Set<string>();
  [...cropWarnings, ...waterwayWarnings].forEach(warning => {
    const words = warning.toLowerCase().match(/\b\w+\b/g) || [];
    words.forEach(word => labelWarningKeywords.add(word));
  });

  // Priority keywords for operational statements (highest value for operators)
  const priorityKeywords = [
    { words: ['wind', 'speed', 'exceeds', 'km/h'], weight: 10, category: 'wind' },
    { words: ['inversion', 'temperature', 'inversion'], weight: 10, category: 'inversion' },
    { words: ['rain', 'rainfall', 'wet'], weight: 9, category: 'rainfall' },
    { words: ['drift', 'spray'], weight: 9, category: 'drift' },
    { words: ['calm', 'conditions'], weight: 8, category: 'wind' },
    { words: ['graze', 'grazing', 'withholding'], weight: 8, category: 'withholding' },
    { words: ['temperature', 'exceeds', '°c'], weight: 7, category: 'temperature' },
    { words: ['stress', 'stressed', 'crop'], weight: 6, category: 'crop_stress' },
  ];

  // Score statements by operational value and avoid label warning duplicates
  const scoredStatements = allStatements.map(stmt => {
    const lower = stmt.toLowerCase();
    let score = 0;
    let categories = new Set<string>();

    // Check for duplication with label warnings
    const hasDuplication = Array.from(labelWarningKeywords).some(keyword =>
      lower.includes(keyword) && keyword.length > 3
    );

    if (hasDuplication) {
      score -= 5; // Deprioritize duplicate content
    }

    // Score by priority keywords
    priorityKeywords.forEach(({ words, weight, category }) => {
      const matches = words.filter(word => lower.includes(word)).length;
      if (matches > 0) {
        score += (matches / words.length) * weight;
        categories.add(category);
      }
    });

    return { statement: stmt, score, categories: Array.from(categories) };
  });

  // Sort by score and take top 8-12, ensuring category diversity
  const sorted = scoredStatements
    .filter(item => item.score > 0) // Only include statements with some operational relevance
    .sort((a, b) => b.score - a.score);

  const selected: string[] = [];
  const usedCategories = new Set<string>();

  // First pass: take highest scoring statements from different categories
  for (const item of sorted) {
    if (selected.length >= 12) break;

    const hasNewCategory = item.categories.some(cat => !usedCategories.has(cat));
    if (hasNewCategory || selected.length < 6) {
      selected.push(item.statement);
      item.categories.forEach(cat => usedCategories.add(cat));
    }
  }

  // Second pass: fill remaining slots with best remaining statements
  for (const item of sorted) {
    if (selected.length >= 12) break;
    if (!selected.includes(item.statement)) {
      selected.push(item.statement);
    }
  }

  return selected;
}

export async function runChemicalIntelligence(input: InvokeInput) {
  const chemical = input.chemical || "Unknown chemical";
  const source = getChemicalSourceData(chemical);

  if (source.sourceStatus === "not_found") {
    return {
      status: "connected",
      engine: "v1",
      product: chemical,
      filesUsed: [],
      extractedSourceFields: {
        productName: chemical,
        applicationMethod:
          "Manual review required — product label not yet available in source data",
        aerialMinWaterRate: "",
        dropletRequirement: "",
        windLimits: "",
        temperatureLimits: "",
        bufferRequirements: "",
        withholding: "",
        keyDoNotStatements: [],
      },
      fallbackNotes: [
        "Manual review required — weather constraints not available for this product",
        "Manual review required — operational constraints not available for this product",
      ],
      boundaryContext: input.boundaries
        ? [`Boundary context provided: ${input.boundaries}`]
        : ["No boundary context provided"],
      labelWarnings: [],
      notFound: [
        `Product "${chemical}" not found in source data — label must be reviewed manually`,
      ],
      manualReview: [
        `Source data not available for ${chemical}. Full label review required before application.`,
      ],
    };
  }

  // Source data available — populate from label/SDS and separate cleanly
  // Enhanced product name cleanup for operator display
  const cleanProductName = cleanDisplayProductName(source.productName, chemical);

  // Ensure clean names are used in Files Used as well
  const finalDisplayName = cleanProductName && cleanProductName !== chemical ?
    cleanProductName :
    (chemical || "Unknown Product");

  const filesUsed: string[] = [];
  if (source.labelAvailable) filesUsed.push(`${finalDisplayName} — Label`);
  if (source.sdsAvailable) filesUsed.push(`${finalDisplayName} — SDS`);

  // REFINED: Separate extracted source fields from fallback notes
  const extractedSourceFields = {
    productName: cleanProductName,
    applicationMethod: source.applicationMethod,
    aerialMinWaterRate: source.aerialMinWaterRate,
    dropletRequirement: source.dropletRequirement,
    windLimits: source.windLimits,
    temperatureLimits: source.temperatureLimits,
    bufferRequirements: source.bufferRequirements,
    withholding: source.withholding,
    keyDoNotStatements: prioritizeDoNotStatements(source.keyDoNotStatements, source.susceptibleCropWarnings, source.waterwayWarnings),
  };

  // REFINED: Fallback notes - supplementary weather/restraint wording only
  const fallbackNotes: string[] = [];
  if (source.weatherLimits.length > 0) {
    // Only show fallback weather limits if they don't conflict with extracted fields
    for (const weatherLimit of source.weatherLimits) {
      fallbackNotes.push(`Supplementary: ${weatherLimit}`);
    }
  } else {
    fallbackNotes.push("No supplementary weather constraints found on label");
  }

  // REFINED: Split boundary context from label warnings
  const boundaryContext: string[] = [];
  if (input.boundaries) {
    boundaryContext.push(`Boundary context provided: ${input.boundaries}`);
  } else {
    boundaryContext.push("No boundary context provided");
  }

  // REFINED: Label warnings - crop/waterway warnings from extraction
  const labelWarnings: string[] = [];
  for (const warning of source.susceptibleCropWarnings) {
    labelWarnings.push(warning);
  }
  for (const warning of source.waterwayWarnings) {
    labelWarnings.push(warning);
  }
  if (labelWarnings.length === 0) {
    labelWarnings.push("No specific crop or waterway warnings on label");
  }

  // Build Critical Label Extract with prioritized statements
  const pending = "Pending verification";
  const prioritizedStatements = prioritizeDoNotStatements(source.keyDoNotStatements, source.susceptibleCropWarnings, source.waterwayWarnings);

  const criticalLabelExtract: string[] = [
    `Aerial min. water rate: ${source.aerialMinWaterRate || pending}`,
    `Droplet size: ${source.dropletRequirement || pending}`,
    `Wind limits: ${source.windLimits || pending}`,
    `Temperature limits: ${source.temperatureLimits || pending}`,
    `Buffer requirements: ${source.bufferRequirements || pending}`,
    `Withholding: ${source.withholding || pending}`,
  ];

  if (prioritizedStatements.length > 0) {
    criticalLabelExtract.push("--- Priority Operational Constraints ---");
    for (const stmt of prioritizedStatements) {
      criticalLabelExtract.push(stmt);
    }
  } else if (source.keyDoNotStatements.length > 0) {
    criticalLabelExtract.push("--- Key DO NOT Statements ---");
    // Show first 3 if prioritization didn't work
    for (const stmt of source.keyDoNotStatements.slice(0, 3)) {
      criticalLabelExtract.push(stmt);
    }
  } else {
    criticalLabelExtract.push("Key DO NOT statements: " + pending);
  }

  return {
    status: "connected",
    engine: "v1",
    product: cleanProductName,
    filesUsed,
    // REFINED: Cleanly separated data sections
    extractedSourceFields,
    fallbackNotes,
    boundaryContext,
    labelWarnings,
    criticalLabelExtract,
    // Legacy compatibility fields (for generateClientReport.ts)
    extractedFields: {
      productName: cleanProductName,
      applicationMethod: source.applicationMethod,
      weatherLimits: fallbackNotes,
      withholding: source.withholding,
    },
    sourceFields: {
      aerialMinWaterRate: source.aerialMinWaterRate,
      dropletRequirement: source.dropletRequirement,
      windLimits: source.windLimits,
      temperatureLimits: source.temperatureLimits,
      bufferRequirements: source.bufferRequirements,
      keyDoNotStatements: source.keyDoNotStatements, // Keep full list for enforcement logic
      susceptibleCropWarnings: source.susceptibleCropWarnings,
      waterwayWarnings: source.waterwayWarnings,
      // Include extraction metadata for source attribution
      extractionMeta: source.extractionMeta,
    },
    notFound: [],
    manualReview: [],
  };
}
