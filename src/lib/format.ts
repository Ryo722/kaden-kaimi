export function formatYen(value: number | null, fallback = "—"): string {
  if (value === null || !Number.isFinite(value)) return fallback;
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatIsoDate(iso: string): string {
  const match = ISO_DATE_PATTERN.exec(iso);
  if (match === null) return iso;
  const [, year, month, day] = match;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

export function formatPercent(ratio: number, digits = 1): string {
  const sign = ratio > 0 ? "+" : "";
  return `${sign}${(ratio * 100).toFixed(digits)}%`;
}
