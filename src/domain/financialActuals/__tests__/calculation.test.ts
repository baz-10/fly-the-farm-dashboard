import {
  calculateFinancialActualV1,
  calculateLineAmount,
} from '../calculation';
import {
  formatDecimal,
  parseCanonicalDecimal,
  roundHalfAwayFromZero,
} from '../decimal';

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  formulaVersion: 'FINANCIAL_ACTUAL_V1' as const,
  currencyCode: 'AUD',
  revenue: { mode: 'HOURLY' as const, hourlyRate: '100.0000' },
  workEntries: [
    { workDate: '2026-08-20', actualWorkHours: '8.5000' },
    { workDate: '2026-08-21', actualWorkHours: '0.0000' },
    { workDate: '2026-08-22', actualWorkHours: '1.5000' },
  ],
  costLines: [
    { id: 'labour', category: 'LABOUR' as const, quantity: '3.000000', unitCost: '0.333333' },
    { id: 'product', category: 'PRODUCT' as const, quantity: '1.000000', unitCost: '1.0050' },
    { id: 'travel', category: 'TRAVEL' as const, quantity: '2.000000', unitCost: '10.0000' },
    { id: 'aircraft', category: 'AIRCRAFT_EQUIPMENT' as const, quantity: '1.000000', unitCost: '25.0000' },
    { id: 'other', category: 'OTHER' as const, quantity: '1.000000', unitCost: '3.0000' },
  ],
  ...overrides,
});

describe('canonical decimal authority preview', () => {
  test.each([
    ['1.0050', 2, '1.01'],
    ['-1.0050', 2, '-1.01'],
    ['0.0049', 2, '0.00'],
    ['999999999999.9950', 2, '1000000000000.00'],
  ])('rounds %s to %i places half away from zero', (source, scale, expected) => {
    const parsed = parseCanonicalDecimal(source, 19, 4, { allowNegative: true });
    expect(formatDecimal(roundHalfAwayFromZero(parsed, scale), scale)).toBe(expected);
  });

  test.each([
    ['1.000000', '1.0050', '1.0100'],
    ['3.000000', '0.333333', '1.0000'],
    ['0.000000', '999.9999', '0.0000'],
  ])('rounds quantity %s × rate %s once at the line boundary', (quantity, unitCost, expected) => {
    expect(calculateLineAmount(quantity, unitCost, 2)).toBe(expected);
  });

  test.each(['', 'NaN', 'Infinity', '1e3', '-0.01', '+1.00', '1.00000', '12345678901234567890.0000'])(
    'rejects malformed or out-of-domain money %s',
    value => expect(() => parseCanonicalDecimal(value, 19, 4)).toThrow('FINANCIAL_ACTUAL_NUMERIC_INVALID'),
  );
});

describe('FINANCIAL_ACTUAL_V1', () => {
  test('counts only distinct positive-work dates and sums hours exactly', () => {
    const result = calculateFinancialActualV1(baseInput());
    expect(result.operationalDays).toBe(2);
    expect(result.totalHours).toBe('10.0000');
    expect(result.revenue).toBe('1000.0000');
  });

  test('calculates every rounded category, total cost, gross profit and ratios', () => {
    const result = calculateFinancialActualV1(baseInput());
    expect(result.lineAmounts).toEqual({ labour: '1.0000', product: '1.0100', travel: '20.0000', aircraft: '25.0000', other: '3.0000' });
    expect(result.categoryTotals).toEqual({ LABOUR: '1.0000', PRODUCT: '1.0100', TRAVEL: '20.0000', AIRCRAFT_EQUIPMENT: '25.0000', OTHER: '3.0000' });
    expect(result.totalCost).toBe('50.0100');
    expect(result.grossProfit).toBe('949.9900');
    expect(result.grossMarginPercentage).toBe('94.9990');
    expect(result.effectiveHourlyRevenue).toBe('100.0000');
  });

  test('calculates area revenue without using elapsed calendar days', () => {
    const result = calculateFinancialActualV1(baseInput({
      revenue: { mode: 'AREA', actualHectares: '12.345678', ratePerHectare: '20.0000' },
      costLines: [],
    }));
    expect(result.revenue).toBe('246.9100');
    expect(result.operationalDays).toBe(2);
  });

  test('requires exact governed provenance for manual revenue', () => {
    const result = calculateFinancialActualV1(baseInput({
      revenue: {
        mode: 'MANUAL',
        manualRevenue: '1250.00',
        provenance: {
          fieldPath: 'revenue/manualRevenue',
          provenanceClass: 'MANUAL_FINANCIAL_INPUT',
          effectiveValue: '1250.00',
          unitCode: 'AUD',
        },
      },
    }));
    expect(result.revenue).toBe('1250.0000');
    expect(() => calculateFinancialActualV1(baseInput({ revenue: { mode: 'MANUAL', manualRevenue: '1250.00' } }))).toThrow('FINANCIAL_ACTUAL_REVENUE_PROVENANCE_REQUIRED');
  });

  test('returns null for undefined ratios', () => {
    const zeroRevenue = calculateFinancialActualV1(baseInput({ revenue: { mode: 'MANUAL', manualRevenue: '0.00', provenance: { fieldPath: 'revenue/manualRevenue', provenanceClass: 'MANUAL_FINANCIAL_INPUT', effectiveValue: '0.00', unitCode: 'AUD' } } }));
    expect(zeroRevenue.grossMarginPercentage).toBeNull();
    const zeroHours = calculateFinancialActualV1(baseInput({ workEntries: [] }));
    expect(zeroHours.effectiveHourlyRevenue).toBeNull();
  });

  test.each([
    { currencyCode: 'USD' },
    { workEntries: [{ workDate: '2026-08-20', actualWorkHours: '-0.0001' }] },
    { costLines: [{ id: 'bad', category: 'OTHER', quantity: '-1.000000', unitCost: '1.0000' }] },
  ])('fails closed for unsupported or invalid authority input %#', override => {
    expect(() => calculateFinancialActualV1(baseInput(override))).toThrow();
  });

  test.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10'])('rejects impossible calendar date %s', workDate => {
    expect(() => calculateFinancialActualV1(baseInput({ workEntries: [{ workDate, actualWorkHours: '1.0000' }] })))
      .toThrow('FINANCIAL_ACTUAL_DATE_INVALID');
  });

  test('rejects aggregate hours that exceed numeric(10,4)', () => {
    expect(() => calculateFinancialActualV1(baseInput({
      workEntries: [
        { workDate: '2026-08-20', actualWorkHours: '999999.9999' },
        { workDate: '2026-08-21', actualWorkHours: '0.0001' },
      ],
    }))).toThrow('FINANCIAL_ACTUAL_NUMERIC_INVALID');
  });

  test('rejects aggregate and derived money that exceed numeric(19,4)', () => {
    const maxLine = { category: 'OTHER' as const, quantity: '100.000000', unitCost: '9999999999999.999900' };
    expect(() => calculateFinancialActualV1(baseInput({
      revenue: { mode: 'MANUAL', manualRevenue: '0.00', provenance: { fieldPath: 'revenue/manualRevenue', provenanceClass: 'MANUAL_FINANCIAL_INPUT', effectiveValue: '0.00', unitCode: 'AUD' } },
      costLines: [{ id: 'one', ...maxLine }, { id: 'two', ...maxLine }],
    }))).toThrow('FINANCIAL_ACTUAL_NUMERIC_INVALID');
  });
});
