/**
 * Chemical naming utilities for the Fly The Farm dashboard.
 * Produces canonical display names and dashboard-convention filenames.
 */

function toTitleCase(str: string): string {
  return str.replace(/\S+/g, (word) => {
    // Keep fully uppercase short tokens (e.g. WG, SL, EC) as-is
    if (word.length <= 3 && word === word.toUpperCase()) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Derive a canonical display name from any raw chemical input.
 * Trims, normalises spacing, and title-cases.
 */
export function canonicalChemicalName(name: string): string {
  let s = name.trim().replace(/\s{2,}/g, ' ');
  if (!s) return s;
  s = toTitleCase(s);
  return s;
}

/**
 * Build the dashboard-convention label and SDS filenames + paths
 * from a canonical chemical name.
 *
 * Examples:
 *   "Grazon Extra"     -> grazon-extra-label.pdf / grazon-extra-sds.pdf
 *   "Metsulfuron 600 WG" -> metsulfuron-600-wg-label.pdf / ...
 *   "2,4-D"            -> 24d-label.pdf / 24d-sds.pdf
 */
export function buildChemicalDocFilenames(canonicalName: string): {
  labelFilename: string;
  sdsFilename: string;
  labelPath: string;
  sdsPath: string;
} {
  // Special case for 2,4-D variants
  const normalized = canonicalName.toLowerCase().trim();
  if (normalized === '2,4-d' || normalized.startsWith('2,4-d ') ||
      normalized === '24d' || normalized === '24-d') {
    const labelFilename = '24d-label.pdf';
    const sdsFilename = '24d-sds.pdf';
    return {
      labelFilename,
      sdsFilename,
      labelPath: `/docs/${labelFilename}`,
      sdsPath: `/docs/${sdsFilename}`,
    };
  }

  const slug = canonicalName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const labelFilename = `${slug}-label.pdf`;
  const sdsFilename = `${slug}-sds.pdf`;

  return {
    labelFilename,
    sdsFilename,
    labelPath: `/docs/${labelFilename}`,
    sdsPath: `/docs/${sdsFilename}`,
  };
}
