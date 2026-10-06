import { BadRequestException } from '@nestjs/common';
import { cleanNumericString } from '../imports/import.parser';
export function numberValue(raw: unknown, label: string, nullable = false): number | null {
  if (raw === null || raw === undefined || raw === '') {
    if (nullable) return null;
    throw new BadRequestException(`Заполните поле «${label}»`);
  }
  const parsed = cleanNumericString(String(raw));
  if (parsed.value === null || parsed.problem || Math.abs(parsed.value) > 9999999999.99 || Math.abs(parsed.value * 100 - Math.round(parsed.value * 100)) > 0.00001) throw new BadRequestException(`Некорректное число в поле «${label}»; допустимо до двух знаков после запятой`);
  return parsed.value;
}
export function nonNegativeNumberValue(raw: unknown, label: string, nullable = false): number | null {
  const value = numberValue(raw, label, nullable);
  if (value !== null && value < 0) throw new BadRequestException(`Значение в поле «${label}» не может быть отрицательным. Укажите 0 или положительное число.`);
  return value;
}
export function positiveId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id < 1) throw new BadRequestException('Некорректный идентификатор');
  return id;
}
export function meaningfulText(raw: unknown) {
  return typeof raw === 'string' && raw.trim().length >= 3 && /[\p{L}\p{N}]/u.test(raw);
}
