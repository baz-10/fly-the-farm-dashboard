import { FinancialActualCalculationInput } from './calculation';

export type FinancialActualCalculationFixture = {
  name: string;
  input: FinancialActualCalculationInput;
  expected: {
    operationalDays: number;
    totalHours: string;
    revenue: string;
    totalCost: string;
    grossProfit: string;
    grossMarginPercentage: string | null;
    effectiveHourlyRevenue: string | null;
  };
};

const manualProvenance = (value: string) => ({
  fieldPath: 'revenue/manualRevenue',
  provenanceClass: 'MANUAL_FINANCIAL_INPUT' as const,
  effectiveValue: value,
  unitCode: 'AUD',
});

export const FINANCIAL_ACTUAL_CALCULATION_FIXTURES: FinancialActualCalculationFixture[] = [
  {
    name: 'hourly with distinct positive days and all cost categories',
    input: {
      formulaVersion: 'FINANCIAL_ACTUAL_V1', currencyCode: 'AUD',
      revenue: { mode: 'HOURLY', hourlyRate: '100.000000' },
      workEntries: [
        { workDate: '2026-08-20', actualWorkHours: '8.5000' },
        { workDate: '2026-08-20', actualWorkHours: '1.5000' },
        { workDate: '2026-08-21', actualWorkHours: '0.0000' },
      ],
      costLines: [
        { id: 'l', category: 'LABOUR', quantity: '3.000000', unitCost: '0.333333' },
        { id: 'p', category: 'PRODUCT', quantity: '1.000000', unitCost: '1.005000' },
        { id: 't', category: 'TRAVEL', quantity: '2.000000', unitCost: '10.000000' },
        { id: 'a', category: 'AIRCRAFT_EQUIPMENT', quantity: '1.000000', unitCost: '25.000000' },
        { id: 'o', category: 'OTHER', quantity: '1.000000', unitCost: '3.000000' },
      ],
    },
    expected: { operationalDays: 1, totalHours: '10.0000', revenue: '1000.0000', totalCost: '50.0100', grossProfit: '949.9900', grossMarginPercentage: '94.9990', effectiveHourlyRevenue: '100.0000' },
  },
  {
    name: 'area with high quantity and low rate',
    input: {
      formulaVersion: 'FINANCIAL_ACTUAL_V1', currencyCode: 'AUD',
      revenue: { mode: 'AREA', actualHectares: '12.345678', ratePerHectare: '20.000000' },
      workEntries: [{ workDate: '2026-08-20', actualWorkHours: '3.0000' }],
      costLines: [{ id: 'high-low', category: 'PRODUCT', quantity: '999999999999.999999', unitCost: '0.000001' }],
    },
    expected: { operationalDays: 1, totalHours: '3.0000', revenue: '246.9100', totalCost: '1000000.0000', grossProfit: '-999753.0900', grossMarginPercentage: '-404905.8726', effectiveHourlyRevenue: '82.3000' },
  },
  {
    name: 'manual zero revenue and zero hours with low quantity high rate',
    input: {
      formulaVersion: 'FINANCIAL_ACTUAL_V1', currencyCode: 'AUD',
      revenue: { mode: 'MANUAL', manualRevenue: '0.0000', provenance: manualProvenance('0.0000') },
      workEntries: [{ workDate: '2026-08-20', actualWorkHours: '0.0000' }],
      costLines: [{ id: 'low-high', category: 'OTHER', quantity: '0.000001', unitCost: '9999999999999.999999' }],
    },
    expected: { operationalDays: 0, totalHours: '0.0000', revenue: '0.0000', totalCost: '10000000.0000', grossProfit: '-10000000.0000', grossMarginPercentage: null, effectiveHourlyRevenue: null },
  },
];
