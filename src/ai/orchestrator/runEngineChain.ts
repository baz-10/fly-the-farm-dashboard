import { InvokeInput } from "../types/invoke";
import { routeQuestion } from "./routeQuestion";
import { runChemicalIntelligence } from "../engines/runChemicalIntelligence";
import { runSprayIntelligenceV2 } from "../engines/runSprayIntelligenceV2";
import { runSprayIntelligenceV3 } from "../engines/runSprayIntelligenceV3";
import { runSprayIntelligenceV4 } from "../engines/runSprayIntelligenceV4";
import { runChallenger } from "../engines/runChallenger";

export async function runEngineChain(input: InvokeInput) {
  // 1. Route the question
  const decision = routeQuestion(input);

  // 2. Base output object
  const result: any = {
    routing: decision,
    v1: null,
    v2: null,
    v3: null,
    v4: null,
    challenger: null,
  };

  // --- v1 (Chemical facts layer) ---
  if (decision.route.includes("v1")) {
    result.v1 = await runChemicalIntelligence(input);
  }

  // --- v2 (Planning layer) ---
  if (decision.route.includes("v2")) {
    result.v2 = await runSprayIntelligenceV2(input);
  }

  // --- v3 (Execution layer) ---
  if (decision.route.includes("v3")) {
    result.v3 = await runSprayIntelligenceV3(input);
  }

  // --- v4 (Numeric presets) ---
  if (decision.requiresNumeric && decision.route.includes("v4")) {
    result.v4 = await runSprayIntelligenceV4(input);
  }

  // --- Challenger ---
  if (decision.challenger) {
    result.challenger = await runChallenger(input, result);
  }

  return result;
}
