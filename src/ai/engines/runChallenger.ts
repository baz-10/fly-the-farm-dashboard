import { InvokeInput } from "../types/invoke";

export async function runChallenger(input: InvokeInput, chainResult: any) {
  const flags: string[] = [];
  const recommendations: string[] = [];

  const boundaries = input.boundaries?.toLowerCase() || "";
  const hasCreek = boundaries.includes("creek") || boundaries.includes("water");
  const hasCrop = boundaries.includes("crop");

  if (hasCreek) {
    flags.push("HIGH RISK: Waterway proximity requires conservative drift protection and regulatory review.");
  }

  if (hasCrop) {
    flags.push("HIGH RISK: Susceptible crop boundary increases off-target damage consequence.");
  }

  if (chainResult?.v4?.numericPreset?.waterRate) {
    flags.push("CHECK: Numeric preset is Fly The Farm guidance only, not verified source-backed execution.");
  }

  if (chainResult?.v4?.manualReview?.length) {
    flags.push("CHECK: Manual review items remain unresolved.");
  }

  if (chainResult?.v3?.executionReadiness === "PROVISIONAL EXECUTION") {
    flags.push("CHECK: Execution readiness is provisional, not final.");
  }

  recommendations.push("Do not proceed until unresolved manual review items are checked.");
  recommendations.push("Use source-backed constraints as the controlling layer over presets.");
  recommendations.push("Treat waterway and crop boundaries as high-consequence edges.");

  return {
    status: "connected",
    engine: "challenger",
    flags,
    recommendations,
  };
}
