import {
  CanonicalDecimal,
  addDecimals,
  assertDecimalFits,
  divideAndRound,
  formatDecimal,
  isPositive,
  isZero,
  multiplyDecimals,
  parseCanonicalDecimal,
  roundHalfAwayFromZero,
  subtractDecimals,
} from './decimal';

export const FINANCIAL_ACTUAL_FORMULA_VERSION = 'FINANCIAL_ACTUAL_V1' as const;
export type CostCategory = 'LABOUR' | 'PRODUCT' | 'TRAVEL' | 'AIRCRAFT_EQUIPMENT' | 'OTHER';
export type RevenueInput =
  | { mode: 'HOURLY'; hourlyRate: string }
  | { mode: 'AREA'; actualHectares: string; ratePerHectare: string }
  | { mode: 'MANUAL'; manualRevenue: string; provenance?: RevenueProvenance };

export type RevenueProvenance = {
  fieldPath: string;
  provenanceClass: 'MANUAL_FINANCIAL_INPUT' | 'MANUAL_OVERRIDE';
  effectiveValue: string;
  unitCode: string;
};

export type FinancialActualCalculationInput = {
  formulaVersion: typeof FINANCIAL_ACTUAL_FORMULA_VERSION;
  currencyCode: string;
  revenue: RevenueInput;
  workEntries: Array<{ workDate: string; actualWorkHours: string }>;
  costLines: Array<{ id: string; category: CostCategory; quantity: string; unitCost: string }>;
};

export type FinancialActualCalculation = {
  formulaVersion: typeof FINANCIAL_ACTUAL_FORMULA_VERSION;
  currencyCode: 'AUD';
  operationalDays: number;
  totalHours: string;
  revenue: string;
  lineAmounts: Record<string, string>;
  categoryTotals: Record<CostCategory, string>;
  totalCost: string;
  grossProfit: string;
  grossMarginPercentage: string | null;
  effectiveHourlyRevenue: string | null;
};

const MONEY_SCALE = 2;
const MONEY_STORAGE_SCALE = 4;
const zero = (scale: number): CanonicalDecimal => ({ coefficient: BigInt(0), scale });
const money = (value: CanonicalDecimal): string => formatDecimal(roundHalfAwayFromZero(value, MONEY_SCALE), MONEY_STORAGE_SCALE);
const boundedMoney = (value: CanonicalDecimal): CanonicalDecimal => assertDecimalFits(value, 19, MONEY_STORAGE_SCALE);

function isCanonicalCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

export function calculateLineAmount(quantity: string, unitCost: string, currencyMinorUnits = MONEY_SCALE): string {
  const parsedQuantity = parseCanonicalDecimal(quantity, 18, 6);
  const parsedRate = parseCanonicalDecimal(unitCost, 19, 6);
  return formatDecimal(roundHalfAwayFromZero(multiplyDecimals(parsedQuantity, parsedRate), currencyMinorUnits), MONEY_STORAGE_SCALE);
}

function revenueFor(input: FinancialActualCalculationInput, totalHours: CanonicalDecimal): CanonicalDecimal {
  if (input.revenue.mode === 'HOURLY') {
    return roundHalfAwayFromZero(multiplyDecimals(parseCanonicalDecimal(input.revenue.hourlyRate, 19, 6), totalHours), MONEY_SCALE);
  }
  if (input.revenue.mode === 'AREA') {
    return roundHalfAwayFromZero(multiplyDecimals(
      parseCanonicalDecimal(input.revenue.actualHectares, 18, 6),
      parseCanonicalDecimal(input.revenue.ratePerHectare, 19, 6),
    ), MONEY_SCALE);
  }
  const provenance = input.revenue.provenance;
  if (!provenance || provenance.fieldPath !== 'revenue/manualRevenue' ||
      !['MANUAL_FINANCIAL_INPUT', 'MANUAL_OVERRIDE'].includes(provenance.provenanceClass) ||
      provenance.unitCode !== input.currencyCode || provenance.effectiveValue !== input.revenue.manualRevenue) {
    throw new Error('FINANCIAL_ACTUAL_REVENUE_PROVENANCE_REQUIRED');
  }
  const value = parseCanonicalDecimal(input.revenue.manualRevenue, 19, 4);
  let minorUnitDivisor = BigInt(1);
  for (let index = MONEY_SCALE; index < value.scale; index += 1) minorUnitDivisor *= BigInt(10);
  if (value.scale > MONEY_SCALE && value.coefficient % minorUnitDivisor !== BigInt(0)) {
    throw new Error('FINANCIAL_ACTUAL_MONEY_MINOR_UNIT_INVALID');
  }
  return roundHalfAwayFromZero(value, MONEY_SCALE);
}

export function calculateFinancialActualV1(input: FinancialActualCalculationInput): FinancialActualCalculation {
  if (input.formulaVersion !== FINANCIAL_ACTUAL_FORMULA_VERSION) throw new Error('FINANCIAL_ACTUAL_FORMULA_UNSUPPORTED');
  if (input.currencyCode !== 'AUD') throw new Error('FINANCIAL_ACTUAL_CURRENCY_UNSUPPORTED');

  let totalHours = zero(4);
  const positiveDates = new Set<string>();
  for (const entry of input.workEntries) {
    if (!isCanonicalCalendarDate(entry.workDate)) throw new Error('FINANCIAL_ACTUAL_DATE_INVALID');
    const hours = parseCanonicalDecimal(entry.actualWorkHours, 10, 4);
    totalHours = addDecimals(totalHours, hours);
    if (isPositive(hours)) positiveDates.add(entry.workDate);
  }
  totalHours = assertDecimalFits(totalHours, 10, 4);

  const revenue = boundedMoney(revenueFor(input, totalHours));
  const categories: Record<CostCategory, CanonicalDecimal> = {
    LABOUR: zero(MONEY_SCALE), PRODUCT: zero(MONEY_SCALE), TRAVEL: zero(MONEY_SCALE),
    AIRCRAFT_EQUIPMENT: zero(MONEY_SCALE), OTHER: zero(MONEY_SCALE),
  };
  const lineAmounts: Record<string, string> = {};
  for (const line of input.costLines) {
    if (!(line.category in categories) || !line.id || line.id in lineAmounts) throw new Error('FINANCIAL_ACTUAL_COST_LINE_INVALID');
    const amountText = calculateLineAmount(line.quantity, line.unitCost, MONEY_SCALE);
    const amount = parseCanonicalDecimal(amountText, 19, MONEY_STORAGE_SCALE);
    lineAmounts[line.id] = amountText;
    categories[line.category] = boundedMoney(addDecimals(categories[line.category], amount));
  }
  const totalCost = boundedMoney(Object.values(categories).reduce(addDecimals, zero(MONEY_SCALE)));
  const grossProfit = boundedMoney(subtractDecimals(revenue, totalCost));
  const hundred: CanonicalDecimal = { coefficient: BigInt(100), scale: 0 };
  const grossMargin = isZero(revenue) ? null : assertDecimalFits(divideAndRound(multiplyDecimals(grossProfit, hundred), revenue, 4), 19, 4);
  const effectiveHourly = isZero(totalHours) ? null : boundedMoney(divideAndRound(revenue, totalHours, MONEY_SCALE));

  return {
    formulaVersion: FINANCIAL_ACTUAL_FORMULA_VERSION,
    currencyCode: 'AUD',
    operationalDays: positiveDates.size,
    totalHours: formatDecimal(totalHours, 4),
    revenue: money(revenue),
    lineAmounts,
    categoryTotals: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, money(value)])) as Record<CostCategory, string>,
    totalCost: money(totalCost),
    grossProfit: money(grossProfit),
    grossMarginPercentage: grossMargin ? formatDecimal(grossMargin, 4) : null,
    effectiveHourlyRevenue: effectiveHourly ? formatDecimal(effectiveHourly, MONEY_STORAGE_SCALE) : null,
  };
}
