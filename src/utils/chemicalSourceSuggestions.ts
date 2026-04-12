import { getChemicalSourceData } from '../ai/sources/getChemicalSourceData';
import { getSourceStatusForChemical } from '../services/sourceManagerStore';

/**
 * Known manufacturer URL patterns for Australian agricultural chemicals.
 * Each entry produces label and/or SDS URL candidates for a given product slug.
 */
interface SourcePattern {
  name: string;
  labelUrl: (slug: string) => string;
  sdsUrl: (slug: string) => string;
}

const SOURCE_PATTERNS: SourcePattern[] = [
  {
    name: 'Corteva (AU)',
    labelUrl: (slug) => `https://www.corteva.com.au/content/dam/dpagco/corteva/au/en/products/labels/${slug}-label.pdf`,
    sdsUrl: (slug) => `https://www.corteva.com.au/content/dam/dpagco/corteva/au/en/products/sds/${slug}-sds.pdf`,
  },
  {
    name: 'Nufarm (AU)',
    labelUrl: (slug) => `https://www.nufarm.com/au/product-labels/${slug}-label.pdf`,
    sdsUrl: (slug) => `https://www.nufarm.com/au/product-sds/${slug}-sds.pdf`,
  },
  {
    name: 'BASF (AU)',
    labelUrl: (slug) => `https://www.basf.com/au/en/products/crop-protection/labels/${slug}-label.pdf`,
    sdsUrl: (slug) => `https://www.basf.com/au/en/products/crop-protection/sds/${slug}-sds.pdf`,
  },
  {
    name: 'Syngenta (AU)',
    labelUrl: (slug) => `https://www.syngenta.com.au/sites/default/files/labels/${slug}-label.pdf`,
    sdsUrl: (slug) => `https://www.syngenta.com.au/sites/default/files/sds/${slug}-sds.pdf`,
  },
];

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface SuggestionResult {
  labelSuggestions: string[];
  sdsSuggestions: string[];
}

/**
 * Generate deterministic URL suggestions for a chemical.
 * Priority:
 *   1. Existing source data (getChemicalSourceData) — known-good local paths
 *   2. Source Manager record — previously stored URLs
 *   3. Manufacturer pattern URLs — speculative but plausible
 */
export function generateUrlSuggestions(canonicalName: string): SuggestionResult {
  const labelSuggestions: string[] = [];
  const sdsSuggestions: string[] = [];
  const seenLabels = new Set<string>();
  const seenSds = new Set<string>();

  const addLabel = (url: string) => {
    if (url && !seenLabels.has(url)) {
      seenLabels.add(url);
      labelSuggestions.push(url);
    }
  };
  const addSds = (url: string) => {
    if (url && !seenSds.has(url)) {
      seenSds.add(url);
      sdsSuggestions.push(url);
    }
  };

  // 1. Source data (known-good local paths)
  const sourceData = getChemicalSourceData(canonicalName);
  if (sourceData.sourceStatus !== 'not_found') {
    addLabel(sourceData.labelUrl);
    addSds(sourceData.sdsUrl);
  }

  // 2. Source Manager record
  const smRecord = getSourceStatusForChemical(canonicalName);
  if (smRecord) {
    addLabel(smRecord.labelUrl);
    addSds(smRecord.sdsUrl);
  }

  // 3. Manufacturer pattern URLs
  const slug = toSlug(canonicalName);
  for (const pattern of SOURCE_PATTERNS) {
    addLabel(pattern.labelUrl(slug));
    addSds(pattern.sdsUrl(slug));
  }

  return { labelSuggestions, sdsSuggestions };
}
