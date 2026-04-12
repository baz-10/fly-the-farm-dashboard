import { AskFtfReportRecord } from '../services/askFtfReportStore';

export interface SimilarityInput {
  chemical?: string;
  aircraft?: string;
  target?: string;
  terrain?: string;
  boundaries?: string;
  state?: string;
}

export interface SimilarReportMatch {
  reportId: string;
  jobId: string;
  createdAt: string;
  product: string;
  aircraft: string;
  target: string;
  score: number;
  matchReasons: string[];
  finalRecommendation: string[];
  applicationSettings: string[];
  context: {
    chemical?: string;
    aircraft?: string;
    target?: string;
    state?: string;
    terrain?: string;
    boundaries?: string;
  };
  question: string;
}

/**
 * Normalise a string for comparison: lowercase, trim, collapse whitespace.
 */
function norm(s: string | undefined): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Extract keywords from a string for overlap scoring.
 */
function keywords(s: string | undefined): Set<string> {
  const tokens = norm(s).split(/[\s,;/]+/).filter((t) => t.length > 1);
  return new Set(tokens);
}

/**
 * Score how similar two keyword sets are (Jaccard-like, 0–1).
 */
function keywordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  a.forEach((k) => { if (b.has(k)) overlap++; });
  // Union size = |a| + |b| - overlap
  const union = a.size + b.size - overlap;
  return union > 0 ? overlap / union : 0;
}

/**
 * Score exact or partial string match (0 or 1 for exact, 0.5 for substring).
 */
function fieldMatch(current: string | undefined, saved: string | undefined): number {
  const a = norm(current);
  const b = norm(saved);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.7;
  return 0;
}

// Weights for each dimension
const WEIGHTS = {
  product: 0.35,
  aircraft: 0.2,
  target: 0.25,
  terrain: 0.1,
  boundaries: 0.1,
};

/**
 * Compute a similarity score (0–1) between the current input and a saved report.
 */
export function computeSimilarity(input: SimilarityInput, report: AskFtfReportRecord): number {
  const productScore = fieldMatch(input.chemical, report.product);
  const aircraftScore = fieldMatch(input.aircraft, report.aircraft);
  const targetScore = fieldMatch(input.target, report.target);
  const terrainScore = keywordOverlap(
    keywords(input.terrain),
    keywords(report.context.terrain)
  );
  const boundaryScore = keywordOverlap(
    keywords(input.boundaries),
    keywords(report.context.boundaries)
  );

  return (
    WEIGHTS.product * productScore +
    WEIGHTS.aircraft * aircraftScore +
    WEIGHTS.target * targetScore +
    WEIGHTS.terrain * terrainScore +
    WEIGHTS.boundaries * boundaryScore
  );
}

/**
 * Build human-readable reasons explaining why a report matched.
 */
function buildMatchReasons(input: SimilarityInput, report: AskFtfReportRecord): string[] {
  const reasons: string[] = [];

  const productScore = fieldMatch(input.chemical, report.product);
  if (productScore === 1) reasons.push('Same chemical');
  else if (productScore > 0) reasons.push('Similar chemical');

  const aircraftScore = fieldMatch(input.aircraft, report.aircraft);
  if (aircraftScore === 1) reasons.push('Same aircraft');
  else if (aircraftScore > 0) reasons.push('Similar aircraft');

  const targetScore = fieldMatch(input.target, report.target);
  if (targetScore === 1) reasons.push('Same target');
  else if (targetScore > 0) reasons.push('Similar target');

  const stateScore = fieldMatch(input.state, report.context.state);
  if (stateScore === 1) reasons.push('Same state');

  const terrainOverlap = keywordOverlap(
    keywords(input.terrain),
    keywords(report.context.terrain)
  );
  if (terrainOverlap > 0) reasons.push('Similar terrain');

  const boundaryOverlap = keywordOverlap(
    keywords(input.boundaries),
    keywords(report.context.boundaries)
  );
  if (boundaryOverlap > 0) reasons.push('Similar boundary conditions');

  return reasons;
}

/**
 * Find saved reports most similar to the current input.
 * Returns top `limit` matches with score > 0, sorted descending.
 */
export function getSimilarReports(
  input: SimilarityInput,
  allReports: AskFtfReportRecord[],
  limit: number = 3
): SimilarReportMatch[] {
  const scored: SimilarReportMatch[] = [];

  for (const report of allReports) {
    const score = computeSimilarity(input, report);
    if (score > 0) {
      scored.push({
        reportId: report.id,
        jobId: report.jobId,
        createdAt: report.createdAt,
        product: report.product,
        aircraft: report.aircraft,
        target: report.target,
        score,
        matchReasons: buildMatchReasons(input, report),
        finalRecommendation: report.finalRecommendation,
        applicationSettings: report.clientReport?.applicationSettings || [],
        context: report.context,
        question: report.question,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
