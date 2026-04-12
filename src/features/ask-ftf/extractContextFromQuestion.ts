export interface ExtractedContext {
  chemical?: string;
  aircraft?: string;
  target?: string;
  state?: string;
  terrain?: string;
  boundaries?: string;
}

const CHEMICALS = [
  { pattern: /grazon\s*extra/i, value: "Grazon Extra" },
  { pattern: /starane/i, value: "Starane" },
  { pattern: /metsulfuron/i, value: "Metsulfuron" },
  { pattern: /glyphosate/i, value: "Glyphosate" },
  { pattern: /2[,.]4[- ]?d/i, value: "2,4-D" },
];

const AIRCRAFT = [
  { pattern: /\bt25p\b/i, value: "T25P" },
  { pattern: /\bt25\b/i, value: "T25" },
  { pattern: /\bt50\b/i, value: "T50" },
  { pattern: /\bt100\b/i, value: "T100" },
];

const STATES = [
  { pattern: /\bqld\b/i, value: "QLD" },
  { pattern: /\bqueensland\b/i, value: "QLD" },
  { pattern: /\bnsw\b/i, value: "NSW" },
  { pattern: /\bnew south wales\b/i, value: "NSW" },
  { pattern: /\bvic\b/i, value: "VIC" },
  { pattern: /\bvictoria\b/i, value: "VIC" },
  { pattern: /\bwa\b/i, value: "WA" },
  { pattern: /\bwestern australia\b/i, value: "WA" },
  { pattern: /\bsa\b/i, value: "SA" },
  { pattern: /\bsouth australia\b/i, value: "SA" },
  { pattern: /\btas\b/i, value: "TAS" },
  { pattern: /\btasmania\b/i, value: "TAS" },
  { pattern: /\bnt\b/i, value: "NT" },
  { pattern: /\bnorthern territory\b/i, value: "NT" },
  { pattern: /\bact\b/i, value: "ACT" },
];

const BOUNDARIES = [
  { pattern: /susceptible\s*crop/i, value: "susceptible crop" },
  { pattern: /native\s*vegetation/i, value: "native vegetation" },
  { pattern: /\bdwelling/i, value: "dwellings" },
  { pattern: /\bcreek/i, value: "creek" },
  { pattern: /\bwaterway/i, value: "waterway" },
  { pattern: /\bcrop\b/i, value: "crop" },
];

const TERRAIN = [
  { pattern: /mixed\s*terrain/i, value: "mixed terrain" },
  { pattern: /drainage\s*line/i, value: "drainage line" },
  { pattern: /\bdense\b/i, value: "dense" },
  { pattern: /open\s*pasture/i, value: "open pasture" },
  { pattern: /\bforestry\b/i, value: "forestry" },
  { pattern: /\bslope/i, value: "slope" },
];

const TARGETS = [
  { pattern: /woody\s*weed/i, value: "woody weeds" },
  { pattern: /pasture\s*weed/i, value: "pasture weeds" },
  { pattern: /\blantana\b/i, value: "lantana" },
  { pattern: /broadleaf\s*weed/i, value: "broadleaf weeds" },
  { pattern: /grass\s*weed/i, value: "grass weeds" },
];

function matchFirst(
  text: string,
  patterns: { pattern: RegExp; value: string }[]
): string | undefined {
  for (const entry of patterns) {
    if (entry.pattern.test(text)) {
      return entry.value;
    }
  }
  return undefined;
}

function matchAll(
  text: string,
  patterns: { pattern: RegExp; value: string }[]
): string | undefined {
  const matches: string[] = [];
  for (const entry of patterns) {
    if (entry.pattern.test(text) && !matches.includes(entry.value)) {
      matches.push(entry.value);
    }
  }
  return matches.length > 0 ? matches.join(", ") : undefined;
}

export function extractContextFromQuestion(question: string): ExtractedContext {
  return {
    chemical: matchFirst(question, CHEMICALS),
    aircraft: matchFirst(question, AIRCRAFT),
    target: matchFirst(question, TARGETS),
    state: matchFirst(question, STATES),
    terrain: matchAll(question, TERRAIN),
    boundaries: matchAll(question, BOUNDARIES),
  };
}
