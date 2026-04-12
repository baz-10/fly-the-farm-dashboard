export type RouteCategory = "A" | "B" | "C" | "D" | "E" | "F";

export interface InvokeInput {
  question: string;
  chemical?: string;
  aircraft?: string;
  target?: string;
  state?: string;
  terrain?: string;
  weather?: {
    windKmh?: number;
    temperatureC?: number;
    rainForecast?: string;
  };
  boundaries?: string;
}

export interface RouteDecision {
  category: RouteCategory;
  route: string[];
  requiresNumeric: boolean;
  requiresCompliance: boolean;
  challenger: boolean;
}
