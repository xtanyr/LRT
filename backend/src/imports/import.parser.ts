export interface ParsedRow {
  metricName: string;
  metricId?: number;
  rawValue: string;
  parsedValue?: number;
  problem?: string;
}

export interface SheetPreview {
  name: string;
  detectedMonth?: number;
  detectedYear?: number;
  rows: ParsedRow[];
  revenue?: number;
  problems: string[];
}

export interface ImportPreview {
  coffeeShopId: number;
  sheets: SheetPreview[];
}

export const MONTH_RU: Record<string, number> = {
  январь: 1,
  февраль: 2,
  март: 3,
  апрель: 4,
  май: 5,
  июнь: 6,
  июль: 7,
  август: 8,
  сентябрь: 9,
  октябрь: 10,
  ноябрь: 11,
  декабрь: 12,
};

export function detectMonthYear(sheetName: string): { month?: number; year?: number } {
  const lower = sheetName.toLowerCase();
  let month: number | undefined;
  let year: number | undefined;

  for (const [name, m] of Object.entries(MONTH_RU)) {
    if (lower.includes(name)) {
      month = m;
      break;
    }
  }

  const yearMatch = lower.match(/(20\d{2})/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  const numMatch = lower.match(/(\d{1,2})[\/\-\.](\d{2,4})/);
  if (numMatch && !month) {
    const m = parseInt(numMatch[1], 10);
    const y = parseInt(numMatch[2], 10);
    if (m >= 1 && m <= 12) month = m;
    year = y < 100 ? 2000 + y : y;
  }

  return { month, year };
}

export function cleanNumericString(raw: string): { value: number | null; problem?: string } {
  const original = raw.trim();
  if (!original || original === '-') return { value: null };
  const invalid = () => ({ value: null, problem: `Некорректное число: "${original}"` });
  if (/[\r\n]/.test(original)) return invalid();
  let text = original.replace(/[\u00a0\u202f]/g, ' ');
  const percent = text.endsWith('%');
  if (percent) text = text.slice(0, -1).trim();
  text = text.replace(/\s*[₽$€£]$/, '').trim();
  // Only a complete decimal or consistently grouped thousands are accepted.
  if (!/^[+-]?(?:\d+|\d{1,3}(?: \d{3})+)(?:[.,]\d+)?$/.test(text)) return invalid();
  const value = Number(text.replace(/ /g, '').replace(',', '.'));
  if (!Number.isFinite(value)) return invalid();
  return percent
    ? { value, problem: `Процентный знак в числовом поле: "${original}"; значение сохранено в процентах (0–100)` }
    : { value };
}

/**
 * Multipart parsers hand over non-ASCII upload names as latin1-decoded UTF-8 bytes
 * («Ð›ÐµÐ½Ð°.xlsx» instead of «Лена.xlsx»). Restores the name when it is such a mis-decoding.
 */
export function decodeUploadFileName(name: string): string {
  if (!/[\u0080-ÿ]/.test(name) || /[^\u0000-ÿ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('�') ? name : decoded;
}
