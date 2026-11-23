const calendar = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Guayaquil",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const localDate = (date: Date) => calendar.format(date);

const DAY_MS = 86_400_000;

// Count local weekdays after the start date, including the end date.
// Holidays can be subtracted here when an institutional calendar is available.
export function businessDays(start: Date, end: Date): number {
  const first = new Date(localDate(start));
  const span = (Date.parse(localDate(end)) - first.getTime()) / DAY_MS;
  if (span <= 0) return 0;

  let days = Math.floor(span / 7) * 5;
  for (let offset = 1; offset <= span % 7; offset++) {
    const weekday = (first.getUTCDay() + offset) % 7;
    if (weekday >= 1 && weekday <= 5) days++;
  }
  return days;
}

export interface Limits {
  warning_days: number;
  critical_days: number;
}

export function trafficLight(
  days: number,
  limits: Limits,
): "green" | "yellow" | "red" {
  if (days >= limits.critical_days) return "red";
  if (days >= limits.warning_days) return "yellow";
  return "green";
}
