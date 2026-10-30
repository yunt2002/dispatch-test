import type { ComparisonShipment } from "./comparison-workbook";

export type ComparisonRoute = { vehicle: string; stops: string[]; distance: number; minutes: number; toll: number | null; fuel: number | null };
export type ComparisonResult = {
  rows: ComparisonShipment[];
  human: ComparisonRoute[];
  ai: ComparisonRoute[];
  aiNote: string;
  warnings: string[];
};
