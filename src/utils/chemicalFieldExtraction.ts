import { SourceExtraction } from "../types/sourceExtraction";

/**
 * Extract structured chemical fields from raw PDF text using deterministic
 * regex-based heuristics. v1 — no AI, no OCR.
 *
 * When sourceDocumentType is "sds", label-only operational fields are not
 * aggressively populated and crop/waterway patterns are tightened to avoid
 * false positives from generic hazard/toxicity language.
 */
export function extractChemicalFields(
  chemical: string,
  sourceDocumentType: "label" | "sds",
  text: string
): Omit<SourceExtraction, "id" | "extractedAt" | "sourceUrl"> {
  const confidenceNotes: string[] = [];
  const isSds = sourceDocumentType === "sds";

  if (isSds) {
    confidenceNotes.push(
      "SDS document — operational spray fields (water rate, droplet, wind, temp, withholding, buffer) are not label-confirmed."
    );
  }

  // ── Detect embedded file attachments ──
  if (!isSds && /directions\s+for\s+use[^.]*file\s+attachment/i.test(text)) {
    confidenceNotes.push(
      "Directions for Use table may not be fully present in extracted PDF text; manual label review still required for full use-pattern confirmation."
    );
  }

  // ── Product Name ──
  const productName = extractProductName(text, chemical, confidenceNotes, isSds);

  // ── Label-primary operational fields ──
  const applicationMethod = isSds ? "" : extractApplicationMethod(text, confidenceNotes);
  const aerialMinWaterRate = isSds ? "" : extractAerialWaterRate(text, confidenceNotes);
  const dropletRequirement = isSds ? "" : extractDropletRequirement(text, confidenceNotes);
  const bufferRequirements = isSds ? "" : extractBufferRequirements(text, confidenceNotes);
  const withholding = isSds ? "" : extractWithholding(text, confidenceNotes);

  // ── DO NOT statements — extract and split ──
  const { operational, general } = extractDoNotStatements(text, confidenceNotes, isSds);

  // ── Wind and Temperature — try dedicated extractors first, then derive from DO NOT ──
  let windLimits = "";
  let temperatureLimits = "";
  let windFoundDirectly = false;
  let tempFoundDirectly = false;

  if (!isSds) {
    windLimits = extractWindLimits(text, confidenceNotes);
    temperatureLimits = extractTemperatureLimits(text, confidenceNotes);

    windFoundDirectly = !!windLimits;
    tempFoundDirectly = !!temperatureLimits;

    // If dedicated extractors came up empty, try deriving from DO NOT statements
    if (!windLimits || !temperatureLimits) {
      const derived = deriveWindTempFromDoNots(operational);
      if (!windLimits && derived.wind) {
        windLimits = derived.wind;
        confidenceNotes.push(`Wind limits inferred from operational DO NOT statement (no dedicated wind section found).`);
      }
      if (!temperatureLimits && derived.temp) {
        temperatureLimits = derived.temp;
        confidenceNotes.push(`Temperature limits inferred from operational DO NOT statement (no dedicated temperature section found).`);
      }
    }

    // Add confidence summary
    if (windFoundDirectly && tempFoundDirectly) {
      confidenceNotes.push("Both wind and temperature limits found via dedicated label sections.");
    } else if (!windLimits && !temperatureLimits) {
      confidenceNotes.push("No wind or temperature limits could be extracted from this document.");
    }
  }

  // ── Susceptible Crop Warnings ──
  const susceptibleCropWarnings = extractSusceptibleCropWarnings(text, confidenceNotes, isSds);

  // ── Waterway Warnings ──
  const waterwayWarnings = extractWaterwayWarnings(text, confidenceNotes, isSds);

  if (isSds) {
    confidenceNotes.push(
      "Skipped: application method, aerial water rate, droplet, wind, temperature, withholding, buffer (label-only fields)."
    );
  }

  // ── Status ──
  const fieldsFilled = [
    productName, applicationMethod, aerialMinWaterRate, dropletRequirement,
    windLimits, temperatureLimits, withholding, bufferRequirements,
  ].filter(Boolean).length;
  const arraysFilled = [operational, general, susceptibleCropWarnings, waterwayWarnings]
    .filter((a) => a.length > 0).length;
  const total = fieldsFilled + arraysFilled;

  let extractionStatus: SourceExtraction["extractionStatus"];
  if (isSds) {
    if (total >= 2) extractionStatus = "success";
    else if (total >= 1) extractionStatus = "partial";
    else extractionStatus = "failed";
  } else {
    if (total >= 6) extractionStatus = "success";
    else if (total >= 2) extractionStatus = "partial";
    else extractionStatus = "failed";
  }

  if (total === 0) {
    confidenceNotes.push("No structured fields could be extracted from this document.");
  }

  return {
    chemical,
    sourceDocumentType,
    extractionStatus,
    productName,
    applicationMethod,
    aerialMinWaterRate,
    dropletRequirement,
    windLimits,
    temperatureLimits,
    withholding,
    operationalDoNotStatements: operational,
    generalDoNotStatements: general,
    susceptibleCropWarnings,
    waterwayWarnings,
    bufferRequirements,
    rawExtractedTextPreview: text.slice(0, 1500),
    confidenceNotes,
  };
}

// ─── Product Name ───────────────────────────────────────────

function extractProductName(text: string, chemical: string, notes: string[], isSds: boolean): string {
  // Try structured header patterns
  const patterns = [
    /product\s*name\s*[:\-–]\s*([^\n.]{3,80})/i,
    /trade\s*name\s*[:\-–]\s*([^\n.]{3,80})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const cleaned = cleanProductName(m[1].trim());
      notes.push(`Product name extracted from ${isSds ? "SDS" : "label"} header.`);
      return cleaned;
    }
  }

  // Look for the chemical name appearing near the start in title case
  const first500 = text.slice(0, 500);
  const titlePattern = new RegExp(
    `(${escapeRegex(chemical)}[^\\n]{0,40}(?:herbicide|insecticide|fungicide|adjuvant))`,
    "i"
  );
  const titleMatch = first500.match(titlePattern);
  if (titleMatch) {
    const cleaned = cleanProductName(titleMatch[1].trim());
    notes.push("Product name inferred from document title area.");
    return cleaned;
  }

  notes.push("Product name not confidently identified — using input chemical name.");
  return chemical;
}

/**
 * Strip surrounding metadata from an extracted product name:
 *   - APVMA approval numbers
 *   - "Label Name" prefix
 *   - "Product Name" prefix
 *   - Signal headings (CAUTION, POISON, WARNING, DANGER, KEEP OUT OF REACH)
 *   - Trailing reg/approval numbers
 *   - Document metadata
 */
function cleanProductName(raw: string): string {
  let s = raw.trim();

  // Remove metadata patterns more aggressively
  s = s
    // APVMA approval numbers like "APVMA Approval No: 12345"
    .replace(/APVMA\s+Approval\s+No\.?\s*[:\-–]?\s*\d+/gi, "")
    // Label/Product name prefixes
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

  // Additional validation - if result is empty or still noisy, return original trimmed
  if (!s || s.length === 0) {
    return raw.trim();
  }

  // If result is too long or contains noise patterns, use original
  if (s.length > 80 ||
      /\b(?:apvma|document|pdf|file|page|section|registration|approval)\b/i.test(s)) {
    return raw.trim();
  }

  return s;
}

// ─── Application Method ─────────────────────────────────────

function extractApplicationMethod(text: string, notes: string[]): string {
  const patterns = [
    /(?:application\s*(?:method|rate|directions?)[:\-–]?\s*)([^.]*(?:aerial|ground|foliar|spray)[^.]*\.)/i,
    /(apply\s+(?:as\s+)?a\s+foliar\s+spray[^.]*\.)/i,
    /(for\s+aerial\s+application[^.]*\.)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      notes.push("Application method extracted from label text.");
      return m[1].trim();
    }
  }
  notes.push("Application method not found in document.");
  return "";
}

// ─── Aerial Water Rate ──────────────────────────────────────

function extractAerialWaterRate(text: string, notes: string[]): string {
  const patterns = [
    /minimum\s+(?:spray\s+)?volume\s+(?:of\s+)?(\d+)\s*L\/ha/i,
    /aerial\s+[^.]*?(\d+)\s*L\/ha/i,
    /(\d+)\s*L\/ha\s*(?:for\s+)?aerial/i,
    /spray\s+volume\s*[:\-–]?\s*(\d+)\s*L\/ha/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      notes.push(`Aerial minimum water rate found: ${m[1]} L/ha.`);
      return `${m[1]} L/ha`;
    }
  }
  notes.push("Aerial minimum water rate not found in document.");
  return "";
}

// ─── Droplet Requirement ────────────────────────────────────

function extractDropletRequirement(text: string, notes: string[]): string {
  const patterns = [
    /(VERY\s+COARSE|EXTREMELY\s+COARSE|COARSE|MEDIUM|FINE|VERY\s+FINE)\s+or\s+(larger|coarser)/i,
    /droplet\s+size[:\-–]?\s*(VERY\s+COARSE|EXTREMELY\s+COARSE|COARSE|MEDIUM|FINE)/i,
    /using\s+(VERY\s+COARSE|EXTREMELY\s+COARSE|COARSE|MEDIUM|FINE)\s+or\s+(larger|coarser)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const size = m[1].toUpperCase();
      const qualifier = m[2] ? ` or ${m[2].toLowerCase()}` : "";
      notes.push(`Droplet requirement found: ${size}${qualifier}.`);
      return `${size}${qualifier}`;
    }
  }

  const standalone = text.match(/(?:use|using|with)\s+(VERY\s+COARSE|EXTREMELY\s+COARSE|COARSE|MEDIUM)\s+droplet/i);
  if (standalone) {
    notes.push(`Droplet requirement found: ${standalone[1].toUpperCase()}.`);
    return standalone[1].toUpperCase();
  }

  notes.push("Droplet requirement not found in document.");
  return "";
}

// ─── Wind Limits ────────────────────────────────────────────

function extractWindLimits(text: string, notes: string[]): string {
  const parts: string[] = [];

  // Priority 1: Numeric ranges "wind speed is between 3 and 20 kilometres per hour"
  const windRange = text.match(/wind\s+speed\s+is\s+between\s+(\d+)\s+and\s+(\d+)\s+kilometres?\s+per\s+hour/i);
  if (windRange) {
    const result = `${windRange[1]}–${windRange[2]} km/h`;
    notes.push(`Numeric wind range found: ${windRange[1]}-${windRange[2]} km/h.`);
    return result;
  }

  // Priority 2: Standard min/max patterns
  // "wind speed exceeds 20 km/h"
  const maxWind = text.match(/wind\s+speed\s+exceeds?\s+(\d+)\s*km\/h/i);
  if (maxWind) parts.push(`max ${maxWind[1]} km/h`);

  // "wind in excess of 15 km/hour" (common APVMA label wording)
  if (!maxWind) {
    const excessWind = text.match(/wind\s+in\s+excess\s+of\s+(\d+)\s*km\/h(?:our)?/i);
    if (excessWind) parts.push(`max ${excessWind[1]} km/h`);
  }

  // "wind speed less than 3 km/h"
  const minWind = text.match(/wind\s+speed\s+(?:is\s+)?less\s+than\s+(\d+)\s*km\/h/i);
  if (minWind) parts.push(`min ${minWind[1]} km/h`);

  // Calm conditions
  if (/calm\s+conditions/i.test(text) || /ground[- ]?level\s+wind\s+speed\s+(?:is\s+)?less\s+than\s+3\s*km\/h/i.test(text)) {
    if (!minWind) parts.push("no calm conditions");
  }

  // Temperature inversion (secondary priority to numeric ranges)
  if (/temperature\s+inversion/i.test(text)) {
    parts.push("no inversion");
  }

  if (parts.length > 0) {
    const result = parts.join(", ");
    notes.push(`Wind limits extracted: ${result}.`);
    return result;
  }

  notes.push("Wind limits not found via dedicated patterns.");
  return "";
}

// ─── Temperature Limits ─────────────────────────────────────

function extractTemperatureLimits(text: string, notes: string[]): string {
  // Priority 1: Explicit numeric temperature limits
  const patterns = [
    /(?:do\s+not\s+apply\s+when\s+)?temperatures?\s+exceed(?:s|ing)?\s+(\d+)\s*°?\s*C/i,
    /(?:do\s+not\s+apply\s+)?(?:above|over)\s+(\d+)\s*°?\s*C/i,
    /temperature\s+(?:limit|maximum|max)\s*[:\-–]?\s*(\d+)\s*°?\s*C/i,
    // "air temperatures above 35 o C" or "35 °C"
    /air\s+temperatures?\s+above\s+(\d+)\s*[°o]?\s*C/i,
    // Volatility-specific patterns for chemicals like 2,4-D
    /above\s+(\d+)\s*°?\s*C\s+due\s+to\s+(?:increased\s+)?volatility/i,
    /(\d+)\s*°?\s*C\s+(?:.*?)(?:volatility|vapor|vapour)\s+(?:risk|drift)/i,
  ];

  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const temp = m[1];
      let reason = "";
      if (/volatility|vapor|vapour/i.test(m[0])) {
        reason = " (volatility risk)";
      }
      const result = `Do not apply above ${temp}°C${reason}`;
      notes.push(`Numeric temperature limit found: ${temp}°C.`);
      return result;
    }
  }

  // Priority 2: Humidity constraints
  const humidity = text.match(/relative\s+humidity\s+(?:is\s+)?(?:below|less\s+than)\s+(\d+)\s*%/i);
  if (humidity) {
    const result = `Avoid below ${humidity[1]}% relative humidity`;
    notes.push(`Humidity constraint found: below ${humidity[1]}% RH.`);
    return result;
  }

  // Priority 3: Temperature inversion warnings
  if (/temperature\s+inversion/i.test(text)) {
    notes.push("Temperature inversion warning found (no specific temperature limit).");
    return "Avoid temperature inversion conditions";
  }

  // Priority 4: General temperature cautions
  if (/high\s+temperature/i.test(text) && /low\s+humidity/i.test(text)) {
    notes.push("General temperature/humidity caution noted but no specific limit.");
    return "Avoid high temperatures and low humidity";
  }

  // Check for volatility warnings without specific temperature
  if (/volatility|vapor.*drift|vapour.*drift/i.test(text) && /hot\s+conditions|high.*temperature/i.test(text)) {
    notes.push("Volatility warning found but no specific temperature limit.");
    return "Avoid hot conditions (volatility risk)";
  }

  notes.push("Temperature limits not found via dedicated patterns.");
  return "";
}

// ─── Derive wind/temp from DO NOT statements ────────────────

/**
 * Some labels embed wind and temperature limits in a single compound DO NOT
 * statement, e.g.:
 *   "DO NOT apply by aerial application in wind in excess of 15 km/hour
 *    and/or air temperatures above 35 °C."
 *
 * This function scans operational DO NOT statements for embedded values.
 */
function deriveWindTempFromDoNots(
  statements: string[]
): { wind: string; temp: string } {
  let wind = "";
  let temp = "";

  for (const stmt of statements) {
    // Wind: "wind in excess of N km/hour" or "wind speed exceeds N km/h"
    if (!wind) {
      const wm = stmt.match(/wind\s+(?:in\s+excess\s+of|speed\s+exceeds?)\s+(\d+)\s*km\/h(?:our)?/i);
      if (wm) {
        const aerial = /aerial/i.test(stmt) ? " for aerial application" : "";
        wind = `${wm[1]} km/h maximum${aerial}`;
      }
    }

    // Temperature: "air temperatures above N °C" or "temperatures exceed N °C"
    if (!temp) {
      const tm = stmt.match(/(?:air\s+)?temperatures?\s+(?:above|exceed(?:s|ing)?)\s+(\d+)\s*[°o]?\s*C/i);
      if (tm) {
        const aerial = /aerial/i.test(stmt) ? " for aerial application" : "";
        temp = `${tm[1]}°C maximum${aerial}`;
      }
    }

    if (wind && temp) break;
  }

  return { wind, temp };
}

// ─── Withholding ────────────────────────────────────────────

function extractWithholding(text: string, notes: string[]): string {
  const patterns = [
    /withholding\s*(?:period)?\s*[:\-–]\s*([^\n.]{5,150}\.?)/i,
    /(do\s+not\s+graze\s+or\s+cut[^.]*\.\s*)/i,
    /(nil\s+withholding\s+period)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      notes.push("Withholding period extracted from document.");
      return m[1].trim().replace(/\s+/g, " ");
    }
  }

  const grazing = text.match(/grazing?\s+(?:whp|withholding)\s*[:\-–]?\s*(\d+\s*days?)/i);
  if (grazing) {
    notes.push("Withholding period extracted from grazing WHP.");
    return `Do not graze for ${grazing[1]} after application.`;
  }

  notes.push("Withholding period not found in document.");
  return "";
}

// ─── DO NOT Statements (split into operational / general) ───

// Refined operational indicators — prioritize spray application decisions
const OPERATIONAL_INDICATORS = [
  /\bappl(?:y|ication)\b/i,
  /\bspray(?:ing)?\b/i,
  /\bwind\b/i,
  /\brain\b/i,
  /\btemperature/i,
  /\binversion\b/i,
  /\bdrift\b/i,
  /\bwaterway|stream|river|dam|drain|creek\b/i,
  /\bsusceptible\s+crop|crops?|legume|cotton|ornamental|vine\b/i,
  /\bgraze|grazing|stock\s+food\b/i,
  /\brecrop|re-crop|plant|replant\b/i,
  /\bbuffer\b/i,
  /\baerial\b/i,
  /\bground\s+equipment\b/i,
  /\bcalm\s+condition/i,
  /\bfoliar\b/i,
  /\bweather\b/i,
];

// General stewardship indicators
const GENERAL_INDICATORS = [
  /\bstorage|store\b/i,
  /\bdispos(?:e|al)\b/i,
  /\bcontainer\b/i,
  /\bdrum\b/i,
  /\bpackag/i,
  /\brefill\b/i,
  /\btransport/i,
  /\boff[- ]?farm\b/i,
  /\bempty\s+container\b/i,
  /\btriple\s+rins/i,
  /\blandfill\b/i,
  /\bPPE|protective\s+equipment\b/i,
  /\bequipment\s+(?:cleaning|maintenance)\b/i,
];

function extractDoNotStatements(
  text: string,
  notes: string[],
  isSds: boolean
): { operational: string[]; general: string[] } {
  const operational: string[] = [];
  const general: string[] = [];
  const seen = new Set<string>();
  const duplicateMap = new Map<string, string>(); // normalized -> original

  const doNotPattern = /(?:DO\s+NOT|Do\s+not)\s+[^.!]{8,200}[.!]/g;
  let match: RegExpExecArray | null;
  while ((match = doNotPattern.exec(text)) !== null) {
    let stmt = match[0].trim().replace(/\s+/g, " ");

    // For SDS, skip generic safety/first-aid DO NOTs
    if (isSds) {
      if (/induce\s+vomit/i.test(stmt)) continue;
      if (/mouth\s+to\s+mouth/i.test(stmt)) continue;
      if (/personal\s+protective/i.test(stmt)) continue;
      if (/remove\s+contaminated\s+clothing/i.test(stmt)) continue;
      if (/first\s+aid/i.test(stmt)) continue;
      if (/fire\s+fight/i.test(stmt)) continue;
      if (/wash\s+hands/i.test(stmt)) continue;
      if (/get\s+medical\s+attention/i.test(stmt)) continue;
    }

    // Advanced deduplication — normalize similar statements
    const normalized = stmt.toLowerCase()
      .replace(/\bdo\s+not\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    // Check for near-duplicates (similar meaning)
    let isDuplicate = false;
    duplicateMap.forEach((existingStmt, existingNorm) => {
      if (isDuplicate) return;
      const similarity = calculateSimilarity(normalized, existingNorm);
      if (similarity > 0.85) { // 85% similar = duplicate
        isDuplicate = true;
        // Keep the more specific version
        if (stmt.length > existingStmt.length) {
          duplicateMap.set(existingNorm, stmt); // Update to longer version
        }
      }
    });

    if (isDuplicate) continue;
    if (seen.has(stmt.toLowerCase())) continue;

    seen.add(stmt.toLowerCase());
    duplicateMap.set(normalized, stmt);

    // Classify: operational vs general
    const isOperational = OPERATIONAL_INDICATORS.some((p) => p.test(stmt));
    const isGeneral = GENERAL_INDICATORS.some((p) => p.test(stmt));

    if (isOperational && !isGeneral) {
      operational.push(stmt);
    } else if (isGeneral && !isOperational) {
      general.push(stmt);
    } else if (isOperational && isGeneral) {
      // Both match — operational takes priority
      operational.push(stmt);
    } else {
      // Neither matched — check context for better classification
      if (/contaminate|within\s+\d+.*metre|buffer/i.test(stmt)) {
        operational.push(stmt); // Environmental/spatial restrictions are operational
      } else {
        general.push(stmt); // Default to general
      }
    }
  }

  const total = operational.length + general.length;
  if (total > 0) {
    const qualifier = isSds ? " (from SDS — verify against label)" : "";
    notes.push(
      `${total} DO NOT statement(s) extracted${qualifier}: ${operational.length} operational, ${general.length} general.`
    );
  } else {
    notes.push("No DO NOT statements found in document.");
  }

  return { operational, general };
}

// Helper function for similarity calculation
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.split(/\s+/);
  const words2 = str2.split(/\s+/);
  const longer = words1.length > words2.length ? words1 : words2;
  const shorter = words1.length > words2.length ? words2 : words1;

  let matches = 0;
  for (const word of shorter) {
    if (longer.includes(word)) matches++;
  }

  return matches / longer.length;
}

// ─── Susceptible Crop Warnings ──────────────────────────────

// Strict crop keywords that must appear for a statement to qualify
const CROP_KEYWORDS = /\b(?:susceptible\s+crop|crops?|legume[s]?|cotton|ornamental[s]?|vine[s]?|broadleaf\s+crop|tomato|grape[s]?)\b/i;

function extractSusceptibleCropWarnings(text: string, notes: string[], isSds: boolean): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();

  if (isSds) {
    const sdsPatterns = [
      /do\s+not\s+allow\s+spray\s+drift\s+to\s+contact\s+[^.]*(?:crop|legume|cotton|ornamental|vine)[^.]*\./gi,
      /susceptible\s+crop[^.]*\./gi,
      /(?:extremely|highly)\s+toxic\s+to\s+[^.]*(?:crop|legume|cotton|ornamental|vine)[^.]*\./gi,
    ];
    for (const pattern of sdsPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const stmt = m[0].trim().replace(/\s+/g, " ");
        const key = stmt.toLowerCase();

        // Must contain explicit crop keywords
        if (!CROP_KEYWORDS.test(stmt)) continue;

        if (!seen.has(key)) {
          seen.add(key);
          warnings.push(stmt);
        }
      }
    }
  } else {
    // Label: strict matching for crop-specific statements only
    const labelPatterns = [
      /(?:extremely|highly)\s+toxic\s+to\s+[^.]*(?:crop|legume|cotton|ornamental|vine|broadleaf)[^.]*\./gi,
      /susceptible\s+crop[^.]*\./gi,
      /do\s+not\s+allow\s+spray\s+drift\s+to\s+contact\s+[^.]*(?:crop|legume|cotton|ornamental|vine)[^.]*\./gi,
      /do\s+not\s+apply\s+when\s+wind\s+is\s+blowing\s+towards\s+[^.]*(?:crop|legume|cotton|ornamental|vine)[^.]*\./gi,
      /toxic\s+to\s+[^.]*(?:crop|legume|cotton|ornamental|vine)[^.]*\./gi,
    ];
    for (const pattern of labelPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const stmt = m[0].trim().replace(/\s+/g, " ");
        const key = stmt.toLowerCase();

        // Must contain explicit crop keywords — reject generic hazard language
        if (!CROP_KEYWORDS.test(stmt)) continue;

        // Exclude general toxicity/hazard statements not crop-specific
        if (/toxic\s+to\s+aquatic/i.test(stmt)) continue;
        if (/harmful\s+to\s+bees/i.test(stmt)) continue;
        if (/toxic\s+if\s+swallowed/i.test(stmt)) continue;
        if (/harmful\s+if\s+inhaled/i.test(stmt)) continue;
        if (/causes\s+(?:serious\s+)?eye/i.test(stmt)) continue;
        if (/causes\s+skin/i.test(stmt)) continue;
        if (/may\s+cause\s+an\s+allergic/i.test(stmt)) continue;
        if (/avoid\s+contact\s+with\s+skin/i.test(stmt)) continue;

        if (!seen.has(key)) {
          seen.add(key);
          warnings.push(stmt);
        }
      }
    }
  }

  if (warnings.length > 0) {
    const qualifier = isSds ? " (from SDS — verify against label)" : "";
    notes.push(`${warnings.length} susceptible crop warning(s) extracted${qualifier}.`);
  } else {
    notes.push("No susceptible crop warnings found in document.");
  }

  return warnings;
}

// ─── Waterway Warnings ──────────────────────────────────────

// Strict waterway keywords that must appear for classification
const WATERWAY_KEYWORDS = /\b(?:stream|river|waterway|watercourse|runoff|dam|drain|creek|open\s+bodies\s+of\s+water|growing\s+in\s+or\s+over\s+water|aquatic\s+situations?)\b/i;

function extractWaterwayWarnings(text: string, notes: string[], isSds: boolean): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();

  if (isSds) {
    const sdsPatterns = [
      // Traditional contamination patterns
      /(?:DO\s+NOT|do\s+not)\s+contaminate[^.]*(?:waterway|stream|river|watercourse|dam|drain|creek)[^.]*\./gi,
      // Direct application restrictions
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*(?:to\s+)?weeds\s+growing\s+in\s+or\s+over\s+water[^.]*\./gi,
      /(?:DO\s+NOT|do\s+not)\s+spray[^.]*(?:across\s+)?open\s+bodies\s+of\s+water[^.]*\./gi,
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*in\s+aquatic\s+situations?[^.]*\./gi,
      // General application to water
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*(?:directly\s+)?(?:to\s+|over\s+|in\s+)?(?:water|waterway|stream|river|watercourse)[^.]*\./gi,
      // Broader waterway patterns
      /(?:DO\s+NOT|do\s+not)[^.]*(?:waterway|stream|river|watercourse|dam|drain|creek|open\s+bodies\s+of\s+water|aquatic\s+situations?)[^.]*\./gi,
    ];
    for (const pattern of sdsPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const stmt = m[0].trim().replace(/\s+/g, " ");
        const key = stmt.toLowerCase();

        // Must contain explicit waterway keywords
        if (!WATERWAY_KEYWORDS.test(stmt)) continue;

        // Exclude generic environmental/aquatic toxicity statements
        if (/toxic\s+to\s+aquatic\s+(?:organism|life)/i.test(stmt)) continue;
        if (/avoid\s+release\s+to\s+the\s+environment/i.test(stmt)) continue;
        if (/may\s+be\s+harmful\s+to\s+aquatic/i.test(stmt)) continue;

        if (!seen.has(key)) {
          seen.add(key);
          warnings.push(stmt);
        }
      }
    }
  } else {
    // Label: strict matching for waterway-specific statements only
    const labelPatterns = [
      // Traditional contamination patterns
      /(?:DO\s+NOT|do\s+not)\s+contaminate[^.]*(?:waterway|stream|river|watercourse|dam|drain|creek)[^.]*\./gi,
      // Buffer zone patterns
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*(?:metre|meter|m)\s+of\s+(?:any\s+)?(?:waterway|stream|river|watercourse|dam|drain|creek)[^.]*\./gi,
      // Direct application to water/aquatic areas
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*(?:to\s+)?weeds\s+growing\s+in\s+or\s+over\s+water[^.]*\./gi,
      /(?:DO\s+NOT|do\s+not)\s+spray[^.]*(?:across\s+)?open\s+bodies\s+of\s+water[^.]*\./gi,
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*in\s+aquatic\s+situations?[^.]*\./gi,
      // General water application restrictions
      /(?:DO\s+NOT|do\s+not)\s+apply[^.]*(?:directly\s+)?(?:to\s+|over\s+|in\s+)?(?:water|waterway|stream|river|watercourse)[^.]*\./gi,
      // Runoff patterns
      /runoff\s+to\s+(?:waterway|stream|river|watercourse)[^.]*\./gi,
      // Broader waterway contamination patterns
      /(?:DO\s+NOT|do\s+not)[^.]*(?:waterway|stream|river|watercourse|dam|drain|creek|open\s+bodies\s+of\s+water|aquatic\s+situations?)[^.]*\./gi,
    ];
    for (const pattern of labelPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const stmt = m[0].trim().replace(/\s+/g, " ");
        const key = stmt.toLowerCase();

        // Must contain explicit waterway keywords
        if (!WATERWAY_KEYWORDS.test(stmt)) continue;

        // Exclude agronomic/toxicity statements that aren't waterway-specific
        if (/toxic\s+to\s+(?:aquatic\s+(?:organism|life)|fish)/i.test(stmt) && !/contaminate/i.test(stmt)) continue;
        if (/harmful\s+to\s+aquatic/i.test(stmt) && !/contaminate/i.test(stmt)) continue;
        if (/release\s+to\s+the\s+environment/i.test(stmt)) continue;

        if (!seen.has(key)) {
          seen.add(key);
          warnings.push(stmt);
        }
      }
    }
  }

  if (warnings.length > 0) {
    const qualifier = isSds ? " (from SDS — verify against label)" : "";
    notes.push(`${warnings.length} waterway warning(s) extracted${qualifier}.`);
  } else {
    notes.push("No waterway warnings found in document.");
  }

  return warnings;
}

// ─── Buffer Requirements ────────────────────────────────────

function extractBufferRequirements(text: string, notes: string[]): string {
  const patterns = [
    /within\s+(\d+)\s*(?:metres?|meters?|m)\s+of\s+(?:any\s+)?(?:waterway|stream|river|dam|creek)/i,
    /buffer\s+(?:zone|distance|requirement)\s*[:\-–]?\s*(\d+)\s*(?:metres?|meters?|m)/i,
    /(\d+)\s*(?:metres?|meters?|m)\s+(?:buffer|from\s+(?:any\s+)?(?:waterway|water))/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const result = `${m[1]} m from any waterway`;
      notes.push(`Buffer requirement found: ${m[1]}m.`);
      return result;
    }
  }
  notes.push("Buffer requirement not found in document.");
  return "";
}

// ─── Helpers ────────────────────────────────────────────────

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
