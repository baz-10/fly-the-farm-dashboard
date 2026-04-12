import { InvokeInput, RouteDecision } from "../types/invoke";

export function routeQuestion(input: InvokeInput): RouteDecision {
  const q = input.question.toLowerCase();

  let category: RouteDecision["category"] = "B";
  let requiresNumeric = false;
  let requiresCompliance = false;
  let challenger = false;

  const hasExecutionIntent =
    q.includes("rate") ||
    q.includes("speed") ||
    q.includes("height") ||
    q.includes("settings") ||
    q.includes("preset") ||
    q.includes("complete answer") ||
    q.includes("most complete") ||
    q.includes("safest") ||
    q.includes("spray plan") ||
    q.includes("how should i spray") ||
    q.includes("what should i use");

  const hasComplianceIntent =
    q.includes("legal") ||
    q.includes("can i") ||
    q.includes("allowed") ||
    q.includes("regulation") ||
    q.includes("permit") ||
    q.includes("approval") ||
    q.includes("casa") ||
    q.includes("apvma");

  const hasFactIntent =
    q.includes("what is") ||
    q.includes("explain") ||
    q.includes("label") ||
    q.includes("sds") ||
    q.includes("withholding");

  if (hasExecutionIntent) {
    category = "E";
    requiresNumeric = true;
  } else if (hasComplianceIntent) {
    category = "F";
    requiresCompliance = true;
  } else if (hasFactIntent) {
    category = "A";
  } else {
    category = "B";
  }

  if (
    input.boundaries?.toLowerCase().includes("creek") ||
    input.boundaries?.toLowerCase().includes("water") ||
    input.boundaries?.toLowerCase().includes("crop")
  ) {
    challenger = true;
    requiresCompliance = true;
  }

  return {
    category,
    route: ["v1", "v2", "v3", "v4", "challenger"],
    requiresNumeric,
    requiresCompliance,
    challenger,
  };
}
