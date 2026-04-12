export function explainCategory(category: string): string {
  switch (category) {
    case "A":
      return "This question has been treated as a knowledge or fact lookup request.";
    case "B":
      return "This question has been treated as a general chemical or product information request.";
    case "C":
      return "This question has been treated as a spray planning request.";
    case "D":
      return "This question has been treated as an execution band calculation request.";
    case "E":
      return "This question has been treated as a spray setup / preset request.";
    case "F":
      return "This question has been treated as a compliance or regulatory check.";
    default:
      return "Routing category could not be determined.";
  }
}

export function explainRequiresNumeric(requiresNumeric: boolean): string {
  if (requiresNumeric) {
    return "The system is preparing numeric spray presets for water rate, speed, height, and droplet class.";
  }
  return "Numeric spray presets are not required for this question.";
}

export function explainRequiresCompliance(requiresCompliance: boolean): string {
  if (requiresCompliance) {
    return "Compliance checks are needed because legal, boundary, or permission risks are present.";
  }
  return "No elevated compliance checks required for this question.";
}

export function explainChallenger(challenger: boolean): string {
  if (challenger) {
    return "A second-pass review is running because this job has high-consequence factors such as waterways or sensitive boundaries.";
  }
  return "No second-pass challenger review is required.";
}
