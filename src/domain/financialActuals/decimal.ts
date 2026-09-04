export type CanonicalDecimal = Readonly<{ coefficient: bigint; scale: number }>;

const INVALID = 'FINANCIAL_ACTUAL_NUMERIC_INVALID';
const tenPow = (scale: number): bigint => {
  let result = BigInt(1);
  for (let index = 0; index < scale; index += 1) result *= BigInt(10);
  return result;
};

export function parseCanonicalDecimal(
  value: string,
  maxPrecision: number,
  maxScale: number,
  options: { allowNegative?: boolean } = {},
): CanonicalDecimal {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) throw new Error(INVALID);
  if (!options.allowNegative && value.startsWith('-')) throw new Error(INVALID);
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const [whole, fraction = ''] = unsigned.split('.');
  if (fraction.length > maxScale || whole.length + fraction.length > maxPrecision) throw new Error(INVALID);
  const coefficient = BigInt(`${value.startsWith('-') ? '-' : ''}${whole}${fraction}`);
  return { coefficient, scale: fraction.length };
}

export function roundHalfAwayFromZero(value: CanonicalDecimal, targetScale: number): CanonicalDecimal {
  if (!Number.isInteger(targetScale) || targetScale < 0) throw new Error(INVALID);
  if (value.scale <= targetScale) return { coefficient: value.coefficient * tenPow(targetScale - value.scale), scale: targetScale };
  const divisor = tenPow(value.scale - targetScale);
  let quotient = value.coefficient / divisor;
  const remainder = value.coefficient < BigInt(0) ? -(value.coefficient % divisor) : value.coefficient % divisor;
  if (remainder * BigInt(2) >= divisor) quotient += value.coefficient < BigInt(0) ? BigInt(-1) : BigInt(1);
  return { coefficient: quotient, scale: targetScale };
}

export function formatDecimal(value: CanonicalDecimal, scale = value.scale): string {
  const rounded = roundHalfAwayFromZero(value, scale);
  const negative = rounded.coefficient < BigInt(0);
  const digits = (negative ? -rounded.coefficient : rounded.coefficient).toString().padStart(scale + 1, '0');
  const result = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative && rounded.coefficient !== BigInt(0) ? `-${result}` : result;
}

export function addDecimals(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient: left.coefficient * tenPow(scale - left.scale) + right.coefficient * tenPow(scale - right.scale),
    scale,
  };
}

export function subtractDecimals(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  return addDecimals(left, { coefficient: -right.coefficient, scale: right.scale });
}

export function multiplyDecimals(left: CanonicalDecimal, right: CanonicalDecimal): CanonicalDecimal {
  return { coefficient: left.coefficient * right.coefficient, scale: left.scale + right.scale };
}

export function divideAndRound(left: CanonicalDecimal, right: CanonicalDecimal, targetScale: number): CanonicalDecimal {
  if (right.coefficient === BigInt(0)) throw new Error(INVALID);
  const numerator = left.coefficient * tenPow(right.scale + targetScale + 1);
  const denominator = right.coefficient * tenPow(left.scale);
  return roundHalfAwayFromZero({ coefficient: numerator / denominator, scale: targetScale + 1 }, targetScale);
}

export function assertDecimalFits(value: CanonicalDecimal, maxPrecision: number, maxScale: number): CanonicalDecimal {
  const rounded = roundHalfAwayFromZero(value, maxScale);
  const digits = (rounded.coefficient < BigInt(0) ? -rounded.coefficient : rounded.coefficient).toString().length;
  if (digits > maxPrecision) throw new Error(INVALID);
  return rounded;
}

export const isPositive = (value: CanonicalDecimal): boolean => value.coefficient > BigInt(0);
export const isZero = (value: CanonicalDecimal): boolean => value.coefficient === BigInt(0);
