const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  if (!DATE_PATTERN.test(dateKey)) {
    throw new Error(`Invalid local date: ${dateKey}`);
  }
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function compareDateKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

export function isDue(dateKey: string, today = localDateKey()): boolean {
  return compareDateKeys(dateKey, today) <= 0;
}

export function daysBetween(startKey: string, endKey: string): number {
  const start = parseDateKey(startKey).getTime();
  const end = parseDateKey(endKey).getTime();
  return Math.round((end - start) / 86_400_000);
}

export function formatLocalDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const monthDay = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
  }).format(date);
  const weekday = new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
  }).format(date);
  return `${monthDay} · ${weekday}`;
}
