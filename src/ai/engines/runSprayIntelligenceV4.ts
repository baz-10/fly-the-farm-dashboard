import { InvokeInput } from "../types/invoke";

export async function runSprayIntelligenceV4(input: InvokeInput) {
  const aircraft = (input.aircraft || "").toUpperCase();
  const boundaries = input.boundaries?.toLowerCase() || "";
  const terrain = input.terrain?.toLowerCase() || "";
  const target = input.target?.toLowerCase() || "";

  const hasCreek = boundaries.includes("creek") || boundaries.includes("water");
  const hasCrop = boundaries.includes("crop");
  const denseTerrain =
    terrain.includes("dense") ||
    terrain.includes("drainage") ||
    terrain.includes("line");
  const woodyTarget = target.includes("woody");

  let numericPresetReadiness = "PROVISIONAL";
  const manualReview: string[] = [
    "UAV/drone permission requires verification.",
    "Verified source-backed numeric preset logic not yet connected to vault documents.",
  ];

  let waterRate = "Not generated";
  let speed = "Not generated";
  let height = "Not generated";
  let dropletClass = "Not generated";
  let boundaryMode = "Not generated";

  if (!aircraft) {
    return {
      status: "connected",
      engine: "v4",
      numericPresetReadiness: "MANUAL REVIEW REQUIRED",
      numericPreset: null,
      presetModifiers: [],
      manualReview: [...manualReview, "Aircraft not provided."],
    };
  }

  // Aircraft baseline presets
  if (aircraft === "T50") {
    waterRate = woodyTarget ? "30–35 L/ha" : "20–25 L/ha";
    speed = woodyTarget ? "12–16 km/h" : "18–22 km/h";
    height = woodyTarget ? "2.0–2.5 m" : "2.5–3.5 m";
  } else if (aircraft === "T100") {
    waterRate = woodyTarget ? "24–30 L/ha" : "16–22 L/ha";
    speed = woodyTarget ? "14–18 km/h" : "20–26 km/h";
    height = woodyTarget ? "2.0–2.5 m" : "2.5–3.5 m";
  } else {
    waterRate = woodyTarget ? "25–35 L/ha" : "18–25 L/ha";
    speed = woodyTarget ? "10–16 km/h" : "15–22 km/h";
    height = woodyTarget ? "2.0–2.5 m" : "2.5–3.5 m";
  }

  // Boundary mode / droplet logic
  if (hasCreek && hasCrop) {
    boundaryMode = "MAXIMUM";
    dropletClass = "Very Coarse";
  } else if (hasCreek || hasCrop) {
    boundaryMode = "TIGHT";
    dropletClass = "Very Coarse";
  } else {
    boundaryMode = "STANDARD";
    dropletClass = woodyTarget ? "Coarse to Very Coarse" : "Coarse";
  }

  const presetModifiers: string[] = [];

  if (denseTerrain) {
    presetModifiers.push("Dense/variable terrain pushes settings toward the more conservative end of the band.");
  }

  if (hasCreek || hasCrop) {
    presetModifiers.push("Sensitive boundaries push droplet strategy coarser and execution slower/lower.");
  }

  if (woodyTarget) {
    presetModifiers.push("Woody weed context pushes water rate upward and speed downward.");
  }

  return {
    status: "connected",
    engine: "v4",
    numericPresetReadiness,
    numericPreset: {
      aircraft,
      waterRate,
      speed,
      height,
      dropletClass,
      boundaryMode,
    },
    presetModifiers,
    manualReview,
  };
}
