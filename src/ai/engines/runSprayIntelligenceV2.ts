import { InvokeInput } from "../types/invoke";

export async function runSprayIntelligenceV2(input: InvokeInput) {
  const riskFlags: string[] = [];
  const planningNotes: string[] = [];

  // REFINED: Comprehensive waterway exposure detection
  const waterwayTerms = [
    'creek', 'waterway', 'stream', 'river', 'dam', 'drain', 'nearby water'
  ];

  const boundaryText = input.boundaries?.toLowerCase() || '';
  const detectedWaterways: string[] = [];

  for (const term of waterwayTerms) {
    if (boundaryText.includes(term)) {
      detectedWaterways.push(term);
    }
  }

  if (detectedWaterways.length > 0) {
    riskFlags.push("HIGH waterway exposure");

    // Generate specific planning note based on detected water features
    const waterFeatures = detectedWaterways.join('/');
    planningNotes.push(`${waterFeatures.charAt(0).toUpperCase() + waterFeatures.slice(1)} boundary requires conservative drift planning.`);
  }

  if (input.boundaries?.toLowerCase().includes("crop")) {
    riskFlags.push("HIGH crop sensitivity exposure");
    planningNotes.push("Susceptible crop boundary requires strict boundary discipline.");
  }

  if (input.weather?.windKmh !== undefined) {
    planningNotes.push(`Weather input received: wind ${input.weather.windKmh} km/h.`);
  }

  if (input.weather?.temperatureC !== undefined) {
    planningNotes.push(`Weather input received: temperature ${input.weather.temperatureC}C.`);
  }

  if (input.terrain) {
    planningNotes.push(`Terrain context: ${input.terrain}`);
  }

  if (input.target) {
    planningNotes.push(`Target context: ${input.target}`);
  }

  return {
    status: "connected",
    engine: "v2",
    riskAssessment: riskFlags.length > 0 ? riskFlags : ["No major contextual risks detected"],
    planningNotes,
    manualReview: [
      "Verified label-based planning not yet connected to vault documents",
    ],
  };
}
