/**
 * Деньги внутри сервиса — целые копейки. Рубли — только на входе (внешний API) и в ответах.
 */

function parseNumber(raw: unknown): number | null {
  const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw.trim()) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Сумма из внешнего API: число или строка с числом ("250.10"). */
export function parseRub(raw: unknown): number {
  const value = parseNumber(raw);
  if (value === null || value < 0) throw new Error(`invalid amount: ${JSON.stringify(raw)}`);
  return value;
}

export function parsePercent(raw: unknown): number {
  const value = parseNumber(raw);
  if (value === null || value < 0 || value > 100) throw new Error(`invalid discountPercent: ${JSON.stringify(raw)}`);
  return value;
}

/** Рубли → копейки. Доли копейки отбрасываются: деньги клиенту не досчитываем. */
export function toKop(rub: number): number {
  // toFixed убирает шум double: 1217.61 * 100 = 121760.99999999999
  return Math.floor(Number((rub * 100).toFixed(4)));
}

/** Копейки → рубли для ответа API. */
export function fromKop(kop: number): number {
  return kop / 100;
}

export function applyDiscount(kop: number, percent: number): number {
  return Math.floor(Number(((kop * (100 - percent)) / 100).toFixed(4)));
}
