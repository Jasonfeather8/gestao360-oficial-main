import type { TipoAjuste } from '../types';

type NumericInput = number | string | null | undefined;

const INVALID_NUMBER = 'Valor numérico inválido.';
const MAX_PERCENTAGE = 100;

const parseNumericString = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Valor obrigatório.');

  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  if (!/^-?(?:\d+|\d*\.\d+)$/.test(normalized)) throw new Error(INVALID_NUMBER);

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(INVALID_NUMBER);
  return parsed;
};

export const parseFinancialInput = (
  value: NumericInput,
  options: { required?: boolean; allowNegative?: boolean; maxFractionDigits?: number } = {},
): number => {
  const { required = false, allowNegative = false, maxFractionDigits } = options;
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    if (required) throw new Error('Valor obrigatório.');
    return 0;
  }

  const parsed = typeof value === 'number' ? value : parseNumericString(value);
  if (!Number.isFinite(parsed)) throw new Error(INVALID_NUMBER);
  if (!allowNegative && parsed < 0) throw new Error('Valores negativos não são permitidos.');
  if (maxFractionDigits !== undefined) {
    const scale = 10 ** maxFractionDigits;
    if (Math.round(parsed * scale) !== parsed * scale) {
      throw new Error(`O valor deve ter no máximo ${maxFractionDigits} casas decimais.`);
    }
  }
  return parsed;
};

export const roundToCents = (value: number): number => {
  if (!Number.isFinite(value)) throw new Error(INVALID_NUMBER);
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

export const toCents = (value: NumericInput, required = false): number => {
  const parsed = parseFinancialInput(value, { required, maxFractionDigits: 2 });
  return Math.round(parsed * 100);
};

export const validateAdjustment = (
  value: NumericInput,
  type: TipoAjuste | string | null | undefined,
  fieldName = 'Ajuste',
): number => {
  const parsed = parseFinancialInput(value, { required: true, maxFractionDigits: 2 });
  if (type !== 'valor' && type !== 'porcentagem') throw new Error(`${fieldName}: tipo inválido.`);
  if (type === 'porcentagem' && parsed > MAX_PERCENTAGE) {
    throw new Error(`${fieldName}: o percentual deve estar entre 0 e 100.`);
  }
  return parsed;
};

export const calculateAdjustmentAmount = (
  value: NumericInput,
  type: TipoAjuste | string | null | undefined,
  base: NumericInput,
): number => {
  const effectiveType = type === null || type === undefined || type === '' ? 'valor' : type;
  const adjustment = value === null || value === undefined || value === ''
    ? 0
    : validateAdjustment(value, effectiveType, 'Ajuste');
  const baseValue = parseFinancialInput(base, { required: true, maxFractionDigits: 2 });
  const amount = effectiveType === 'porcentagem' ? (toCents(baseValue) * adjustment) / 10000 : toCents(adjustment) / 100;
  return roundToCents(amount);
};

export const calculateFinalAmount = ({
  original,
  discount,
  discountType,
  increase,
  increaseType,
  fee = 0,
}: {
  original: NumericInput;
  discount?: NumericInput;
  discountType?: TipoAjuste | string | null;
  increase?: NumericInput;
  increaseType?: TipoAjuste | string | null;
  fee?: NumericInput;
}): number => {
  const originalCents = toCents(original, true);
  const discountCents = Math.round(calculateAdjustmentAmount(discount, discountType || 'valor', original) * 100);
  const increaseCents = Math.round(calculateAdjustmentAmount(increase, increaseType || 'valor', original) * 100);
  const feeCents = toCents(fee);
  const finalCents = originalCents - discountCents + increaseCents + feeCents;
  if (finalCents < 0) throw new Error('O valor final não pode ser negativo.');
  return finalCents / 100;
};

