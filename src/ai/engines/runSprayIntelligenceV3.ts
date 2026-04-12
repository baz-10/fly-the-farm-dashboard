import { InvokeInput } from "../types/invoke";

export async function runSprayIntelligenceV3(input: InvokeInput) {
  const boundaries = input.boundaries?.toLowerCase() || "";
  const terrain = input.terrain?.toLowerCase() || "";
  const target = input.target?.toLowerCase() || "";

  let executionReadiness = "PROVISIONAL EXECUTION";
  const executionBands: string[] = [];
  const executionNotes: string[] = [];
  const manualReview: string[] = [];

  const hasCreek = boundaries.includes("creek") || boundaries.includes("water");
  const hasCrop = boundaries.includes("crop");
  const denseTerrain =
    terrain.includes("dense") ||
    terrain.includes("drainage") ||
    terrain.includes("line");
  const woodyTarget = target.includes("woody");

  if (hasCreek || hasCrop) {
    executionBands.push("Boundary Mode: MAXIMUM");
    executionBands.push("Droplet Strategy: COARSER");
    executionBands.push("Speed Band: SLOWER");
    executionBands.push("Height Band: LOWER");
    executionNotes.push("Sensitive boundaries require conservative execution.");
    manualReview.push("Boundary protections require verification before execution.");
  } else {
    executionBands.push("Boundary Mode: STANDARD");
    executionBands.push("Droplet Strategy: GENERAL");
    executionBands.push("Speed Band: STANDARD");
    executionBands.push("Height Band: STANDARD");
  }

  if (woodyTarget) {
    executionBands.push("Water Rate Band: HIGHER");
    executionNotes.push("Woody weed context pushes coverage planning upward.");
  } else {
    executionBands.push("Water Rate Band: STANDARD");
  }

  if (denseTerrain) {
    executionNotes.push("Dense or variable terrain increases coverage complexity.");
  }

  if (input.aircraft) {
    executionNotes.push(`Aircraft context provided: ${input.aircraft}`);
  } else {
    executionReadiness = "CONDITIONAL";
    manualReview.push("Aircraft not provided.");
  }

  manualReview.push("UAV/drone permission still requires verification.");
  manualReview.push("Verified source-backed execution logic not yet connected to vault documents.");

  return {
    status: "connected",
    engine: "v3",
    executionReadiness,
    executionBands,
    executionNotes,
    manualReview,
  };
}
